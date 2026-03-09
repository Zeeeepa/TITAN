/**
 * TITAN — Smart Context Manager
 * Intelligent context window management that none of the competitors do well.
 *
 * Problems this solves:
 * - Auto-GPT wastes tokens on irrelevant history (high cost)
 * - CrewAI has prompt sprawl across agents (unpredictable cost)
 * - Open Interpreter has no context management at all
 *
 * TITAN's approach:
 * - Automatic summarization of old conversation history
 * - Priority-based context allocation (recent > relevant > old)
 * - Token budget tracking and enforcement
 * - Smart truncation that preserves tool call context
 */
import logger from '../utils/logger.js';
import type { ChatMessage } from '../providers/base.js';
import { flushMemoryBeforeCompaction } from '../memory/graph.js';
import { getRagContext } from '../memory/vectors.js';
import { getPlugins } from '../plugins/registry.js';
import { runAssemble, runCompact } from '../plugins/contextEngine.js';

const COMPONENT = 'Context';

interface ContextBudget {
    maxTokens: number;
    systemPromptTokens: number;
    toolDefinitionTokens: number;
    remainingForHistory: number;
}

/** Estimate token count (fast approximation: ~4 chars per token) */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/** Calculate the context budget */
export function calculateBudget(
    maxContextTokens: number,
    systemPrompt: string,
    toolDefinitionsCount: number,
): ContextBudget {
    const systemTokens = estimateTokens(systemPrompt);
    const toolTokens = toolDefinitionsCount * 120; // ~120 tokens per tool definition
    const reserveForResponse = 2000; // Reserve for completion

    return {
        maxTokens: maxContextTokens,
        systemPromptTokens: systemTokens,
        toolDefinitionTokens: toolTokens,
        remainingForHistory: Math.max(0, maxContextTokens - systemTokens - toolTokens - reserveForResponse),
    };
}

/** Summarize a batch of messages into a single summary message */
export function summarizeMessages(messages: ChatMessage[]): ChatMessage {
    const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content).filter(Boolean);
    const assistantMessages = messages.filter((m) => m.role === 'assistant').map((m) => m.content).filter(Boolean);
    const toolMessages = messages.filter((m) => m.role === 'tool').length;

    const summary = [
        `[Earlier conversation summary — ${messages.length} messages, ${toolMessages} tool calls]`,
        userMessages.length > 0 ? `User discussed: ${userMessages.slice(-3).map((m) => m.slice(0, 80)).join('; ')}` : '',
        assistantMessages.length > 0 ? `Assistant actions: ${assistantMessages.slice(-2).map((m) => m.slice(0, 80)).join('; ')}` : '',
    ].filter(Boolean).join('\n');

    return { role: 'system', content: summary };
}

/** Smart context builder — fits messages within token budget */
export function buildSmartContext(
    messages: ChatMessage[],
    tokenBudget: number,
): ChatMessage[] {
    if (messages.length === 0) return [];

    // Calculate total tokens
    let totalTokens = 0;
    const tokenCounts = messages.map((m) => {
        const tokens = estimateTokens(m.content || '') +
            (m.toolCalls ? m.toolCalls.length * 100 : 0);
        totalTokens += tokens;
        return tokens;
    });

    // If everything fits, return as-is
    if (totalTokens <= tokenBudget) return messages;

    logger.debug(COMPONENT, `Context overflow: ${totalTokens} tokens > ${tokenBudget} budget. Compressing.`);

    // Strategy: Keep the most recent messages, summarize the oldest
    const result: ChatMessage[] = [];
    let usedTokens = 0;

    // Always keep the last N messages (most important for context)
    const recentCount = Math.min(messages.length, 20);
    const recentMessages = messages.slice(-recentCount);
    const recentTokens = tokenCounts.slice(-recentCount).reduce((a, b) => a + b, 0);

    if (recentTokens > tokenBudget) {
        // Even recent messages are too big — truncate from the start
        const fits: ChatMessage[] = [];
        let used = 0;
        for (let i = recentMessages.length - 1; i >= 0; i--) {
            const msgTokens = estimateTokens(recentMessages[i].content || '') + (recentMessages[i].toolCalls ? 100 : 0);
            if (used + msgTokens > tokenBudget) break;
            fits.unshift(recentMessages[i]);
            used += msgTokens;
        }
        return fits;
    }

    // Summarize older messages
    const olderMessages = messages.slice(0, -recentCount);
    if (olderMessages.length > 0) {
        const summary = summarizeMessages(olderMessages);
        result.push(summary);
        usedTokens += estimateTokens(summary.content || '');
    }

    // Add recent messages
    for (const msg of recentMessages) {
        const msgTokens = estimateTokens(msg.content || '') + (msg.toolCalls ? 100 : 0);
        if (usedTokens + msgTokens > tokenBudget) {
            // Truncate this message's content
            const available = (tokenBudget - usedTokens) * 4;
            if (available > 100) {
                result.push({
                    ...msg,
                    content: (msg.content || '').slice(0, available) + '\n[truncated]',
                });
            }
            break;
        }
        result.push(msg);
        usedTokens += msgTokens;
    }

    logger.debug(COMPONENT, `Compressed ${messages.length} messages → ${result.length} (${usedTokens} tokens)`);
    return result;
}

