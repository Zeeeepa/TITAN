/**
 * TITAN — Universal Sub-Agent
 * Spawns isolated sub-agents that reuse processMessage() with constrained toolsets.
 * Generalizes the swarm.ts pattern into a universal delegation system.
 *
 * Key constraints:
 * - Max depth: 1 (sub-agents cannot spawn sub-sub-agents)
 * - Inherits parent's autonomy mode (can't escalate)
 * - Own stall/loop counters (isolated from parent)
 * - Cost counts toward parent session budget
 */
import { chat } from '../providers/router.js';
import { executeTools, getToolDefinitions } from './toolRunner.js';
import { loadConfig } from '../config/config.js';
import type { ChatMessage, ToolDefinition } from '../providers/base.js';
import logger from '../utils/logger.js';

const COMPONENT = 'SubAgent';

/** Currently running sub-agent count */
let activeSubAgents = 0;

export interface SubAgentConfig {
    name: string;
    task: string;
    /** Whitelist of tool names this sub-agent can use. Empty = all tools */
    tools?: string[];
    /** Model override (defaults to fast alias) */
    model?: string;
    /** System prompt override */
    systemPrompt?: string;
    /** Max tool rounds for this sub-agent (default: 10) */
    maxRounds?: number;
    /** Whether this is being called from within a sub-agent already */
    isNested?: boolean;
}

export interface SubAgentResult {
    content: string;
    toolsUsed: string[];
    success: boolean;
    durationMs: number;
    rounds: number;
}

/** Built-in sub-agent templates */
export const SUB_AGENT_TEMPLATES: Record<string, Partial<SubAgentConfig>> = {
    explorer: {
        name: 'Explorer',
        tools: ['web_search', 'web_fetch', 'browse_url', 'web_read', 'web_act'],
        systemPrompt: 'You are an Explorer sub-agent. Your job is to research and gather information from the web. Be thorough but efficient. Return a clear summary of your findings.',
    },
    coder: {
        name: 'Coder',
        tools: ['shell', 'read_file', 'write_file', 'edit_file', 'list_dir', 'code_exec'],
        systemPrompt: 'You are a Coder sub-agent. Your job is to write, read, and modify code. Be precise and follow best practices. Return the results of your work.',
    },
    browser: {
        name: 'Browser',
        tools: ['browse_url', 'browser_auto_nav', 'browser_search', 'web_read', 'web_act', 'browser_screenshot'],
        systemPrompt: 'You are a Browser sub-agent. Your job is to interact with web pages — navigate, fill forms, click buttons, and extract content. Be methodical and report what you see.',
    },
    analyst: {
        name: 'Analyst',
        tools: ['web_search', 'web_fetch', 'memory', 'graph_search', 'graph_remember'],
        systemPrompt: 'You are an Analyst sub-agent. Your job is to analyze information, find patterns, and produce structured reports. Be analytical and data-driven.',
    },
    researcher: {
        name: 'Researcher',
        tools: ['web_search', 'web_read', 'rag_search', 'rag_ingest'],
        systemPrompt: `You are a Deep Research sub-agent. Your job is to systematically research a question using multiple sources.

Methodology:
1. Break the question into 2-4 targeted search queries
2. Search and read multiple sources (aim for breadth and reliability)
3. Cross-verify key claims across at least 2 sources
4. Synthesize findings into a structured report with numbered citations

Output format:
- Start with a concise executive summary (2-3 sentences)
- Use markdown headers for sections
- Include numbered citations: [1], [2], etc.
- End with a "Sources" section listing all citations with URLs
- Flag any claims that could not be verified across multiple sources

Be thorough but efficient. Prefer authoritative sources. Always cite your sources.`,
        maxRounds: 15,
    },
    // ── Dev agents (TITAN_DEV only) ──────────────────────────
    dev_debugger: {
        name: 'Dev Debugger',
        tools: ['shell', 'read_file', 'write_file', 'debug_analyze', 'code_analyze'],
        systemPrompt: 'You are a debugging specialist for the TITAN framework. Analyze errors, read relevant source code, identify root causes, and suggest fixes. Always verify your analysis against the actual code.',
        maxRounds: 15,
    },
    dev_tester: {
        name: 'Dev Tester',
        tools: ['shell', 'read_file', 'write_file', 'test_generate', 'code_exec'],
        systemPrompt: 'You are a test engineer for the TITAN framework. Generate comprehensive vitest test cases, run them, fix failures, and ensure coverage. Understand code structure before writing tests.',
        maxRounds: 20,
    },
    dev_reviewer: {
        name: 'Dev Reviewer',
        tools: ['shell', 'read_file', 'code_review', 'code_analyze', 'deps_audit'],
        systemPrompt: 'You are a senior code reviewer for the TITAN framework. Perform multi-pass review: security, logic, performance, patterns. Be thorough but practical — flag real issues, not style nitpicks.',
        maxRounds: 10,
    },
    dev_architect: {
        name: 'Dev Architect',
        tools: ['shell', 'read_file', 'write_file', 'code_analyze', 'refactor_suggest', 'doc_generate'],
        systemPrompt: 'You are a software architect for the TITAN framework. Analyze codebase structure, suggest architectural improvements, refactor large files, and maintain documentation. Think in systems, not files.',
        maxRounds: 15,
    },
};

