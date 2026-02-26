/**
 * TITAN — Parallel Tool Execution Engine
 * Runs independent tools concurrently via Promise.all.
 * No other OpenClaw clone does this — they all execute tools sequentially.
 * This gives TITAN a significant speed advantage.
 */
import logger from '../utils/logger.js';

const COMPONENT = 'ParallelTools';

interface ToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
}

interface ToolResult {
    toolCallId: string;
    name: string;
    content: string;
}

type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

/** Analyze tools for dependency — can they run in parallel? */
function canRunParallel(tools: ToolCall[]): boolean {
    if (tools.length <= 1) return false;

    // Tools that modify state shouldn't run concurrently with each other
    const writingTools = new Set([
        'write_file', 'edit_file', 'exec', 'shell', 'apply_patch',
        'process_kill', 'process_write', 'webhook_register',
    ]);

    // Count how many are writing tools
    const writerCount = tools.filter((t) => writingTools.has(t.name)).length;

    // If 0 or 1 writers, all can run in parallel
    // If 2+ writers, they must be sequential
    return writerCount <= 1;
}

/** Execute tools — in parallel when safe, sequential otherwise */
export async function executeToolsParallel(
    toolCalls: ToolCall[],
    executor: ToolExecutor,
): Promise<ToolResult[]> {
    if (toolCalls.length === 0) return [];

    if (toolCalls.length === 1) {
        // Single tool — just execute it
        const tc = toolCalls[0];
        const content = await executor(tc.name, tc.args);
        return [{ toolCallId: tc.id, name: tc.name, content }];
    }

    if (canRunParallel(toolCalls)) {
        // Parallel execution
        logger.info(COMPONENT, `⚡ Executing ${toolCalls.length} tools in parallel`);
        const start = Date.now();

        const results = await Promise.all(
            toolCalls.map(async (tc) => {
                const content = await executor(tc.name, tc.args);
                return { toolCallId: tc.id, name: tc.name, content };
            }),
        );

        const elapsed = Date.now() - start;
        logger.info(COMPONENT, `✅ Parallel execution complete: ${toolCalls.length} tools in ${elapsed}ms`);
        return results;
    }

    // Sequential execution (writers detected)
    logger.debug(COMPONENT, `Sequential execution: ${toolCalls.length} tools (write conflicts)`);
    const results: ToolResult[] = [];
    for (const tc of toolCalls) {
        const content = await executor(tc.name, tc.args);
        results.push({ toolCallId: tc.id, name: tc.name, content });
    }
    return results;
}

/** Get parallelism stats */
export function getParallelStats(toolCalls: ToolCall[]): {
    total: number;
    canParallelize: boolean;
    estimatedSpeedup: string;
} {
    const canP = canRunParallel(toolCalls);
    return {
        total: toolCalls.length,
        canParallelize: canP,
        estimatedSpeedup: canP && toolCalls.length > 1
            ? `~${toolCalls.length}x faster`
            : '1x (sequential)',
    };
}