/**
 * Force context compaction (used by /compact command).
 * Progressive compaction that preserves tool_call/tool_result pairs
 * and strips sensitive content from summaries.
 */
export function forceCompactContext(
    messages: ChatMessage[],
): { messages: ChatMessage[]; savedTokens: number } {
    if (messages.length <= 4) {
        return { messages, savedTokens: 0 };
    }

    const beforeTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);

    // Keep system messages + last 6 messages, summarize everything else
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    // Preserve recent messages (including tool_call/tool_result pairs)
    const keepCount = Math.min(nonSystem.length, 6);
    const recent = nonSystem.slice(-keepCount);
    const toSummarize = nonSystem.slice(0, -keepCount);

    if (toSummarize.length === 0) {
        return { messages, savedTokens: 0 };
    }

    // Flush important context to graph memory before discarding (fire-and-forget)
    flushMemoryBeforeCompaction(toSummarize).catch((err) =>
        logger.warn(COMPONENT, `Memory flush before compaction failed: ${(err as Error).message}`),
    );

    // Build progressive summary — strip sensitive patterns
    const sensitivePatterns = /(?:api[_-]?key|password|secret|token|bearer)\s*[:=]\s*\S+/gi;
    const userTopics = toSummarize
        .filter((m) => m.role === 'user')
        .map((m) => (m.content || '').replace(sensitivePatterns, '[REDACTED]').slice(0, 100))
        .join('; ');

    const assistantActions = toSummarize
        .filter((m) => m.role === 'assistant')
        .map((m) => (m.content || '').replace(sensitivePatterns, '[REDACTED]').slice(0, 80))
        .slice(-3)
        .join('; ');

    const toolCount = toSummarize.filter((m) => m.role === 'tool').length;

    const summary: ChatMessage = {
        role: 'system',
        content: [
            `[Compacted: ${toSummarize.length} messages, ${toolCount} tool calls]`,
            userTopics ? `User discussed: ${userTopics}` : '',
            assistantActions ? `Assistant: ${assistantActions}` : '',
        ].filter(Boolean).join('\n'),
    };

    const compacted = [...systemMsgs, summary, ...recent];
    const afterTokens = compacted.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);

    logger.info(COMPONENT, `Force compacted: ${messages.length} → ${compacted.length} messages, saved ~${beforeTokens - afterTokens} tokens`);
    return { messages: compacted, savedTokens: Math.max(0, beforeTokens - afterTokens) };
}

/** Get context window stats */
export function getContextStats(messages: ChatMessage[]): {
    messageCount: number;
    estimatedTokens: number;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
} {
    let tokens = 0;
    let userMsgs = 0;
    let assistantMsgs = 0;
    let toolCalls = 0;

    for (const m of messages) {
        tokens += estimateTokens(m.content || '');
        if (m.role === 'user') userMsgs++;
        if (m.role === 'assistant') assistantMsgs++;
        if (m.toolCalls) toolCalls += m.toolCalls.length;
    }

    return {
        messageCount: messages.length,
        estimatedTokens: tokens,
        userMessages: userMsgs,
        assistantMessages: assistantMsgs,
        toolCalls,
    };
}

/**
 * Inject RAG context into messages before the agent turn.
 * Queries the RAG vector store with the latest user message and prepends
 * relevant chunks as a system message.
 */
export async function injectRagContext(
    messages: ChatMessage[],
    topK: number = 3,
): Promise<ChatMessage[]> {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg?.content) return messages;

    try {
        const ragContext = await getRagContext(lastUserMsg.content, topK);
        if (!ragContext) return messages;

        logger.debug(COMPONENT, `Injecting RAG context (${ragContext.length} chars) for query: "${lastUserMsg.content.slice(0, 80)}"`);

        const ragMessage: ChatMessage = {
            role: 'system',
            content: `[Relevant knowledge from ingested documents]\n${ragContext}`,
        };

        // Insert RAG context before the last user message
        const result = [...messages];
        const lastUserIndex = result.lastIndexOf(lastUserMsg);
        if (lastUserIndex >= 0) {
            result.splice(lastUserIndex, 0, ragMessage);
        } else {
            result.push(ragMessage);
        }
        return result;
    } catch (e) {
        logger.debug(COMPONENT, `RAG context injection failed: ${(e as Error).message}`);
        return messages;
    }
}

/**
 * Assemble context with plugin hooks.
 * Runs RAG injection first (built-in), then all registered plugins.
 */
export async function assembleContextWithPlugins(
    messages: ChatMessage[],
    userMessage: string,
    ragTopK: number = 3,
): Promise<ChatMessage[]> {
    // Built-in RAG injection as first step
    let result = await injectRagContext(messages, ragTopK);

    // Run registered plugin assemble hooks
    const plugins = getPlugins();
    if (plugins.length > 0) {
        result = await runAssemble(plugins, result, userMessage);
    }

    return result;
}

/**
 * Compact context with plugin hooks.
 * Runs built-in smart context first, then all registered plugins.
 */
export async function compactContextWithPlugins(
    messages: ChatMessage[],
    maxTokens: number,
): Promise<ChatMessage[]> {
    // Built-in smart context compaction
    let result = buildSmartContext(messages, maxTokens);

    // Run registered plugin compact hooks
    const plugins = getPlugins();
    if (plugins.length > 0) {
        result = await runCompact(plugins, result, maxTokens);
    }

    return result;
}