/**
 * Spawn a sub-agent that runs an isolated agent loop with constrained tools.
 * Returns when the sub-agent completes its task.
 */
export async function spawnSubAgent(config: SubAgentConfig): Promise<SubAgentResult> {
    const titanConfig = loadConfig();
    const startTime = Date.now();

    // Prevent sub-sub-agents
    if (config.isNested) {
        return {
            content: 'Error: Sub-agents cannot spawn further sub-agents (max depth = 1).',
            toolsUsed: [],
            success: false,
            durationMs: 0,
            rounds: 0,
        };
    }

    // Check concurrency limit
    const maxConcurrent = (titanConfig as Record<string, unknown>).subAgents
        ? ((titanConfig as Record<string, unknown>).subAgents as Record<string, unknown>).maxConcurrent as number || 3
        : 3;

    if (activeSubAgents >= maxConcurrent) {
        return {
            content: `Error: Maximum concurrent sub-agents (${maxConcurrent}) reached. Wait for one to finish.`,
            toolsUsed: [],
            success: false,
            durationMs: 0,
            rounds: 0,
        };
    }

    activeSubAgents++;
    const agentName = config.name || 'SubAgent';
    const maxRounds = config.maxRounds || 10;
    const model = config.model || titanConfig.agent.modelAliases?.fast || 'openai/gpt-4o-mini';

    logger.info(COMPONENT, `Spawning ${agentName}: "${config.task.slice(0, 80)}..." (model: ${model}, maxRounds: ${maxRounds})`);

    // Build tool whitelist
    let availableTools: ToolDefinition[];
    const allTools = getToolDefinitions();

    if (config.tools && config.tools.length > 0) {
        const toolSet = new Set(config.tools);
        // Never allow spawn_agent in sub-agents (prevents recursion)
        toolSet.delete('spawn_agent');
        availableTools = allTools.filter(t => toolSet.has(t.function.name));
    } else {
        // All tools except spawn_agent
        availableTools = allTools.filter(t => t.function.name !== 'spawn_agent');
    }

    const systemPrompt = config.systemPrompt || `You are the ${agentName} sub-agent of TITAN. Execute the task below using available tools. Be efficient and return a clear summary when done.`;

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: config.task },
    ];

    const toolsUsed: string[] = [];
    let finalContent = '';
    let rounds = 0;

    try {
        for (let round = 0; round < maxRounds; round++) {
            rounds = round + 1;
            logger.debug(COMPONENT, `[${agentName}] Round ${rounds}/${maxRounds}`);

            const response = await chat({
                model,
                messages,
                tools: availableTools.length > 0 ? availableTools : undefined,
                maxTokens: titanConfig.agent.maxTokens || 4096,
                temperature: 0.2,
            });

            // No tool calls = done
            if (!response.toolCalls || response.toolCalls.length === 0) {
                finalContent = response.content || 'Task completed.';
                break;
            }

            // Process tool calls
            messages.push({
                role: 'assistant',
                content: response.content || '',
                toolCalls: response.toolCalls,
            });

            const toolResults = await executeTools(response.toolCalls);

            for (const result of toolResults) {
                toolsUsed.push(result.name);
                messages.push({
                    role: 'tool',
                    content: result.content,
                    toolCallId: result.toolCallId,
                    name: result.name,
                });
            }

            // Last round fallback
            if (round === maxRounds - 1) {
                finalContent = response.content || 'Max rounds reached. Partial results returned.';
            }
        }

        const durationMs = Date.now() - startTime;
        logger.info(COMPONENT, `${agentName} completed in ${durationMs}ms (${rounds} rounds, ${toolsUsed.length} tool calls)`);

        return {
            content: finalContent,
            toolsUsed: [...new Set(toolsUsed)],
            success: !finalContent.toLowerCase().startsWith('error'),
            durationMs,
            rounds,
        };
    } catch (err) {
        const durationMs = Date.now() - startTime;
        logger.error(COMPONENT, `${agentName} failed: ${(err as Error).message}`);
        return {
            content: `Sub-agent error: ${(err as Error).message}`,
            toolsUsed: [...new Set(toolsUsed)],
            success: false,
            durationMs,
            rounds,
        };
    } finally {
        activeSubAgents--;
    }
}

/** Get count of currently active sub-agents */
export function getActiveSubAgentCount(): number {
    return activeSubAgents;
}
