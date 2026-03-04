/**
 * TITAN — Proactive Monitor
 * TITAN watches for file changes, schedule triggers, and webhook events —
 * then acts autonomously without being asked first.
 * This is TITAN's "always-on JARVIS mode": watching your world and reacting.
 */
import { watch, type FSWatcher } from 'fs';
import { join } from 'path';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Monitor';
const MONITORS_PATH = join(TITAN_HOME, 'monitors.json');

// ─── Types ────────────────────────────────────────────────────────
export type TriggerType = 'file_change' | 'schedule' | 'webhook';

export interface TitanMonitor {
    id: string;
    name: string;
    description: string;
    triggerType: TriggerType;
    /** For file_change: path to watch */
    watchPath?: string;
    /** For schedule: cron expression */
    cronExpression?: string;
    /** For webhook: the route suffix */
    webhookPath?: string;
    /** What TITAN should do when triggered */
    prompt: string;
    enabled: boolean;
    createdAt: string;
    lastTriggeredAt?: string;
    triggerCount: number;
}

export interface MonitorEvent {
    monitorId: string;
    triggeredAt: string;
    triggerType: TriggerType;
    detail: string;
}

// ─── State ────────────────────────────────────────────────────────
const activeWatchers: Map<string, FSWatcher> = new Map();
const activeIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
const eventLog: MonitorEvent[] = [];
let onTrigger: ((monitor: TitanMonitor, event: MonitorEvent) => Promise<void>) | null = null;

// Debounce state per monitor — coalesces rapid file events into one trigger
const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const DEBOUNCE_MS = 2000; // 2-second window
const MIN_TRIGGER_INTERVAL_MS = 10_000; // max 1 trigger per 10s per monitor
const lastTriggerTime: Map<string, number> = new Map();

// ─── Persistence ──────────────────────────────────────────────────
function loadMonitors(): TitanMonitor[] {
    try {
        if (!existsSync(MONITORS_PATH)) return [];
        return JSON.parse(readFileSync(MONITORS_PATH, 'utf-8')) as TitanMonitor[];
    } catch { return []; }
}

function saveMonitors(monitors: TitanMonitor[]): void {
    if (!existsSync(TITAN_HOME)) mkdirSync(TITAN_HOME, { recursive: true });
    writeFileSync(MONITORS_PATH, JSON.stringify(monitors, null, 2), 'utf-8');
}

// ─── Trigger handler ──────────────────────────────────────────────
async function trigger(monitor: TitanMonitor, detail: string): Promise<void> {
    const event: MonitorEvent = {
        monitorId: monitor.id,
        triggeredAt: new Date().toISOString(),
        triggerType: monitor.triggerType,
        detail,
    };
    eventLog.unshift(event);
    if (eventLog.length > 100) eventLog.pop();

    // Update stored trigger info
    const monitors = loadMonitors();
    const stored = monitors.find((m) => m.id === monitor.id);
    if (stored) {
        stored.lastTriggeredAt = event.triggeredAt;
        stored.triggerCount++;
        saveMonitors(monitors);
    }

    logger.info(COMPONENT, `Monitor triggered: ${monitor.name} — ${detail}`);

    if (onTrigger) {
        await onTrigger(monitor, event).catch((e) => {
            logger.error(COMPONENT, `Monitor handler error: ${e.message}`);
        });
    }
}

// ─── Public API ───────────────────────────────────────────────────

/** Set the callback invoked when any monitor triggers */
export function setMonitorTriggerHandler(
    handler: (monitor: TitanMonitor, event: MonitorEvent) => Promise<void>
): void {
    onTrigger = handler;
}

/** Add a new monitor */
export function addMonitor(monitor: Omit<TitanMonitor, 'createdAt' | 'triggerCount'>): TitanMonitor {
    const full: TitanMonitor = { ...monitor, createdAt: new Date().toISOString(), triggerCount: 0 };
    const monitors = loadMonitors();
    if (monitors.find((m) => m.id === full.id)) throw new Error(`Monitor "${full.id}" already exists`);
    monitors.push(full);
    saveMonitors(monitors);
    if (full.enabled) startMonitor(full);
    return full;
}

