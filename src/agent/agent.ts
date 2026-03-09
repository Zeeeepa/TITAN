/**
 * TITAN — Core Agent Loop
 * The main agent: receives messages, builds context, calls LLM, handles tools, responds.
 */
import { existsSync, readFileSync } from 'fs';
import { chat, chatStream } from '../providers/router.js';
import { loadConfig } from '../config/config.js';
import { getOrCreateSession, addMessage, getContextMessages } from './session.js';
import { executeTools, getToolDefinitions, type ToolResult } from './toolRunner.js';
import { recordUsage, searchMemories } from '../memory/memory.js';
import { recordToolResult, getLearningContext } from '../memory/learning.js';
import { buildPersonalContext } from '../memory/relationship.js';
import { heartbeat, recordToolCall, checkResponse, getNudgeMessage, clearSession, setStallHandler, setAutonomousMode } from './stallDetector.js';
import { checkForLoop, resetLoopDetection } from './loopDetection.js';
import { routeModel, maybeCompressContext, recordTokenUsage } from './costOptimizer.js';
import { getCachedResponse, setCachedResponse } from './responseCache.js';
import { buildSmartContext } from './contextManager.js';
import { getSwarmRouterTools, runSubAgent, type Domain } from './swarm.js';
import { shouldDeliberate, analyze, generatePlan, executePlan, handleApproval, getDeliberation, cancelDeliberation, formatPlanResults } from './deliberation.js';
import type { ChatMessage, ChatResponse, ToolCall } from '../providers/base.js';
import { initGraph, addEpisode, getGraphContext } from '../memory/graph.js';
import { isAvailable as isBrainAvailable, selectTools as brainSelectTools, ensureLoaded as ensureBrainLoaded } from './brain.js';
import { DEFAULT_CORE_TOOLS } from './toolSearch.js';
import { shouldReflect, reflect } from './reflection.js';
import { analyzeForDelegation, executeDelegationPlan } from './orchestrator.js';
import { spawnSubAgent, SUB_AGENT_TEMPLATES } from './subAgent.js';
import { registerTool } from './toolRunner.js';
import logger from '../utils/logger.js';
import { TITAN_NAME, AGENTS_MD, SOUL_MD, TOOLS_MD } from '../utils/constants.js';

const COMPONENT = 'Agent';
const MAX_TOOL_ROUNDS = 10;

// ── Register spawn_agent tool ────────────────────────────────────
let spawnAgentRegistered = false;
function ensureSpawnAgentRegistered(): void {
    if (spawnAgentRegistered) return;
    spawnAgentRegistered = true;
    registerTool({
        name: 'spawn_agent',
        description: 'Spawn a sub-agent to handle a specific task. Sub-agents run in isolation with their own tool set and return results. Available templates: explorer (web research), coder (file/code), browser (interactive web), analyst (analysis/memory).',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name for the sub-agent (e.g., "Explorer", "Coder")' },
                task: { type: 'string', description: 'The task to delegate to the sub-agent' },
                template: { type: 'string', description: 'Template: "explorer", "coder", "browser", "analyst" (optional)' },
                model: { type: 'string', description: 'Model override (default: fast alias)' },
            },
            required: ['task'],
        },
        execute: async (args) => {
            const template = SUB_AGENT_TEMPLATES[(args.template as string) || ''] || {};
            const result = await spawnSubAgent({
                name: (args.name as string) || template.name || 'SubAgent',
                task: args.task as string,
                tools: template.tools,
                systemPrompt: template.systemPrompt,
                model: args.model as string | undefined,
            });
            return `[Sub-Agent: ${result.success ? 'SUCCESS' : 'FAILED'}] (${result.rounds} rounds, ${result.durationMs}ms)\n${result.content}`;
        },
    });
}

