/**
 * TITAN — Core Agent Loop
 * The main agent: receives messages, builds context, calls LLM, handles tools, responds.
 */
import { v4 as uuid } from 'uuid';
import { existsSync, readFileSync } from 'fs';
import { chat } from '../providers/router.js';
import { loadConfig } from '../config/config.js';
import { getOrCreateSession, addMessage, getContextMessages, type Session } from './session.js';
import { executeTools, getToolDefinitions } from './toolRunner.js';
import { recordUsage, searchMemories } from '../memory/memory.js';
import { initLearning, recordToolResult, recordSuccessPattern, getLearningContext } from '../memory/learning.js';
import { buildPersonalContext, loadProfile, calibrateTechnicalLevel } from '../memory/relationship.js';
import { heartbeat, recordToolCall, checkResponse, getNudgeMessage, clearSession } from './stallDetector.js';
import { routeModel, maybeCompressContext, recordTokenUsage } from './costOptimizer.js';
import type { ChatMessage, ChatResponse } from '../providers/base.js';
import logger from '../utils/logger.js';
import { TITAN_NAME, AGENTS_MD, SOUL_MD, TOOLS_MD } from '../utils/constants.js';

const COMPONENT = 'Agent';
const MAX_TOOL_ROUNDS = 10;

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

/** Build the system prompt for the agent */
function buildSystemPrompt(config: ReturnType<typeof loadConfig>): string {
    const modelId = config.agent.model || 'unknown';
    const customPrompt = config.agent.systemPrompt || '';
    const memories = searchMemories('preference');
    const memoryContext = memories.length > 0
        ? `\n\nUser preferences I remember:\n${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
        : '';

    // Read workspace prompt files (like OpenClaw's AGENTS.md, SOUL.md, TOOLS.md)
    const agentsMd = readPromptFile(AGENTS_MD);
    const soulMd = readPromptFile(SOUL_MD);
    const toolsMd = readPromptFile(TOOLS_MD);

    const workspaceContext = [
        agentsMd ? `\n## Agent Instructions (AGENTS.md)\n${agentsMd}` : '',
        soulMd ? `\n## Personality (SOUL.md)\n${soulMd}` : '',
        toolsMd ? `\n## Tool Notes (TOOLS.md)\n${toolsMd}` : '',
    ].filter(Boolean).join('\n');

    // Continuous learning context
    const learningContext = getLearningContext();

    // Personal context from Relationship Memory
    const personalContext = buildPersonalContext();

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
- Use tools when they would be helpful — don't just describe what could be done
- Remember important information about the user for future conversations
- If you encounter an error, try alternative approaches before reporting failure

## Security
- Never expose API keys, passwords, or other secrets
- Don't execute commands that could compromise system security without explicit approval
- Respect file system boundaries set in the configuration

## Continuous Learning
You get smarter with every interaction. Below is your accumulated knowledge:
${learningContext}
${customPrompt ? `\n## Custom Instructions\n${customPrompt}` : ''}${workspaceContext}${memoryContext}${personalContext}`;
}

/** Process a user message through the agent loop */
export async function processMessage(
    message: string,
    channel: string = 'cli',
    userId: string = 'default',
): Promise<AgentResponse> {
    const startTime = Date.now();
    const config = loadConfig();
    const session = getOrCreateSession(channel, userId);

    logger.info(COMPONENT, `Processing message in session ${session.id} (${channel}/${userId})`);

    // Add user message to session history
    addMessage(session, 'user', message);

    // Build context
    const systemPrompt = buildSystemPrompt(config);
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
    const { model: activeModel, reason: routingReason } = routeModel(message, config.agent.model);
    if (activeModel !== config.agent.model) {
        logger.info(COMPONENT, `Cost router: ${config.agent.model} → ${activeModel} (${routingReason})`);
    }
    modelUsed = activeModel;

    // ── Stall detector: start heartbeat for this session ────────
    heartbeat(session.id);

    // Agent loop with tool calling
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        logger.debug(COMPONENT, `Round ${round + 1}: ${messages.length} messages, ${tools.length} tools`);

        // ── Cost optimizer: context compression to save tokens ───
        const { messages: compressedMessages, didCompress, savedTokens } = maybeCompressContext(
            messages.filter((m) => m.role !== 'tool' || round < 3) // keep recent tool results
        );
        if (didCompress) {
            logger.info(COMPONENT, `Context compressed, saved ~${savedTokens} tokens`);
        }

        const response: ChatResponse = await chat({
            model: activeModel,
            messages: compressedMessages,
            tools: tools.length > 0 ? tools : undefined,
            maxTokens: config.agent.maxTokens,
            temperature: config.agent.temperature,
        });

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

        // ── Stall detector: heartbeat + response check ──────
        heartbeat(session.id);
        const stallEvent = checkResponse(session.id, response.content, round, MAX_TOOL_ROUNDS);
        if (stallEvent) {
            const nudge = getNudgeMessage(stallEvent);
            logger.warn(COMPONENT, `Stall [${stallEvent.type}] — injecting nudge`);
            messages.push({ role: 'user', content: nudge });
            // Give the model one more chance to respond
            continue;
        }

        // If no tool calls, we have the final response
        if (!response.toolCalls || response.toolCalls.length === 0) {
            finalContent = response.content;
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
        let toolResults;
        try {
            toolResults = await executeTools(response.toolCalls);
        } catch (err) {
            logger.error(COMPONENT, `Tool execution error: ${(err as Error).message}`);
            finalContent = 'An error occurred while executing tools. Please try again.';
            break;
        }

        // Add tool results to messages and record for learning
        for (const result of toolResults) {
            toolsUsed.push(result.name);
            messages.push({
                role: 'tool',
                content: result.content,
                toolCallId: result.toolCallId,
            });

            // ── Stall detector: check for tool loops ──────────
            const loopEvent = recordToolCall(session.id, result.name, { callId: result.toolCallId });
            if (loopEvent) {
                const nudge = getNudgeMessage(loopEvent);
                logger.warn(COMPONENT, `Tool loop detected for ${result.name} — nudging`);
                messages.push({ role: 'user', content: nudge });
            }

            // Record tool result for continuous learning
            const success = !result.content.toLowerCase().includes('error:');
            recordToolResult(result.name, success, undefined, success ? undefined : result.content.slice(0, 200));
        }

        // If this is the last round, add a note
        if (round === MAX_TOOL_ROUNDS - 1) {
            finalContent = response.content || 'I completed the tool operations. Let me know if you need anything else.';
        }
    }

    // Clean up stall detector for this session
    clearSession(session.id);

    // Save assistant response to session
    addMessage(session, 'assistant', finalContent, {
        model: modelUsed,
        tokenCount: totalCompletionTokens,
    });

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
