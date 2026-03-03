/**
 * TITAN — Monitor Tests
 * Tests addMonitor, removeMonitor, listMonitors, getMonitorEvents,
 * setMonitorTriggerHandler, initMonitors, trigger, persistence, and error paths.
 *
 * Uses vi.resetModules() + dynamic re-import to get a fresh module for each test
 * (the monitor module has module-level state: activeWatchers, activeIntervals, eventLog, onTrigger).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock variables ──────────────────────────────────────────────
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockWatch = vi.hoisted(() => vi.fn());

// ── Module mocks ─────────────────────────────────────────────────────────
vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_HOME: '/tmp/titan-test-monitor',
}));

let mockFiles: Record<string, string> = {};

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
        watch: mockWatch,
    };
});

// ── Helper to get a fresh monitor module ────────────────────────────────
type MonitorModule = typeof import('../src/agent/monitor.js');

async function freshMonitor(): Promise<MonitorModule> {
    vi.resetModules();
    return await import('../src/agent/monitor.js');
}

// ── Helper to create a mock watcher ─────────────────────────────────────
function createMockWatcher() {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
        }),
        close: vi.fn(),
        _listeners: listeners,
        _emit: (event: string, ...args: unknown[]) => {
            for (const cb of (listeners[event] || [])) cb(...args);
        },
    };
}

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFiles = {};

    mockExistsSync.mockImplementation((p: string) => {
        if (p in mockFiles) return true;
        return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
        if (p in mockFiles) return mockFiles[p];
        throw new Error('ENOENT');
    });
    mockWriteFileSync.mockImplementation((p: string, data: string) => {
        mockFiles[p] = data;
    });
    mockMkdirSync.mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('Monitor System', () => {

    // ── listMonitors ────────────────────────────────────────────────

    describe('listMonitors', () => {
        it('should return an empty array when no monitors file exists', async () => {
            const mod = await freshMonitor();
            const monitors = mod.listMonitors();
            expect(monitors).toEqual([]);
        });

        it('should return monitors from persisted JSON', async () => {
            const stored = [{
                id: 'mon-1', name: 'Test Monitor', description: 'A test',
                triggerType: 'webhook', prompt: 'do something', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            const mod = await freshMonitor();
            const monitors = mod.listMonitors();
            expect(monitors).toHaveLength(1);
            expect(monitors[0].id).toBe('mon-1');
        });

        it('should return empty array when monitors.json is corrupted', async () => {
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = 'NOT VALID JSON!!!';

            const mod = await freshMonitor();
            const monitors = mod.listMonitors();
            expect(monitors).toEqual([]);
        });
    });

    // ── addMonitor ──────────────────────────────────────────────────

    describe('addMonitor', () => {
        it('should add a new monitor and persist it', async () => {
            const mod = await freshMonitor();
            const monitor = mod.addMonitor({
                id: 'mon-new',
                name: 'New Monitor',
                description: 'Watches stuff',
                triggerType: 'webhook',
                prompt: 'Handle the webhook',
                enabled: false,
            });

            expect(monitor.id).toBe('mon-new');
            expect(monitor.triggerCount).toBe(0);
            expect(monitor.createdAt).toBeDefined();

            // Verify persistence
            expect(mockWriteFileSync).toHaveBeenCalled();
            const savedData = JSON.parse(mockFiles['/tmp/titan-test-monitor/monitors.json']);
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('mon-new');
        });

        it('should throw when adding a monitor with a duplicate id', async () => {
            const stored = [{
                id: 'mon-dup', name: 'Existing', description: '',
                triggerType: 'webhook', prompt: '', enabled: false,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            const mod = await freshMonitor();
            expect(() => mod.addMonitor({
                id: 'mon-dup',
                name: 'Duplicate',
                description: '',
                triggerType: 'webhook',
                prompt: '',
                enabled: false,
            })).toThrow('already exists');
        });

        it('should start a file_change monitor when enabled and watchPath exists', async () => {
            const watcher = createMockWatcher();
            mockWatch.mockReturnValue(watcher);

            // Make the watch path exist
            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched-dir') return true;
                if (p in mockFiles) return true;
                return false;
            });

            const mod = await freshMonitor();
            const monitor = mod.addMonitor({
                id: 'mon-file',
                name: 'File Watcher',
                description: 'Watches a directory',
                triggerType: 'file_change',
                watchPath: '/tmp/watched-dir',
                prompt: 'Handle file change',
                enabled: true,
            });

            expect(mockWatch).toHaveBeenCalledWith(
                '/tmp/watched-dir',
                { recursive: true },
                expect.any(Function),
            );
        });

        it('should start a schedule monitor when enabled with cron expression', async () => {
            const mod = await freshMonitor();
            const monitor = mod.addMonitor({
                id: 'mon-sched',
                name: 'Scheduled Monitor',
                description: 'Runs every 5 minutes',
                triggerType: 'schedule',
                cronExpression: '*/5',
                prompt: 'Run scheduled task',
                enabled: true,
            });

            // The module should have set an interval — we can verify the logger was called
            const logger = (await import('../src/utils/logger.js')).default;
            expect(logger.info).toHaveBeenCalledWith('Monitor', expect.stringContaining('every 5 minutes'));
        });

        it('should NOT start a file_change monitor when watchPath does not exist', async () => {
            // existsSync returns false for everything by default
            const mod = await freshMonitor();
            mod.addMonitor({
                id: 'mon-missing-path',
                name: 'Missing Path',
                description: '',
                triggerType: 'file_change',
                watchPath: '/nonexistent/path',
                prompt: 'Handle it',
                enabled: true,
            });

            expect(mockWatch).not.toHaveBeenCalled();
            const logger = (await import('../src/utils/logger.js')).default;
            expect(logger.warn).toHaveBeenCalledWith('Monitor', expect.stringContaining('does not exist'));
        });
    });

    // ── removeMonitor ───────────────────────────────────────────────

    describe('removeMonitor', () => {
        it('should remove a monitor from persistence', async () => {
            const stored = [
                { id: 'mon-1', name: 'A', description: '', triggerType: 'webhook', prompt: '', enabled: false, createdAt: '2026-01-01', triggerCount: 0 },
                { id: 'mon-2', name: 'B', description: '', triggerType: 'webhook', prompt: '', enabled: false, createdAt: '2026-01-01', triggerCount: 0 },
            ];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            const mod = await freshMonitor();
            mod.removeMonitor('mon-1');

            const savedData = JSON.parse(mockFiles['/tmp/titan-test-monitor/monitors.json']);
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('mon-2');
        });

        it('should close watcher when removing an active file_change monitor', async () => {
            const watcher = createMockWatcher();
            mockWatch.mockReturnValue(watcher);

            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched') return true;
                if (p in mockFiles) return true;
                return false;
            });

            const mod = await freshMonitor();
            mod.addMonitor({
                id: 'mon-active',
                name: 'Active Watcher',
                description: '',
                triggerType: 'file_change',
                watchPath: '/tmp/watched',
                prompt: '',
                enabled: true,
            });

            mod.removeMonitor('mon-active');
            expect(watcher.close).toHaveBeenCalled();
        });
    });

    // ── getMonitorEvents ────────────────────────────────────────────

    describe('getMonitorEvents', () => {
        it('should return an empty array initially', async () => {
            const mod = await freshMonitor();
            const events = mod.getMonitorEvents();
            expect(events).toEqual([]);
        });
    });

    // ── setMonitorTriggerHandler ────────────────────────────────────

    describe('setMonitorTriggerHandler', () => {
        it('should accept a handler function without error', async () => {
            const mod = await freshMonitor();
            expect(() => {
                mod.setMonitorTriggerHandler(async () => {});
            }).not.toThrow();
        });
    });

    // ── initMonitors ────────────────────────────────────────────────

    describe('initMonitors', () => {
        it('should not throw when no monitors exist', async () => {
            const mod = await freshMonitor();
            expect(() => mod.initMonitors()).not.toThrow();
        });

        it('should activate enabled monitors on init', async () => {
            const watcher = createMockWatcher();
            mockWatch.mockReturnValue(watcher);

            const stored = [{
                id: 'mon-active', name: 'Active', description: '',
                triggerType: 'file_change', watchPath: '/tmp/watched',
                prompt: '', enabled: true, createdAt: '2026-01-01', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched') return true;
                if (p in mockFiles) return true;
                return false;
            });

            const mod = await freshMonitor();
            mod.initMonitors();

            expect(mockWatch).toHaveBeenCalledWith('/tmp/watched', { recursive: true }, expect.any(Function));
            const logger = (await import('../src/utils/logger.js')).default;
            expect(logger.info).toHaveBeenCalledWith('Monitor', expect.stringContaining('Activated 1 monitor'));
        });

        it('should skip disabled monitors on init', async () => {
            const stored = [{
                id: 'mon-disabled', name: 'Disabled', description: '',
                triggerType: 'file_change', watchPath: '/tmp/watched',
                prompt: '', enabled: false, createdAt: '2026-01-01', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            const mod = await freshMonitor();
            mod.initMonitors();

            expect(mockWatch).not.toHaveBeenCalled();
        });
    });

    // ── trigger behavior (file change callback) ─────────────────────

    describe('trigger (file change callback)', () => {
        it('should log event and update trigger count when file changes', async () => {
            let fileChangeCallback: ((eventType: string, filename: string) => void) | null = null;
            const watcher = createMockWatcher();
            mockWatch.mockImplementation((_path: string, _opts: unknown, cb: (eventType: string, filename: string) => void) => {
                fileChangeCallback = cb;
                return watcher;
            });

            const stored = [{
                id: 'mon-fc', name: 'File Change', description: '',
                triggerType: 'file_change', watchPath: '/tmp/watched',
                prompt: 'Handle change', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched') return true;
                if (p in mockFiles) return true;
                if (p === '/tmp/titan-test-monitor') return true;
                return false;
            });

            const mod = await freshMonitor();
            mod.initMonitors();

            // Simulate a file change event
            expect(fileChangeCallback).not.toBeNull();
            fileChangeCallback!('change', 'data.json');

            // Allow async trigger to settle
            await vi.advanceTimersByTimeAsync(100);

            const events = mod.getMonitorEvents();
            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events[0].detail).toContain('data.json');

            // Check that triggerCount was incremented in persisted data
            const savedData = JSON.parse(mockFiles['/tmp/titan-test-monitor/monitors.json']);
            expect(savedData[0].triggerCount).toBe(1);
        });

        it('should call the trigger handler when one is set', async () => {
            let fileChangeCallback: ((eventType: string, filename: string) => void) | null = null;
            const watcher = createMockWatcher();
            mockWatch.mockImplementation((_path: string, _opts: unknown, cb: (eventType: string, filename: string) => void) => {
                fileChangeCallback = cb;
                return watcher;
            });

            const stored = [{
                id: 'mon-handler', name: 'Handler Test', description: '',
                triggerType: 'file_change', watchPath: '/tmp/watched',
                prompt: 'Do stuff', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched') return true;
                if (p in mockFiles) return true;
                if (p === '/tmp/titan-test-monitor') return true;
                return false;
            });

            const handler = vi.fn().mockResolvedValue(undefined);

            const mod = await freshMonitor();
            mod.setMonitorTriggerHandler(handler);
            mod.initMonitors();

            fileChangeCallback!('change', 'readme.md');
            await vi.advanceTimersByTimeAsync(100);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'mon-handler' }),
                expect.objectContaining({ triggerType: 'file_change' }),
            );
        });

        it('should handle trigger handler errors gracefully', async () => {
            let fileChangeCallback: ((eventType: string, filename: string) => void) | null = null;
            const watcher = createMockWatcher();
            mockWatch.mockImplementation((_path: string, _opts: unknown, cb: (eventType: string, filename: string) => void) => {
                fileChangeCallback = cb;
                return watcher;
            });

            const stored = [{
                id: 'mon-err', name: 'Error Handler', description: '',
                triggerType: 'file_change', watchPath: '/tmp/watched',
                prompt: 'Oops', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched') return true;
                if (p in mockFiles) return true;
                if (p === '/tmp/titan-test-monitor') return true;
                return false;
            });

            const handler = vi.fn().mockRejectedValue(new Error('Handler exploded'));

            const mod = await freshMonitor();
            mod.setMonitorTriggerHandler(handler);
            mod.initMonitors();

            fileChangeCallback!('change', 'test.txt');
            await vi.advanceTimersByTimeAsync(100);

            // Should not throw — error is caught and logged
            const logger = (await import('../src/utils/logger.js')).default;
            expect(logger.error).toHaveBeenCalledWith('Monitor', expect.stringContaining('Monitor handler error'));
        });
    });

    // ── Schedule trigger ────────────────────────────────────────────

    describe('schedule trigger', () => {
        it('should trigger on interval for schedule monitors', async () => {
            const stored = [{
                id: 'mon-sched', name: 'Scheduler', description: '',
                triggerType: 'schedule', cronExpression: '*/2',
                prompt: 'Run periodic task', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p in mockFiles) return true;
                if (p === '/tmp/titan-test-monitor') return true;
                return false;
            });

            const mod = await freshMonitor();
            mod.initMonitors();

            // Advance past 2 minutes to trigger the interval
            await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 100);

            const events = mod.getMonitorEvents();
            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events[0].detail).toContain('every 2 min');
        });

        it('should default to 60 minutes for non-matching cron expressions', async () => {
            const stored = [{
                id: 'mon-default-sched', name: 'Default Sched', description: '',
                triggerType: 'schedule', cronExpression: '0 9 * * *',
                prompt: 'Daily task', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p in mockFiles) return true;
                if (p === '/tmp/titan-test-monitor') return true;
                return false;
            });

            const mod = await freshMonitor();
            mod.initMonitors();

            const logger = (await import('../src/utils/logger.js')).default;
            expect(logger.info).toHaveBeenCalledWith('Monitor', expect.stringContaining('every 60 minutes'));
        });
    });

    // ── Event log cap ───────────────────────────────────────────────

    describe('event log', () => {
        it('should cap the event log at 100 entries', async () => {
            let fileChangeCallback: ((eventType: string, filename: string) => void) | null = null;
            const watcher = createMockWatcher();
            mockWatch.mockImplementation((_path: string, _opts: unknown, cb: (eventType: string, filename: string) => void) => {
                fileChangeCallback = cb;
                return watcher;
            });

            const stored = [{
                id: 'mon-cap', name: 'Cap Test', description: '',
                triggerType: 'file_change', watchPath: '/tmp/watched',
                prompt: '', enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z', triggerCount: 0,
            }];
            mockFiles['/tmp/titan-test-monitor/monitors.json'] = JSON.stringify(stored);

            mockExistsSync.mockImplementation((p: string) => {
                if (p === '/tmp/watched') return true;
                if (p in mockFiles) return true;
                if (p === '/tmp/titan-test-monitor') return true;
                return false;
            });

            const mod = await freshMonitor();
            mod.initMonitors();

            // Trigger 110 events
            for (let i = 0; i < 110; i++) {
                fileChangeCallback!('change', `file-${i}.txt`);
                await vi.advanceTimersByTimeAsync(10);
            }

            const events = mod.getMonitorEvents();
            expect(events.length).toBeLessThanOrEqual(100);
        });
    });
});
