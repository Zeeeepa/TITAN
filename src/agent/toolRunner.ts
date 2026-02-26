/**
 * TITAN — Tool Runner
 * Executes tool calls from the LLM with sandboxing, timeouts, and result formatting.
 */
import type { ToolCall, ToolDefinition } from '../providers/base.js';
import logger from '../utils/logger.js';
import { loadConfig } from '../config/config.js';

const COMPONENT = 'ToolRunner';

/** Tool execution result */
export interface ToolResult {
    toolCallId: string;
    name: string;
    content: string;
    success: boolean;
    durationMs: number;
}

/** A registered tool handler */
export interface ToolHandler {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}

/** Global tool registry */
const toolRegistry: Map<string, ToolHandler> = new Map();

/** Register a tool */
export function registerTool(handler: ToolHandler): void {
    toolRegistry.set(handler.name, handler);
    logger.debug(COMPONENT, `Registered tool: ${handler.name}`);
}

/** Unregister a tool */
export function unregisterTool(name: string): void {
    toolRegistry.delete(name);
}

/** Get all registered tools */
export function getRegisteredTools(): ToolHandler[] {
    return Array.from(toolRegistry.values());
}

/** Convert registered tools to LLM tool definitions */
export function getToolDefinitions(): ToolDefinition[] {
    const config = loadConfig();
    const allowed = new Set(config.security.allowedTools);
    const denied = new Set(config.security.deniedTools);

    return Array.from(toolRegistry.values())
        .filter((tool) => {
            if (denied.has(tool.name)) return false;
            if (allowed.size > 0 && !allowed.has(tool.name)) return false;
            return true;
        })
        .map((tool) => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
}

/** Execute a single tool call */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const config = loadConfig();
    const startTime = Date.now();
    const handler = toolRegistry.get(toolCall.function.name);

    if (!handler) {
        return {
            toolCallId: toolCall.id,
            name: toolCall.function.name,
            content: `Error: Unknown tool "${toolCall.function.name}"`,
            success: false,
            durationMs: Date.now() - startTime,
        };
    }

    // Check permissions
    if (config.security.deniedTools.includes(handler.name)) {
        return {
            toolCallId: toolCall.id,
            name: handler.name,
            content: `Error: Tool "${handler.name}" is denied by security policy`,
            success: false,
            durationMs: Date.now() - startTime,
        };
    }

    try {
        // Parse arguments
        let args: Record<string, unknown> = {};
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch {
            args = {};
        }

        logger.info(COMPONENT, `Executing tool: ${handler.name}`);

        // Execute with timeout
        const timeout = config.security.commandTimeout || 30000;
        const result = await Promise.race([
            handler.execute(args),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Tool "${handler.name}" timed out after ${timeout}ms`)), timeout)
            ),
        ]);

        const durationMs = Date.now() - startTime;
        logger.info(COMPONENT, `Tool ${handler.name} completed in ${durationMs}ms`);

        return {
            toolCallId: toolCall.id,
            name: handler.name,
            content: result,
            success: true,
            durationMs,
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = (error as Error).message;
        logger.error(COMPONENT, `Tool ${handler.name} failed: ${errorMsg}`);

        return {
            toolCallId: toolCall.id,
            name: handler.name,
            content: `Error: ${errorMsg}`,
            success: false,
            durationMs,
        };
    }
}

/** Execute multiple tool calls (in parallel where possible) */
export async function executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const config = loadConfig();
    const maxConcurrent = config.security.maxConcurrentTasks || 5;

    // Execute in batches
    const results: ToolResult[] = [];
    for (let i = 0; i < toolCalls.length; i += maxConcurrent) {
        const batch = toolCalls.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(batch.map(executeTool));
        results.push(...batchResults);
    }

    return results;
}
