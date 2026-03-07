/**
 * TITAN — Tool Runner
 * Executes tool calls from the LLM with sandboxing, timeouts, and result formatting.
 */
import type { ToolCall, ToolDefinition } from '../providers/base.js';
import { executeToolsParallel } from './parallelTools.js';
import logger from '../utils/logger.js';
import { loadConfig } from '../config/config.js';
import { checkAutonomy } from './autonomy.js';
import { isToolSkillEnabled } from '../skills/registry.js';

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
            if (!isToolSkillEnabled(tool.name)) return false;
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
export async function executeTool(toolCall: ToolCall, channel?: string): Promise<ToolResult> {
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

    // Check if parent skill is enabled
    if (!isToolSkillEnabled(handler.name)) {
        return {
            toolCallId: toolCall.id,
            name: handler.name,
            content: `Error: Tool "${handler.name}" is disabled — its parent skill is turned off. Enable it in Mission Control.`,
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

        // Autonomy gate: check if the tool is permitted under current mode
        const autonomyResult = await checkAutonomy(handler.name, args, channel);
        if (!autonomyResult.allowed) {
            return {
                toolCallId: toolCall.id,
                name: handler.name,
                content: 'Action blocked by autonomy policy: ' + (autonomyResult.reason || 'Not permitted'),
                success: false,
                durationMs: Date.now() - startTime,
            };
        }

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
            content: result.length > 50000 ? result.slice(0, 50000) + '\n\n[Output truncated at 50KB]' : result,
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

/** Execute multiple tool calls (in parallel where possible, with write-conflict detection) */
export async function executeTools(toolCalls: ToolCall[], channel?: string): Promise<ToolResult[]> {
    // Single tool — fast path
    if (toolCalls.length <= 1) {
        return Promise.all(toolCalls.map(tc => executeTool(tc, channel)));
    }

    // Multiple tools — use parallelTools engine with write-conflict detection
    const parallelCalls = toolCalls.map(tc => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* use empty */ }
        return { id: tc.id, name: tc.function.name, args };
    });

    const executor = async (name: string, args: Record<string, unknown>): Promise<string> => {
        // Build a synthetic ToolCall for executeTool
        const syntheticTc: ToolCall = {
            id: '',
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
        };
        const result = await executeTool(syntheticTc, channel);
        return result.content;
    };

    const parallelResults = await executeToolsParallel(parallelCalls, executor);

    // Map back to ToolResult format with full metadata
    return parallelResults.map(pr => ({
        toolCallId: pr.toolCallId,
        name: pr.name,
        content: pr.content,
        success: !pr.content.startsWith('Error:'),
        durationMs: 0,
    }));
}
