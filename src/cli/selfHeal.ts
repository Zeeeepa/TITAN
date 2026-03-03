/**
 * TITAN -- Self-Healing System
 * Auto-fixes common configuration and environment issues.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, chmodSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME, TITAN_WORKSPACE, TITAN_CONFIG_PATH, TITAN_LOGS_DIR, TITAN_SKILLS_DIR } from '../utils/constants.js';
import { AGENTS_MD, SOUL_MD, TOOLS_MD } from '../utils/constants.js';
import { getDefaultConfig, saveConfig, loadConfig, configExists } from '../config/config.js';
import { TitanConfigSchema } from '../config/schema.js';
import logger from '../utils/logger.js';

const COMPONENT = 'SelfHeal';

export interface HealResult {
    action: string;
    success: boolean;
    message: string;
}

/**
 * Ensure ~/.titan and all required subdirectories exist.
 */
export function fixMissingTitanHome(): HealResult {
    const dirs = [
        TITAN_HOME,
        TITAN_LOGS_DIR,
        join(TITAN_HOME, 'memory'),
        TITAN_WORKSPACE,
        TITAN_SKILLS_DIR,
    ];
    let created = 0;
    for (const dir of dirs) {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            created++;
        }
    }
    const message = created > 0 ? `Created ${created} directories` : 'All directories exist';
    logger.info(COMPONENT, message);
    return { action: 'fixMissingTitanHome', success: true, message };
}

/**
 * Generate default config from schema if missing.
 */
export function fixMissingConfig(): HealResult {
    if (configExists()) {
        return { action: 'fixMissingConfig', success: true, message: 'Config already exists' };
    }
    const config = getDefaultConfig();
    saveConfig(config);
    logger.info(COMPONENT, `Default config written to ${TITAN_CONFIG_PATH}`);
    return { action: 'fixMissingConfig', success: true, message: `Default config written to ${TITAN_CONFIG_PATH}` };
}

/**
 * Validate existing config; replace with defaults if invalid.
 */
export function fixInvalidConfig(): HealResult {
    if (!configExists()) {
        return { action: 'fixInvalidConfig', success: false, message: 'No config file found' };
    }
    try {
        const config = loadConfig();
        TitanConfigSchema.parse(config);
        return { action: 'fixInvalidConfig', success: true, message: 'Config is valid' };
    } catch {
        const config = getDefaultConfig();
        saveConfig(config);
        logger.warn(COMPONENT, 'Config was invalid, replaced with defaults');
        return { action: 'fixInvalidConfig', success: true, message: 'Config was invalid, replaced with defaults' };
    }
}

/**
 * Create AGENTS.md, SOUL.md, TOOLS.md workspace files if missing.
 */
export function fixMissingWorkspace(): HealResult {
    const files: [string, string][] = [
        [AGENTS_MD, '# TITAN Agents\n\nDefine your agent personas and routing rules here.\n'],
        [SOUL_MD, '# TITAN Soul\n\nDefine your agent\'s personality, tone, and behavioral guidelines here.\n'],
        [TOOLS_MD, '# TITAN Tools\n\nCustom tool documentation and notes.\n'],
    ];
    let created = 0;
    if (!existsSync(TITAN_WORKSPACE)) {
        mkdirSync(TITAN_WORKSPACE, { recursive: true });
    }
    for (const [filePath, content] of files) {
        if (!existsSync(filePath)) {
            writeFileSync(filePath, content, 'utf-8');
            created++;
        }
    }
    const message = created > 0 ? `Created ${created} workspace files` : 'All workspace files exist';
    logger.info(COMPONENT, message);
    return { action: 'fixMissingWorkspace', success: true, message };
}

/**
 * Disable channels that are enabled but have no token or apiKey configured.
 */
