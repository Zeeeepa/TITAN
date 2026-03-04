/**
 * TITAN — Audit Logger
 * Append-only JSONL audit log with HMAC-SHA256 chain integrity.
 * Stores at ~/.titan/audit.jsonl
 */
import { createHmac } from 'crypto';
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { hostname } from 'os';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const COMPONENT = 'AuditLog';

/** Supported audit event types */
export type AuditEventType =
    | 'tool_execution'
    | 'config_change'
    | 'auth_event'
    | 'session_start'
    | 'session_end'
    | 'model_switch'
    | 'budget_warning'
    | 'security_alert';

/** A single audit log entry */
export interface AuditEntry {
    timestamp: string;
    eventType: AuditEventType;
    actor: string;
    detail: Record<string, unknown>;
    prevHash: string;
}

/** Filter options for reading the audit log */
export interface AuditFilter {
    eventType?: AuditEventType;
    actor?: string;
    startDate?: string;
    endDate?: string;
}

/** Chain verification result */
export interface ChainVerification {
    valid: boolean;
    brokenAt?: number;
}

/** Stats by event type */
export type AuditStats = Record<string, number>;

// Application secret for HMAC derivation — combined with hostname
const APP_SECRET = 'TITAN-AUDIT-LOG-v1';

let auditLogPath: string = join(TITAN_HOME, 'audit.jsonl');
let lastHash: string | null = null;

/**
 * Override the default audit log path (useful for tests or config).
 */
export function setAuditLogPath(path: string): void {
    auditLogPath = path;
    lastHash = null; // reset cached hash when path changes
}

/**
 * Get the current audit log file path.
 */
export function getAuditLogPath(): string {
    return auditLogPath;
}

/**
 * Derive the HMAC key from the app secret and machine hostname.
 */
function getHmacKey(): string {
    return `${APP_SECRET}:${hostname()}`;
}

/**
 * Compute HMAC-SHA256 of a string using the derived key.
 */
function computeHmac(data: string): string {
    return createHmac('sha256', getHmacKey()).update(data).digest('hex');
}

/**
 * Read the last hash from the audit log file.
 * Returns '0' (genesis hash) if file doesn't exist or is empty.
 */
function readLastHash(): string {
    if (lastHash !== null) {
        return lastHash;
    }

    if (!existsSync(auditLogPath)) {
        lastHash = '0';
        return lastHash;
    }

    const content = readFileSync(auditLogPath, 'utf-8').trim();
    if (content.length === 0) {
        lastHash = '0';
        return lastHash;
    }

    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine.length === 0) {
        lastHash = '0';
        return lastHash;
    }

    try {
        JSON.parse(lastLine); // validate JSON
        // The hash of the last entry is the HMAC of that entire entry's JSON
        lastHash = computeHmac(lastLine);
        return lastHash;
    } catch {
        lastHash = '0';
        return lastHash;
    }
}

/**
 * Append an audit event to the log file.
 * Each entry includes prevHash field for HMAC chain integrity.
 */
export function logAudit(
    eventType: AuditEventType,
    actor: string,
    detail: Record<string, unknown> = {},
): AuditEntry {
    const prevHash = readLastHash();

    const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        eventType,
        actor,
        detail,
        prevHash,
    };

    const line = JSON.stringify(entry);

    // Ensure directory exists
    const dir = dirname(auditLogPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    appendFileSync(auditLogPath, line + '\n', 'utf-8');

    // Update cached hash
    lastHash = computeHmac(line);

    logger.debug(COMPONENT, `Audit: ${eventType} by ${actor}`);
    return entry;
}

/**
 * Read and parse the audit log. Optionally filter by event type, actor, or date range.
 */
export function getAuditLog(filters?: AuditFilter): AuditEntry[] {
    if (!existsSync(auditLogPath)) {
        return [];
    }

    const content = readFileSync(auditLogPath, 'utf-8').trim();
    if (content.length === 0) {
        return [];
    }

    const lines = content.split('\n');
    let entries: AuditEntry[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
            entries.push(JSON.parse(trimmed) as AuditEntry);
        } catch {
            logger.warn(COMPONENT, `Skipping malformed audit log entry`);
        }
    }

    if (!filters) return entries;

    if (filters.eventType) {
        entries = entries.filter(e => e.eventType === filters.eventType);
    }

    if (filters.actor) {
        entries = entries.filter(e => e.actor === filters.actor);
    }

    if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
    }

    if (filters.endDate) {
        const end = new Date(filters.endDate).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    return entries;
}

/**
 * Verify the HMAC chain integrity of the audit log.
 * Returns { valid: true } if chain is intact, or { valid: false, brokenAt: N } if broken.
 */
export function verifyAuditChain(): ChainVerification {
    if (!existsSync(auditLogPath)) {
        return { valid: true };
    }

    const content = readFileSync(auditLogPath, 'utf-8').trim();
    if (content.length === 0) {
        return { valid: true };
    }

    const lines = content.split('\n').filter(l => l.trim().length > 0);
    let prevHash = '0'; // genesis

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let entry: AuditEntry;
        try {
            entry = JSON.parse(line);
        } catch {
            return { valid: false, brokenAt: i };
        }

        // Verify the prevHash in this entry matches expected
        if (entry.prevHash !== prevHash) {
            return { valid: false, brokenAt: i };
        }

        // Compute the hash of this entry for the next iteration
        prevHash = computeHmac(line);
    }

    return { valid: true };
}

/**
 * Return counts of audit events grouped by event type.
 */
export function getAuditStats(): AuditStats {
    const entries = getAuditLog();
    const stats: AuditStats = {};

    for (const entry of entries) {
        stats[entry.eventType] = (stats[entry.eventType] || 0) + 1;
    }

    return stats;
}

/**
 * Reset internal state (for testing).
 */
export function resetAuditState(): void {
    lastHash = null;
}
