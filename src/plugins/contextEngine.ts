/**
 * TITAN — ContextEngine Plugin Interface & Lifecycle Runner
 * Extensible plugin system for context assembly, compaction, and ingestion.
 */
import logger from '../utils/logger.js';
import type { ChatMessage } from '../providers/base.js';

const COMPONENT = 'ContextPlugin';

export interface ContextEnginePlugin {
    name: string;
    version: string;
    bootstrap?(config: Record<string, unknown>): Promise<void>;
    ingest?(content: string, metadata: Record<string, unknown>): Promise<void>;
    assemble?(context: ChatMessage[], userMessage: string): Promise<ChatMessage[]>;
    compact?(context: ChatMessage[], maxTokens: number): Promise<ChatMessage[]>;
    afterTurn?(turnResult: { content: string; toolsUsed: string[] }): Promise<void>;
}

/** Run assemble hooks across all plugins in order */
export async function runAssemble(
    plugins: ContextEnginePlugin[],
    context: ChatMessage[],
    userMessage: string,
): Promise<ChatMessage[]> {
    let result = context;
    for (const plugin of plugins) {
        if (plugin.assemble) {
            try {
                result = await plugin.assemble(result, userMessage);
            } catch (e) {
                logger.warn(COMPONENT, `Plugin "${plugin.name}" assemble failed: ${(e as Error).message}`);
            }
        }
    }
    return result;
}

/** Run compact hooks across all plugins in order */
export async function runCompact(
    plugins: ContextEnginePlugin[],
    context: ChatMessage[],
    maxTokens: number,
): Promise<ChatMessage[]> {
    let result = context;
    for (const plugin of plugins) {
        if (plugin.compact) {
            try {
                result = await plugin.compact(result, maxTokens);
            } catch (e) {
                logger.warn(COMPONENT, `Plugin "${plugin.name}" compact failed: ${(e as Error).message}`);
            }
        }
    }
    return result;
}

/** Run afterTurn hooks across all plugins (fire-and-forget style, errors logged) */
export async function runAfterTurn(
    plugins: ContextEnginePlugin[],
    turnResult: { content: string; toolsUsed: string[] },
): Promise<void> {
    for (const plugin of plugins) {
        if (plugin.afterTurn) {
            try {
                await plugin.afterTurn(turnResult);
            } catch (e) {
                logger.warn(COMPONENT, `Plugin "${plugin.name}" afterTurn failed: ${(e as Error).message}`);
            }
        }
    }
}

/** Run ingest hooks across all plugins */
export async function runIngest(
    plugins: ContextEnginePlugin[],
    content: string,
    metadata: Record<string, unknown>,
): Promise<void> {
    for (const plugin of plugins) {
        if (plugin.ingest) {
            try {
                await plugin.ingest(content, metadata);
            } catch (e) {
                logger.warn(COMPONENT, `Plugin "${plugin.name}" ingest failed: ${(e as Error).message}`);
            }
        }
    }
}
