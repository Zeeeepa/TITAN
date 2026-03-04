/**
 * TITAN — Security & Sandbox Module
 * Permission management, tool allowlists/denylists, and session isolation.
 */
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Security';

export interface SecurityContext {
    sessionId: string;
    channel: string;
    userId: string;
    isMainSession: boolean;
    sandboxMode: string;
    allowedTools: string[];
    deniedTools: string[];
    fileSystemAllowlist: string[];
    networkAllowlist: string[];
}

/** Create a security context for a session */
export function createSecurityContext(
    sessionId: string,
    channel: string,
    userId: string,
    isMainSession: boolean = true,
): SecurityContext {
    const config = loadConfig();
    const security = config.security;

    return {
        sessionId,
        channel,
        userId,
        isMainSession,
        sandboxMode: isMainSession ? 'host' : security.sandboxMode,
        allowedTools: security.allowedTools,
        deniedTools: security.deniedTools,
        fileSystemAllowlist: security.fileSystemAllowlist,
        networkAllowlist: security.networkAllowlist,
    };
}

/** Check if a tool is allowed in the given security context */
export function isToolAllowed(toolName: string, context: SecurityContext): boolean {
    // Denied tools always take priority
    if (context.deniedTools.includes(toolName)) {
        logger.debug(COMPONENT, `Tool ${toolName} denied by security policy`);
        return false;
    }

    // If allowlist is empty, all non-denied tools are allowed
    if (context.allowedTools.length === 0) return true;

    // Check allowlist
    const allowed = context.allowedTools.includes(toolName);
    if (!allowed) {
        logger.debug(COMPONENT, `Tool ${toolName} not in allowlist`);
    }
    return allowed;
}

/** Check if a file path is accessible */
export function isPathAllowed(filePath: string, context: SecurityContext): boolean {
    // Main sessions have full access
    if (context.isMainSession) return true;

    // If no allowlist, deny all file access for non-main sessions
    if (context.fileSystemAllowlist.length === 0) return false;

    // Check against allowlist
    return context.fileSystemAllowlist.some((allowed) =>
        filePath.startsWith(allowed) || allowed === '*'
    );
}

/** Check if a network request is allowed */
export function isNetworkAllowed(url: string, context: SecurityContext): boolean {
    if (context.networkAllowlist.includes('*')) return true;
    if (context.networkAllowlist.length === 0) return false;

    try {
        const hostname = new URL(url).hostname;
        return context.networkAllowlist.some((allowed) =>
            hostname === allowed || hostname.endsWith(`.${allowed}`)
        );
    } catch {
        return false;
    }
}

/** Validate the security configuration and report issues */
export function auditSecurity(): Array<{ level: 'info' | 'warn' | 'error'; message: string }> {
    const config = loadConfig();
    const issues: Array<{ level: 'info' | 'warn' | 'error'; message: string }> = [];

    if (config.security.sandboxMode === 'none') {
        issues.push({ level: 'warn', message: 'Sandbox mode is disabled. Non-main sessions will have full host access.' });
    }

    if (config.security.deniedTools.length === 0) {
        issues.push({ level: 'info', message: 'No tools are explicitly denied.' });
    }

    if (config.security.networkAllowlist.includes('*')) {
        issues.push({ level: 'info', message: 'Network access is unrestricted (allowlist: *).' });
    }

    if (config.security.commandTimeout > 60000) {
        issues.push({ level: 'warn', message: `Command timeout is very high: ${config.security.commandTimeout}ms` });
    }

    // Check channel DM policies
    for (const [name, channel] of Object.entries(config.channels)) {
        if (channel.enabled && channel.dmPolicy === 'open') {
            issues.push({ level: 'warn', message: `Channel "${name}" has open DM policy — any user can message the bot.` });
        }
    }

    return issues;
}

/** Resource limit configuration */
export interface ResourceLimits {
    maxMemoryMB?: number;
    maxSubprocesses?: number;
    maxDiskWriteMB?: number;
}

/** Result of resource limit enforcement check */
export interface ResourceLimitResult {
    ok: boolean;
    violations: string[];
}

/**
 * Check current resource usage against specified limits.
 * Does NOT kill or restrict anything — only reports violations.
 */
export function enforceResourceLimits(limits?: ResourceLimits): ResourceLimitResult {
    const violations: string[] = [];

    if (!limits) {
        return { ok: true, violations };
    }

    // Check memory usage
    if (limits.maxMemoryMB !== undefined && limits.maxMemoryMB > 0) {
        const memUsage = process.memoryUsage();
        const rssMB = memUsage.rss / (1024 * 1024);
        if (rssMB > limits.maxMemoryMB) {
            violations.push(
                `Memory usage ${rssMB.toFixed(1)} MB exceeds limit of ${limits.maxMemoryMB} MB`,
            );
            logger.warn(COMPONENT, `Resource limit exceeded: memory ${rssMB.toFixed(1)} MB > ${limits.maxMemoryMB} MB`);
        }
    }

    // Check subprocess count (heuristic via process._getActiveHandles if available)
    if (limits.maxSubprocesses !== undefined && limits.maxSubprocesses > 0) {
        try {
            // Count ChildProcess handles from active handles
            const handles = (process as unknown as Record<string, (() => unknown[]) | undefined>)._getActiveHandles?.() ?? [];
            const childProcessCount = (handles as Array<{ constructor?: { name?: string } }>).filter(
                (h) => h?.constructor?.name === 'ChildProcess',
            ).length;
            if (childProcessCount > limits.maxSubprocesses) {
                violations.push(
                    `Subprocess count ${childProcessCount} exceeds limit of ${limits.maxSubprocesses}`,
                );
                logger.warn(COMPONENT, `Resource limit exceeded: subprocesses ${childProcessCount} > ${limits.maxSubprocesses}`);
            }
        } catch {
            // _getActiveHandles may not be available in all environments
            logger.debug(COMPONENT, 'Unable to count subprocesses — _getActiveHandles not available');
        }
    }

    // Check disk write limit (informational — we track via heapUsed as proxy)
    if (limits.maxDiskWriteMB !== undefined && limits.maxDiskWriteMB > 0) {
        // Disk write tracking requires OS-level instrumentation.
        // We log the limit for awareness but cannot enforce without external tooling.
        logger.debug(COMPONENT, `Disk write limit set to ${limits.maxDiskWriteMB} MB (advisory only)`);
    }

    return {
        ok: violations.length === 0,
        violations,
    };
}