export function fixBrokenChannelConfig(): HealResult {
    if (!configExists()) {
        return { action: 'fixBrokenChannelConfig', success: false, message: 'No config file' };
    }
    try {
        const config = loadConfig();
        let fixed = 0;
        for (const [name, channel] of Object.entries(config.channels)) {
            if (channel.enabled && !channel.token && !channel.apiKey) {
                (channel as Record<string, unknown>).enabled = false;
                fixed++;
                logger.info(COMPONENT, `Disabled channel "${name}" -- no token configured`);
            }
        }
        if (fixed > 0) {
            saveConfig(config);
        }
        const message = fixed > 0 ? `Disabled ${fixed} channels without tokens` : 'All enabled channels have tokens';
        return { action: 'fixBrokenChannelConfig', success: true, message };
    } catch {
        return { action: 'fixBrokenChannelConfig', success: false, message: 'Failed to read config' };
    }
}

/**
 * Ensure ~/.titan has restrictive permissions (700).
 */
export function fixPermissions(): HealResult {
    if (!existsSync(TITAN_HOME)) {
        return { action: 'fixPermissions', success: false, message: 'TITAN_HOME does not exist' };
    }
    try {
        chmodSync(TITAN_HOME, 0o700);
        return { action: 'fixPermissions', success: true, message: 'Permissions set to 700' };
    } catch (e) {
        return { action: 'fixPermissions', success: false, message: `Failed: ${(e as Error).message}` };
    }
}

/**
 * Remove log files older than 30 days.
 */
export function fixStaleLogFiles(): HealResult {
    if (!existsSync(TITAN_LOGS_DIR)) {
        return { action: 'fixStaleLogFiles', success: true, message: 'No logs directory' };
    }
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let removed = 0;
    try {
        const files = readdirSync(TITAN_LOGS_DIR);
        for (const file of files) {
            const fullPath = join(TITAN_LOGS_DIR, file);
            const stat = statSync(fullPath);
            if (stat.isFile() && stat.mtimeMs < thirtyDaysAgo) {
                unlinkSync(fullPath);
                removed++;
            }
        }
        const message = removed > 0 ? `Removed ${removed} stale log files` : 'No stale logs';
        logger.info(COMPONENT, message);
        return { action: 'fixStaleLogFiles', success: true, message };
    } catch (e) {
        return { action: 'fixStaleLogFiles', success: false, message: `Failed: ${(e as Error).message}` };
    }
}

/**
 * Clean up session files older than 24 hours.
 */
export function fixOrphanedSessions(): HealResult {
    const sessionsDir = join(TITAN_HOME, 'sessions');
    if (!existsSync(sessionsDir)) {
        return { action: 'fixOrphanedSessions', success: true, message: 'No sessions directory' };
    }
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let cleaned = 0;
    try {
        const files = readdirSync(sessionsDir);
        for (const file of files) {
            const fullPath = join(sessionsDir, file);
            const stat = statSync(fullPath);
            if (stat.isFile() && stat.mtimeMs < oneDayAgo) {
                unlinkSync(fullPath);
                cleaned++;
            }
        }
        const message = cleaned > 0 ? `Cleaned ${cleaned} orphaned sessions` : 'No orphaned sessions';
        logger.info(COMPONENT, message);
        return { action: 'fixOrphanedSessions', success: true, message };
    } catch (e) {
        return { action: 'fixOrphanedSessions', success: false, message: `Failed: ${(e as Error).message}` };
    }
}

/** Run all auto-fixes and return results */
export function runAllFixes(): HealResult[] {
    logger.info(COMPONENT, 'Running all self-healing fixes...');
    const results = [
        fixMissingTitanHome(),
        fixMissingConfig(),
        fixInvalidConfig(),
        fixMissingWorkspace(),
        fixBrokenChannelConfig(),
        fixPermissions(),
        fixStaleLogFiles(),
        fixOrphanedSessions(),
    ];
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    logger.info(COMPONENT, `Self-heal complete: ${succeeded} succeeded, ${failed} failed`);
    return results;
}
