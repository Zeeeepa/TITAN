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