/** Remove a monitor */
export function removeMonitor(id: string): void {
    stopMonitor(id);
    saveMonitors(loadMonitors().filter((m) => m.id !== id));
}

/** List all monitors */
export function listMonitors(): TitanMonitor[] {
    return loadMonitors();
}

/** Get the recent event log */
export function getMonitorEvents(): MonitorEvent[] {
    return eventLog;
}

/** Start watching for a monitor */
function startMonitor(monitor: TitanMonitor): void {
    if (monitor.triggerType === 'file_change' && monitor.watchPath) {
        if (!existsSync(monitor.watchPath)) {
            logger.warn(COMPONENT, `Watch path does not exist: ${monitor.watchPath}`);
            return;
        }
        // Warn about high-churn directories
        const highChurnDirs = ['/tmp', '/var/log', '/var/tmp'];
        if (highChurnDirs.some(d => monitor.watchPath!.startsWith(d))) {
            logger.warn(COMPONENT, `Watch path "${monitor.watchPath}" is a high-churn directory — debouncing enabled (${DEBOUNCE_MS}ms, max 1 trigger/${MIN_TRIGGER_INTERVAL_MS / 1000}s)`);
        }
        const watcher = watch(monitor.watchPath, { recursive: true }, (eventType, filename) => {
            // Skip TITAN's own files (node compile cache, jiti cache, log files)
            const fn = filename ?? '';
            if (fn.includes('node-compile-cache') || fn.includes('jiti') || fn.includes('titan')) return;

            // Debounce: coalesce rapid events within DEBOUNCE_MS window
            const existing = debounceTimers.get(monitor.id);
            if (existing) clearTimeout(existing);

            debounceTimers.set(monitor.id, setTimeout(() => {
                debounceTimers.delete(monitor.id);

                // Rate limit: skip if triggered too recently
                const lastTime = lastTriggerTime.get(monitor.id) ?? 0;
                if (Date.now() - lastTime < MIN_TRIGGER_INTERVAL_MS) return;
                lastTriggerTime.set(monitor.id, Date.now());

                trigger(monitor, `File ${eventType}: ${fn}`)
                    .catch((err) => logger.warn(COMPONENT, `Monitor trigger error: ${(err as Error).message}`));
            }, DEBOUNCE_MS));
        });
        watcher.on('error', (err: Error) => logger.warn(COMPONENT, `File watcher error: ${err.message}`));
        activeWatchers.set(monitor.id, watcher);
        logger.info(COMPONENT, `Watching: ${monitor.watchPath}`);
    } else if (monitor.triggerType === 'schedule' && monitor.cronExpression) {
        // Simple interval-based schedule (every N minutes notation: */N)
        const match = monitor.cronExpression.match(/^\*\/(\d+)$/);
        const minutes = match ? parseInt(match[1], 10) : 60;
        const interval = setInterval(() => {
            trigger(monitor, `Scheduled trigger (every ${minutes} min)`)
                .catch((err) => logger.warn(COMPONENT, `Monitor trigger error: ${(err as Error).message}`));
        }, minutes * 60 * 1000);
        activeIntervals.set(monitor.id, interval);
        logger.info(COMPONENT, `Scheduled monitor every ${minutes} minutes`);
    }
}

/** Stop a running monitor */
function stopMonitor(id: string): void {
    const watcher = activeWatchers.get(id);
    if (watcher) { watcher.close(); activeWatchers.delete(id); }
    const interval = activeIntervals.get(id);
    if (interval) { clearInterval(interval); activeIntervals.delete(id); }
    const timer = debounceTimers.get(id);
    if (timer) { clearTimeout(timer); debounceTimers.delete(id); }
    lastTriggerTime.delete(id);
}

/** Boot all enabled monitors on startup */
export function initMonitors(): void {
    const monitors = loadMonitors().filter((m) => m.enabled);
    for (const m of monitors) startMonitor(m);
    if (monitors.length > 0) {
        logger.info(COMPONENT, `Activated ${monitors.length} monitor(s)`);
    }
}