/** Strip leaked tool-call JSON from LLM responses (common with small local models) */
function stripToolJson(text: string): string {
    return text.replace(/\s*\{"(?:name|tool_call)":\s*"[^"]+",\s*"(?:parameters|arguments)":\s*\{[^}]*\}\s*\}\s*/g, '').trim();
}

// Wire the stall detector so silence timeouts are logged rather than silently discarded
setStallHandler(async (event) => {
    logger.warn(COMPONENT, `Stall event [${event.type}] in session ${event.sessionId}: ${event.detail} (nudge #${event.nudgeCount})`);
    return event.detail;
});

/** Agent response with metadata */
export interface AgentResponse {
    content: string;
    sessionId: string;
    toolsUsed: string[];
    tokenUsage: { prompt: number; completion: number; total: number };
    model: string;
    durationMs: number;
}

/** Read a workspace prompt file if it exists */
function readPromptFile(path: string): string {
    try {
        if (existsSync(path)) return readFileSync(path, 'utf-8');
    } catch { /* ignore */ }
    return '';
}

/** Module-level cache for prompt files — avoids re-reading on every request */
const cachedPromptFiles: Map<string, string> = new Map();

/** Read a prompt file with a module-level cache (files are stable for the process lifetime) */
function getCachedPromptFile(path: string): string {
    if (cachedPromptFiles.has(path)) return cachedPromptFiles.get(path)!;
    const content = readPromptFile(path);
    cachedPromptFiles.set(path, content);
    return content;
}

/** Build the system prompt for the agent */
async function buildSystemPrompt(config: ReturnType<typeof loadConfig>, userMessage?: string): Promise<string> {
    const modelId = config.agent.model || 'unknown';
    const customPrompt = config.agent.systemPrompt || '';
    const memories = await searchMemories('preference');
    const memoryContext = memories.length > 0
        ? `\n\nUser preferences I remember:\n${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
        : '';

    // Read workspace prompt files (like OpenClaw's AGENTS.md, SOUL.md, TOOLS.md)
    // Using cached reads — these files don't change while the process is running
    const agentsMd = getCachedPromptFile(AGENTS_MD);
    const soulMd = getCachedPromptFile(SOUL_MD);
    const toolsMd = getCachedPromptFile(TOOLS_MD);

    const workspaceContext = [
        agentsMd ? `\n## Agent Instructions (AGENTS.md)\n${agentsMd}` : '',
        soulMd ? `\n## Personality (SOUL.md)\n${soulMd}` : '',
        toolsMd ? `\n## Tool Notes (TOOLS.md)\n${toolsMd}` : '',
    ].filter(Boolean).join('\n');

    // Continuous learning context
    const learningContext = getLearningContext();

    // Personal context from Relationship Memory
    const personalContext = buildPersonalContext();

    // Knowledge graph context — relevant memories from Graphiti
    const graphContext = userMessage ? getGraphContext(userMessage) : '';
    const graphSection = graphContext ? `\n\n## Knowledge Graph Memory\n${graphContext}` : '';

    return `## CRITICAL: Your Identity
You are TITAN (The Intelligent Task Automation Network). Your name is TITAN. You were built by Tony Elliott.
You are powered by the language model "${modelId}", but your identity is always TITAN — never Claude, never GPT, never Gemini, never any other product name.
- If asked "who are you?": say "I'm TITAN, your personal AI assistant built by Tony Elliott."
- If asked "what model are you?": say "I'm TITAN, powered by ${modelId}."
- NEVER say you are "Claude" or "made by Anthropic". NEVER say you are GPT, Gemini, or any other product name. NEVER reveal you are a third-party model product.

## About You
You are ${TITAN_NAME}, The Intelligent Task Automation Network — a powerful personal AI assistant. You are like JARVIS from Iron Man: proactive, knowledgeable, and deeply personalized to this specific user.

## Core Capabilities
- Execute shell commands and scripts on the user's system
- Read, write, edit, and manage files
- Browse the web and extract information (browser control via CDP)
- Schedule automated tasks with cron
- Set up webhook endpoints
- Search the web for current information
- Control browser sessions (navigate, snapshot, evaluate)
- Manage agent sessions (list, history, send, close)
- Remember facts and user preferences persistently

## Behavior Guidelines
- Be proactive: if a task implies follow-up actions, suggest or perform them
- Be concise but thorough in responses
- When executing commands, always explain what you're doing and why
- If a task could be destructive (deleting files, etc.), confirm with the user first
- **ALWAYS use your tools to complete tasks — NEVER just describe what could be done or suggest URLs for the user to visit. Execute the task yourself.**
- For weather requests, ALWAYS use the \`weather\` tool — it returns accurate real-time data. Do NOT use web_search for weather.
- When the user asks for other information (prices, news, etc.), use web_search to find it, then use web_fetch to read the full page content and extract the actual data. Return the data directly — do NOT tell the user to go check a website.
- Remember important information about the user for future conversations
- If you encounter an error, try alternative approaches before reporting failure
- If web_search results don't contain enough detail, follow up with web_fetch on the most relevant URL to get the full content

## Security
- Never expose API keys, passwords, or other secrets
- Don't execute commands that could compromise system security without explicit approval
- Respect file system boundaries set in the configuration

## Continuous Learning
You get smarter with every interaction. Below is your accumulated knowledge:
${learningContext}
${customPrompt ? `\n## Custom Instructions\n${customPrompt}` : ''}${workspaceContext}${memoryContext}${personalContext}${graphSection}

## Memory Tools
You have access to a knowledge graph (temporal memory). Use these tools actively:
- **graph_remember**: Record important facts, decisions, or events for long-term memory
- **graph_search**: Search past conversations and knowledge by keyword
- **graph_entities**: List known people, topics, projects, or places
- **graph_recall**: Recall everything about a specific entity
Use graph_remember when you learn something important about the user, their projects, or their preferences. This persists across sessions.`;
}

/** Streaming callbacks for real-time token delivery */
export interface StreamCallbacks {
    onToken?: (token: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
}

/** Process a user message through the agent loop */
export async function processMessage(
    message: string,
    channel: string = 'cli',
    userId: string = 'default',
    overrides?: { model?: string; systemPrompt?: string },
    streamCallbacks?: StreamCallbacks,
): Promise<AgentResponse> {
    const startTime = Date.now();
    const config = loadConfig();
    const session = getOrCreateSession(channel, userId);

    logger.info(COMPONENT, `Processing message in session ${session.id} (${channel}/${userId})`);

    // ── Register spawn_agent tool if sub-agents enabled ───────
    const subAgentConfig = (config as Record<string, unknown>).subAgents as { enabled?: boolean } | undefined;
    if (subAgentConfig?.enabled !== false) {
        ensureSpawnAgentRegistered();
    }

    // ── Determine effective limits based on autonomy mode ─────
    const isAutonomous = config.autonomy.mode === 'autonomous';
    const effectiveMaxRounds = isAutonomous
        ? (config.autonomy as Record<string, unknown>).maxToolRoundsOverride as number || 25
        : MAX_TOOL_ROUNDS;
    const reflectionEnabled = config.agent.reflectionEnabled ?? true;
    const reflectionInterval = config.agent.reflectionInterval ?? 3;

    // ── Brain: background warmup (non-blocking) ──────────────
    ensureBrainLoaded().catch(() => {});

    // ── Deliberation intercept ─────────────────────────────────
    const existingDelib = getDeliberation(session.id);

    // Handle approval/cancellation of pending deliberation
    if (existingDelib?.stage === 'awaiting_approval') {
        const lower = message.trim().toLowerCase();
        if (lower === 'yes' || lower === 'y' || lower === 'approve') {
            addMessage(session, 'user', message);
            const state = handleApproval(session.id, true)!;
            const updatedState = await executePlan(state, config);
            const content = formatPlanResults(updatedState);
            addMessage(session, 'assistant', content, { model: config.agent.model, tokenCount: 0 });
            return { content, sessionId: session.id, toolsUsed: ['deliberation'], tokenUsage: { prompt: 0, completion: 0, total: 0 }, model: config.agent.model, durationMs: Date.now() - startTime };
        } else if (lower === 'no' || lower === 'n' || lower === 'cancel') {
            addMessage(session, 'user', message);
            handleApproval(session.id, false);
            const content = 'Plan cancelled. Let me know if you want to try a different approach.';
            addMessage(session, 'assistant', content, { model: config.agent.model, tokenCount: 0 });
            return { content, sessionId: session.id, toolsUsed: [], tokenUsage: { prompt: 0, completion: 0, total: 0 }, model: config.agent.model, durationMs: Date.now() - startTime };
        }
        // If neither yes/no, treat as a modification — cancel and fall through to normal processing
        cancelDeliberation(session.id);
    }

    // Don't start a new deliberation if one is already executing
    if (existingDelib?.stage === 'executing') {
        // Fall through to normal processing
    } else if (shouldDeliberate(message, config)) {
        addMessage(session, 'user', message);
        const state = await analyze(message, session.id, config);
        if (state.stage === 'planning') {
            const planned = await generatePlan(state, config);
            if (planned.stage === 'awaiting_approval' && planned.planMarkdown) {
                const content = planned.planMarkdown;
                addMessage(session, 'assistant', content, { model: config.agent.model, tokenCount: 0 });
                return { content, sessionId: session.id, toolsUsed: ['deliberation'], tokenUsage: { prompt: 0, completion: 0, total: 0 }, model: config.agent.model, durationMs: Date.now() - startTime };
            } else if (planned.stage === 'executing') {
                const executed = await executePlan(planned, config);
                const content = formatPlanResults(executed);
                addMessage(session, 'assistant', content, { model: config.agent.model, tokenCount: 0 });
                return { content, sessionId: session.id, toolsUsed: ['deliberation'], tokenUsage: { prompt: 0, completion: 0, total: 0 }, model: config.agent.model, durationMs: Date.now() - startTime };
            } else {
                // Planning failed, fall through to normal processing
                logger.warn(COMPONENT, `Deliberation failed, falling through: ${planned.error || 'unknown error'}`);
            }
        }
    }

    // ── Pre-routing: intercept queries with known data tools ──
    // Some queries (weather, etc.) have dedicated APIs that return accurate data.
    // Pre-fetch this data and inject it so the LLM doesn't hallucinate.
    let preRoutedContext = '';
    if (/\b(?:weather|forecast|temperature)\b/i.test(message)) {
        // Split on "and"/"also"/","/"&" FIRST to separate multiple locations
        const segments = message.split(/\b(?:and|also|&)\b|,/i).filter(s => /\b(?:weather|forecast|temperature|\d{5})\b/i.test(s) || /[A-Z][a-z]+/.test(s));
        const locations: string[] = [];
        for (const seg of segments.length > 0 ? segments : [message]) {
            const loc = seg.toLowerCase()
                .replace(/\b(weather|forecast|temperature|temp|today|tonight|tomorrow|this week|current|right now|conditions|for|in|at|the|what|is|whats|what's|check|get|show|me|please|how|hot|cold|also|can you)\b/g, '')
                .replace(/[?,!.]/g, '').trim().replace(/\s+/g, ' ');
            if (loc.length >= 2) locations.push(loc);
        }
        // Fetch all locations in parallel for speed
        const weatherResults = await Promise.allSettled(locations.map(async (loc) => {
            const resp = await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`, {
                headers: { 'User-Agent': 'TITAN/1.0' },
                signal: AbortSignal.timeout(12000),
            });
            if (!resp.ok) return null;
            const d = await resp.json() as Record<string, unknown>;
            const cur = (d.current_condition as Array<Record<string, unknown>>)?.[0];
            const area = (d.nearest_area as Array<Record<string, unknown>>)?.[0];
            const day = (d.weather as Array<Record<string, unknown>>)?.[0];
            if (!cur) return null;
            const areaName = area
                ? `${(area.areaName as Array<{value: string}>)?.[0]?.value}, ${(area.region as Array<{value: string}>)?.[0]?.value}`
                : loc;
            const desc = (cur.weatherDesc as Array<{value: string}>)?.[0]?.value || '';
            const astro = (day?.astronomy as Array<Record<string, string>>)?.[0];
            const hourly = day?.hourly as Array<Record<string, unknown>> | undefined;
            let part = `Weather for ${areaName}: ${cur.temp_F}°F (feels ${cur.FeelsLikeF}°F), ${desc}, Humidity ${cur.humidity}%, Wind ${cur.windspeedMiles} mph ${cur.winddir16Point}, UV ${cur.uvIndex}`;
            if (day) part += `, High ${day.maxtempF}°F, Low ${day.mintempF}°F`;
            if (astro) part += `, Sunrise ${astro.sunrise}, Sunset ${astro.sunset}`;
            if (hourly) {
                const evening = hourly.find(h => h.time === '2100');
                if (evening) {
                    const eDesc = (evening.weatherDesc as Array<{value: string}>)?.[0]?.value || '';
                    part += ` | Tonight: ${evening.tempF}°F, ${eDesc}, Wind ${evening.windspeedMiles} mph, ${evening.chanceofrain}% rain`;
                }
            }
            return part;
        }));
        const weatherParts = weatherResults
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);
        if (weatherParts.length > 0) {
            preRoutedContext = `\n\n[REAL-TIME WEATHER DATA — present this data to the user in a nicely formatted response. Do NOT call any tools for weather — use ONLY the data below.]\n${weatherParts.join('\n')}`;
            logger.info(COMPONENT, `Pre-routed weather for ${weatherParts.length} location(s): [${locations.join(', ')}]`);
        }
    }

    // Add user message to session history
    addMessage(session, 'user', message);

    // Initialize graph memory (lazy, only loads once)
    initGraph();

    // Auto-record user message to knowledge graph (fire-and-forget)
    addEpisode(`[${channel}/${userId}] ${message}`, channel).catch(() => {});

    // Build context (pass user message for graph context injection)
    let systemPrompt = await buildSystemPrompt(config, message);
    if (overrides?.systemPrompt) systemPrompt = overrides.systemPrompt + '\n\n' + systemPrompt;
    if (preRoutedContext) systemPrompt += preRoutedContext;
    const historyMessages = getContextMessages(session);
    const tools = getToolDefinitions();

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
    ];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const toolsUsed: string[] = [];
    let finalContent = '';
    let modelUsed = config.agent.model;

    // ── Cost optimizer: smart model routing ─────────────────
    let { model: activeModel, reason: routingReason } = routeModel(message, config.agent.model);
    if (overrides?.model) activeModel = overrides.model;
    // Session override has highest priority (set via /model command)
    if (session.modelOverride) {
        activeModel = session.modelOverride;
        routingReason = 'session override (/model)';
    }
    if (activeModel !== config.agent.model) {
        logger.info(COMPONENT, `Cost router: ${config.agent.model} → ${activeModel} (${routingReason})`);
    }
    modelUsed = activeModel;

    // ── Swarm Interceptor: ──────────────────────────────────────
    // If using kimi-k2.5, proxy the tools through Swarm Routers
    // to prevent context collapse from the massive generic 23-tool schema.
    const isKimiSwarm = activeModel.includes('kimi-k2.5');
    let activeTools = isKimiSwarm ? getSwarmRouterTools() : tools;
    if (isKimiSwarm) {
        logger.info(COMPONENT, `[Swarm] Intercepted kimi-k2.5 payload. Downgrading context from ${tools.length} to ${activeTools.length} router agents.`);
    }

    // Small-model tool reduction — prevent tool hallucination on models <8B
    // Validated on Ryzen 7 5825U: llama3.2:3b hallucinates web_search on trivial questions
    const SMALL_MODEL_PATTERNS = ['llama3.2', 'llama3.1:8b', 'phi', 'gemma:2b', 'qwen3.5:4b', 'tinyllama', 'dolphin3'];
    const isSmallModel = SMALL_MODEL_PATTERNS.some(p => activeModel.toLowerCase().includes(p));
    if (isSmallModel && !isKimiSwarm) {
        // web_search removed: small models hallucinate tool calls for trivial questions
        const CORE_TOOL_NAMES = ['shell', 'read_file', 'write_file', 'edit_file', 'list_dir', 'memory'];
        const coreTools = activeTools.filter(t => CORE_TOOL_NAMES.includes(t.function.name));
        logger.info(COMPONENT, `[SmallModel] Reducing tools from ${activeTools.length} to ${coreTools.length} for ${activeModel}`);
        activeTools = coreTools;
    }

    // ── Brain: intelligent tool pre-filtering ──────────────────
    if (!isKimiSwarm && !isSmallModel && isBrainAvailable()) {
        const brainFiltered = await brainSelectTools(message, activeTools);
        if (brainFiltered.length > 0 && brainFiltered.length < activeTools.length) {
            logger.info(COMPONENT, `[Brain] Filtered: ${activeTools.length} → ${brainFiltered.length} tools`);
            activeTools = brainFiltered;
        }
    }

    // ── Tool Search: compact tool mode ──────────────────────────
    // Send only core tools + tool_search to the LLM instead of all 80+.
    // The LLM calls tool_search to discover additional tools as needed.
    const toolSearchConfig = (config as Record<string, unknown>).toolSearch as {
        enabled?: boolean;
        coreTools?: string[];
    } | undefined;
    const toolSearchEnabled = toolSearchConfig?.enabled ?? true;
    const allToolsBackup = activeTools;
    const discoveredTools = new Set<string>();

    if (toolSearchEnabled && !isKimiSwarm && !isSmallModel && activeTools.length > 12) {
        const coreNames = new Set(toolSearchConfig?.coreTools ?? DEFAULT_CORE_TOOLS);
        activeTools = activeTools.filter(t => coreNames.has(t.function.name));
        logger.info(COMPONENT, `[ToolSearch] Compact mode: ${allToolsBackup.length} → ${activeTools.length} tools (${allToolsBackup.length - activeTools.length} discoverable via tool_search)`);
    }

    // ── Stall detector: configure for autonomy mode + start heartbeat ──
    setAutonomousMode(isAutonomous);
    heartbeat(session.id);

    // ── Orchestration: check if task benefits from sub-agent delegation ──
    const autoDelegate = (subAgentConfig as Record<string, unknown> | undefined)?.autoDelegate !== false;
    if (isAutonomous && autoDelegate && message.split(/\s+/).length >= 10) {
        try {
            const delegationPlan = await analyzeForDelegation(message);
            if (delegationPlan.shouldDelegate && delegationPlan.tasks.length >= 2) {
                logger.info(COMPONENT, `Orchestrator: delegating to ${delegationPlan.tasks.length} sub-agents`);
                const orchResult = await executeDelegationPlan(delegationPlan);
                if (orchResult.subResults.length > 0 && orchResult.subResults.some(r => r.success)) {
                    // Inject sub-agent results as context for the main agent
                    messages.push({
                        role: 'user',
                        content: `[Sub-agent results for your request]\n\n${orchResult.content}\n\nSynthesize these results into a coherent response for the user.`,
                    });
                }
            }
        } catch (err) {
            logger.warn(COMPONENT, `Orchestration failed, falling through: ${(err as Error).message}`);
        }
    }

    // Agent loop with tool calling
    for (let round = 0; round < effectiveMaxRounds; round++) {
        logger.debug(COMPONENT, `Round ${round + 1}: ${messages.length} messages, ${activeTools.length} tools: [${activeTools.map(t => t.function.name).join(', ')}]`);

        // ── Reflection: periodic self-assessment (replaces forced summarization) ───
        if (!isAutonomous && round >= 5) {
            // In supervised mode, keep the forced summarization for backward compat
            messages.push({
                role: 'user',
                content: 'IMPORTANT: You have already used enough tools. Do NOT call any more tools. Summarize the information you have gathered and respond to the user directly with a clear answer NOW.',
            });
            logger.info(COMPONENT, `[Round ${round + 1}] Injecting forced summarization prompt`);
        } else if (reflectionEnabled && shouldReflect(round, reflectionInterval)) {
            // Reflection: let the LLM decide whether to continue
            try {
                const lastToolResult = messages.filter(m => m.role === 'tool').slice(-1)[0]?.content || '';
                const reflectionResult = await reflect(round, toolsUsed, message, lastToolResult);
                if (reflectionResult.decision === 'stop') {
                    logger.info(COMPONENT, `Reflection says stop at round ${round + 1}: ${reflectionResult.reasoning}`);
                    messages.push({
                        role: 'user',
                        content: `You've reflected on your progress and decided you have enough information. Respond to the user now with your findings. Reasoning: ${reflectionResult.reasoning}`,
                    });
                } else if (reflectionResult.decision === 'adjust') {
                    messages.push({
                        role: 'user',
                        content: `Reflection suggests adjusting approach: ${reflectionResult.reasoning}. Try a different strategy.`,
                    });
                }
                // 'continue' → no injection, just keep going
            } catch {
                // Reflection failed, continue without it
            }
        }

        // ── Cost optimizer: context compression to save tokens ───
        const { messages: compressedMessages, didCompress, savedTokens } = maybeCompressContext(
            messages.filter((m) => m.role !== 'tool' || round < 3) // keep recent tool results
        );
        if (didCompress) {
            logger.info(COMPONENT, `Context compressed, saved ~${savedTokens} tokens`);
            messages.length = 0;
            messages.push(...compressedMessages);
        }

        // ── Smart context manager: second compression layer ───
        const tokenBudget = (config.agent.maxTokens || 4096) * 4; // rough context window estimate
        const smartMessages = buildSmartContext(compressedMessages as ChatMessage[], tokenBudget);

        // ── Response cache: check before calling LLM ───
        const cachedResponse = getCachedResponse(smartMessages, activeModel);
        if (cachedResponse) {
            logger.info(COMPONENT, `Cache hit — skipping LLM call`);
            finalContent = cachedResponse;
            break;
        }

        const thinkingMode = session.thinkingOverride || config.agent.thinkingMode || 'off';
        const chatOptions = {
            model: activeModel,
            messages: smartMessages,
            tools: activeTools.length > 0 ? activeTools : undefined,
            maxTokens: config.agent.maxTokens,
            temperature: config.agent.temperature,
            thinking: thinkingMode !== 'off',
            thinkingLevel: thinkingMode,
        };

        let response: ChatResponse;
        if (streamCallbacks?.onToken) {
            // Stream tokens in real-time, reassemble into ChatResponse
            let streamContent = '';
            const streamToolCalls: ToolCall[] = [];
            for await (const chunk of chatStream(chatOptions)) {
                if (chunk.type === 'text' && chunk.content) {
                    streamContent += chunk.content;
                    streamCallbacks.onToken(chunk.content);
                } else if (chunk.type === 'tool_call' && chunk.toolCall) {
                    streamToolCalls.push(chunk.toolCall);
                    streamCallbacks.onToolCall?.(chunk.toolCall.function.name, JSON.parse(chunk.toolCall.function.arguments || '{}'));
                } else if (chunk.type === 'error') {
                    logger.error(COMPONENT, `Stream error: ${chunk.error}`);
                }
            }
            response = {
                id: `stream-${Date.now()}`,
                content: streamContent,
                toolCalls: streamToolCalls.length > 0 ? streamToolCalls : undefined,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                finishReason: streamToolCalls.length > 0 ? 'tool_calls' : 'stop',
                model: activeModel,
            };
        } else {
            response = await chat(chatOptions);
        }

        modelUsed = response.model;
        const promptTokens = response.usage?.promptTokens || 0;
        const completionTokens = response.usage?.completionTokens || 0;
        totalPromptTokens += promptTokens;
        totalCompletionTokens += completionTokens;

        // ── Cost tracking + budget check ─────────────────────
        const costCheck = recordTokenUsage(session.id, activeModel, promptTokens, completionTokens);
        if (costCheck.budgetExceeded) {
            finalContent = '⚠️ Daily spending limit reached. TITAN has paused to keep your API costs under control. You can increase the limit in settings or wait until tomorrow.';
            break;
        }

        // ── Stall detector: heartbeat ──────
        heartbeat(session.id);

        // If no tool calls, we have the final response
        if (!response.toolCalls || response.toolCalls.length === 0) {
            const stallEvent = checkResponse(session.id, response.content, round, MAX_TOOL_ROUNDS);
            if (stallEvent) {
                const nudge = getNudgeMessage(stallEvent);
                logger.warn(COMPONENT, `Stall [${stallEvent.type}] — injecting nudge`);
                messages.push({ role: 'user', content: nudge });
                continue;
            }
            finalContent = stripToolJson(response.content);

            // ── Response cache: store final text responses ───
            setCachedResponse(smartMessages, activeModel, finalContent);

            break;
        }

        // Handle tool calls
        logger.info(COMPONENT, `LLM requested ${response.toolCalls.length} tool call(s)`);

        // Add assistant message with tool calls to history
        messages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: response.toolCalls,
        });

        // Execute tools
        let toolResults: ToolResult[] = [];
        try {
            if (isKimiSwarm) {
                // Intercept execution and route to Swarm Sub-Agents
                for (const tc of response.toolCalls) {
                    if (tc.function.name.startsWith('delegate_to_')) {
                        const domainMatch = tc.function.name.match(/delegate_to_(.*)_agent/);
                        const domain = (domainMatch ? domainMatch[1] : 'file') as Domain;
                        let args;
                        try { args = JSON.parse(tc.function.arguments); } catch { args = { instruction: '' }; }

                        const startTime = Date.now();
                        const resultString = await runSubAgent(domain, args.instruction, activeModel);

                        toolResults.push({
                            toolCallId: tc.id,
                            name: tc.function.name,
                            content: resultString,
                            success: !resultString.includes('Error'),
                            durationMs: Date.now() - startTime
                        });
                    }
                }
            } else {
                toolResults = await executeTools(response.toolCalls, channel);
            }
        } catch (err) {
            logger.error(COMPONENT, `Tool execution error: ${(err as Error).message}`);
            finalContent = 'An error occurred while executing tools. Please try again.';
            break;
        }

        // Add tool results to messages and record for learning
        let loopBroken = false;
        for (const result of toolResults) {
            toolsUsed.push(result.name);
            messages.push({
                role: 'tool',
                content: result.content,
                toolCallId: result.toolCallId,
                name: result.name,
            });

            // ── Stall detector: check for tool loops ──────────
            const matchingTc = response.toolCalls!.find(tc => tc.id === result.toolCallId);
            let tcArgs: Record<string, unknown> = {};
            try { tcArgs = JSON.parse(matchingTc?.function.arguments || '{}'); } catch { /* use empty */ }
            const loopEvent = recordToolCall(session.id, result.name, tcArgs);
            if (loopEvent) {
                const nudge = getNudgeMessage(loopEvent);
                logger.warn(COMPONENT, `Tool loop detected for ${result.name} — nudging`);
                messages.push({ role: 'user', content: nudge });
            }

            // ── Loop detection: advanced 3-detector analysis ──────────
            const loopConfig = isAutonomous
                ? { globalCircuitBreakerThreshold: (config.autonomy as Record<string, unknown>).circuitBreakerOverride as number || 50 }
                : {};
            const loopCheck = checkForLoop(session.id, result.name, tcArgs, result.content, loopConfig);
            if (!loopCheck.allowed) {
                logger.warn(COMPONENT, `Loop breaker [${loopCheck.level}]: ${loopCheck.reason}`);
                finalContent = loopCheck.reason || 'Loop detected — stopping to prevent runaway execution.';
                loopBroken = true;
                break;
            }

            // Record tool result for continuous learning
            const success = !result.content.toLowerCase().includes('error:');
            recordToolResult(result.name, success, undefined, success ? undefined : result.content.slice(0, 200));
        }

        // Break outer agent loop if loop detection triggered
        if (loopBroken) break;

        // ── Tool Search: expand activeTools with discovered tools ───
        if (toolSearchEnabled && toolResults.some(r => r.name === 'tool_search')) {
            for (const result of toolResults) {
                if (result.name !== 'tool_search') continue;
                // Parse tool names from the search result
                const matches = result.content.matchAll(/\*\*(\w+)\*\*/g);
                for (const match of matches) {
                    const toolName = match[1];
                    if (!discoveredTools.has(toolName)) {
                        discoveredTools.add(toolName);
                        // Add the full tool definition from backup
                        const fullDef = allToolsBackup.find(t => t.function.name === toolName);
                        if (fullDef && !activeTools.some(t => t.function.name === toolName)) {
                            activeTools.push(fullDef);
                        }
                    }
                }
            }
            if (discoveredTools.size > 0) {
                logger.info(COMPONENT, `[ToolSearch] Expanded: +${discoveredTools.size} tools → ${activeTools.length} total`);
            }
        }

        // If this is the last round, add a note
        if (round === effectiveMaxRounds - 1) {
            finalContent = stripToolJson(response.content || 'I completed the tool operations. Let me know if you need anything else.');
        }
    }

    // Clean up stall detector for this session
    clearSession(session.id);
    resetLoopDetection(session.id);

    // Save assistant response to session
    addMessage(session, 'assistant', finalContent, {
        model: modelUsed,
        tokenCount: totalCompletionTokens,
    });

    // Auto-record agent response to knowledge graph (fire-and-forget, skip short/error responses)
    if (finalContent.length > 50 && !finalContent.startsWith('⚠️')) {
        addEpisode(`[TITAN → ${channel}/${userId}] ${finalContent.slice(0, 500)}`, 'agent').catch(() => {});
    }

    // Record usage
    const { provider: providerName } = { provider: modelUsed.split('/')[0] || 'unknown' };
    recordUsage(session.id, providerName, modelUsed, totalPromptTokens, totalCompletionTokens);

    const durationMs = Date.now() - startTime;
    logger.info(COMPONENT, `Response generated in ${durationMs}ms (${totalPromptTokens + totalCompletionTokens} tokens)`);

    return {
        content: finalContent,
        sessionId: session.id,
        toolsUsed: [...new Set(toolsUsed)],
        tokenUsage: {
            prompt: totalPromptTokens,
            completion: totalCompletionTokens,
            total: totalPromptTokens + totalCompletionTokens,
        },
        model: modelUsed,
        durationMs,
    };
}
