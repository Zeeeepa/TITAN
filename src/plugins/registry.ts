/**
 * TITAN — ContextEngine Plugin Registry
 * Register, retrieve, and initialize context engine plugins.
 */
import logger from '../utils/logger.js';
import type { ContextEnginePlugin } from './contextEngine.js';
import type { TitanConfig } from '../config/schema.js';

const COMPONENT = 'PluginRegistry';

const plugins: ContextEnginePlugin[] = [];

/** Register a context engine plugin */
export function registerPlugin(plugin: ContextEnginePlugin): void {
    if (plugins.find((p) => p.name === plugin.name)) {
        logger.warn(COMPONENT, `Plugin "${plugin.name}" already registered — skipping`);
        return;
    }
    plugins.push(plugin);
    logger.info(COMPONENT, `Registered plugin: ${plugin.name} v${plugin.version}`);
}

/** Get all registered plugins */
export function getPlugins(): ContextEnginePlugin[] {
    return [...plugins];
}

/** Get a plugin by name */
export function getPlugin(name: string): ContextEnginePlugin | undefined {
    return plugins.find((p) => p.name === name);
}

/** Clear all registered plugins (for testing) */
export function clearPlugins(): void {
    plugins.length = 0;
}

/** Initialize plugins from config — loads enabled plugins and calls bootstrap */
export async function initPlugins(config: TitanConfig): Promise<void> {
    const pluginConfigs = config.plugins?.contextEngine;
    if (!pluginConfigs || pluginConfigs.length === 0) {
        logger.debug(COMPONENT, 'No context engine plugins configured');
        return;
    }

    for (const pc of pluginConfigs) {
        if (!pc.enabled) {
            logger.debug(COMPONENT, `Plugin "${pc.name}" is disabled — skipping`);
            continue;
        }

        const existing = getPlugin(pc.name);
        if (existing) {
            // Already registered (e.g. built-in), just bootstrap with config
            if (existing.bootstrap) {
                try {
                    await existing.bootstrap(pc.options || {});
                    logger.info(COMPONENT, `Bootstrapped plugin: ${existing.name}`);
                } catch (e) {
                    logger.error(COMPONENT, `Failed to bootstrap "${existing.name}": ${(e as Error).message}`);
                }
            }
        } else {
            logger.warn(COMPONENT, `Plugin "${pc.name}" not found in registry — register it before calling initPlugins`);
        }
    }

    logger.info(COMPONENT, `Initialized ${plugins.length} context engine plugin(s)`);
}
