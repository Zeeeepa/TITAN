/**
 * TITAN — Slash Command System (OpenClaw-Inspired)
 * Provides /model, /think, /usage, /compact, /verbose, /reset, /new, /status commands
 * that users can run from any channel to control their session in real-time.
 */
import { loadConfig } from '../config/config.js';
import { getOrCreateSession, closeSession, replaceSessionContext, setSessionModelOverride, setSessionThinkingOverride, setSessionVerbose } from '../agent/session.js';
import { getSessionCost, getDailyTotal, formatCostSummary } from '../agent/costOptimizer.js';
import { getContextMessages } from '../agent/session.js';
import { forceCompactContext } from '../agent/contextManager.js';
import { resolveModel, getModelAliases } from '../providers/router.js';
import { isModelAllowed } from '../providers/router.js';
import logger from '../utils/logger.js';
import { TITAN_VERSION } from '../utils/constants.js';

const COMPONENT = 'SlashCmd';

export interface SlashCommandResult {
    handled: boolean;
    response: string;
}

type SlashCommandHandler = (
    args: string,
    channel: string,
    userId: string,
) => Promise<SlashCommandResult> | SlashCommandResult;

/** Command registry */
const commands: Map<string, SlashCommandHandler> = new Map();

/** Register a slash command */
export function registerSlashCommand(name: string, handler: SlashCommandHandler): void {
    commands.set(name.toLowerCase(), handler);
}

/** Parse and dispatch a slash command. Returns null if not a slash command. */
export async function handleSlashCommand(
    message: string,
    channel: string,
    userId: string,
): Promise<SlashCommandResult | null> {
    const trimmed = message.trim();
    if (!trimmed.startsWith('/')) return null;

    const spaceIdx = trimmed.indexOf(' ');
    const name = (spaceIdx > 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1)).toLowerCase();
    const args = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim() : '';

    const handler = commands.get(name);
    if (!handler) return null;

    logger.info(COMPONENT, `Executing /${name} ${args ? `(args: ${args})` : ''} [${channel}/${userId}]`);
    return handler(args, channel, userId);
}

/** Initialize all built-in slash commands */
export function initSlashCommands(): void {
    // ── /model [provider/model] ──
    registerSlashCommand('model', async (args, channel, userId) => {
        const config = loadConfig();
        const session = getOrCreateSession(channel, userId, 'default');

        if (!args) {
            // Show current model + aliases
            const current = session.modelOverride || config.agent.model;
            const aliases = getModelAliases();
            const aliasLines = Object.entries(aliases)
                .map(([name, model]) => `  \`${name}\` → ${model}`)
                .join('\n');
            return {
                handled: true,
                response: `🤖 **Current Model**: \`${current}\`${session.modelOverride ? ' (session override)' : ''}\n\n**Aliases:**\n${aliasLines || '  (none configured)'}`,
            };
        }

        // Validate the model
        try {
            // Check allowlist first
            if (!isModelAllowed(args)) {
                return { handled: true, response: `⛔ Model \`${args}\` is not in the allowed models list.` };
            }
            resolveModel(args);
        } catch (e) {
            return { handled: true, response: `❌ Invalid model: ${(e as Error).message}` };
        }

        setSessionModelOverride(channel, userId, args);
        return { handled: true, response: `✅ Model switched to \`${args}\` for this session.` };
    });

    // ── /think [off|low|medium|high] ──
    registerSlashCommand('think', (args, channel, userId) => {
        const session = getOrCreateSession(channel, userId, 'default');
        const config = loadConfig();

        if (!args) {
            const current = session.thinkingOverride || config.agent.thinkingMode || 'off';
            return {
                handled: true,
                response: `🧠 **Thinking Mode**: \`${current}\`${session.thinkingOverride ? ' (session override)' : ''}\nOptions: \`off\`, \`low\`, \`medium\`, \`high\``,
            };
        }

        const level = args.toLowerCase();
        if (!['off', 'low', 'medium', 'high'].includes(level)) {
            return { handled: true, response: `❌ Invalid thinking level: \`${args}\`. Use: off, low, medium, high` };
        }

        setSessionThinkingOverride(channel, userId, level as 'off' | 'low' | 'medium' | 'high');
        return { handled: true, response: `✅ Thinking mode set to \`${level}\` for this session.` };
    });

    // ── /usage ──
    registerSlashCommand('usage', (args, channel, userId) => {
        const session = getOrCreateSession(channel, userId, 'default');
        const cost = getSessionCost(session.id);
        const dailyTotal = getDailyTotal();

        if (!cost) {
            return { handled: true, response: `📊 **Usage**: No API calls recorded in this session yet.\n• **Daily Total**: $${dailyTotal.toFixed(5)}` };
        }

        return {
            handled: true,
            response: [
                `📊 **Session Usage**`,
                `• **API Calls**: ${cost.calls}`,
                `• **Tokens**: ${cost.inputTokens.toLocaleString()} input + ${cost.outputTokens.toLocaleString()} output = ${(cost.inputTokens + cost.outputTokens).toLocaleString()} total`,
                `• **Session Cost**: $${cost.estimatedUsd.toFixed(5)}`,
                `• **Daily Total**: $${dailyTotal.toFixed(5)}`,
            ].join('\n'),
        };
    });

    // ── /compact ──
    registerSlashCommand('compact', (args, channel, userId) => {
        const session = getOrCreateSession(channel, userId, 'default');
        const messages = getContextMessages(session);

        if (messages.length <= 4) {
            return { handled: true, response: `📦 Context is already compact (${messages.length} messages).` };
        }

        const { messages: compacted, savedTokens } = forceCompactContext(messages);
        replaceSessionContext(session, compacted);

        return {
            handled: true,
            response: `📦 **Context Compacted**\n• Before: ${messages.length} messages\n• After: ${compacted.length} messages\n• Saved: ~${savedTokens.toLocaleString()} tokens`,
        };
    });

    // ── /verbose [on|off] ──
    registerSlashCommand('verbose', (args, channel, userId) => {
        const session = getOrCreateSession(channel, userId, 'default');

        if (!args) {
            return {
                handled: true,
                response: `🔊 **Verbose Mode**: \`${session.verboseMode ? 'on' : 'off'}\``,
            };
        }

        const on = ['on', '1', 'true', 'yes'].includes(args.toLowerCase());
        setSessionVerbose(channel, userId, on);
        return { handled: true, response: `✅ Verbose mode \`${on ? 'on' : 'off'}\` for this session.` };
    });

    // ── /reset and /new ──
    const resetHandler: SlashCommandHandler = (args, channel, userId) => {
        const session = getOrCreateSession(channel, userId, 'default');
        closeSession(session.id);
        return { handled: true, response: `🔄 Session **${session.id.slice(0, 8)}** has been reset. Context and overrides cleared.` };
    };
    registerSlashCommand('reset', resetHandler);
    registerSlashCommand('new', resetHandler);

    // ── /status ──
    registerSlashCommand('status', (args, channel, userId) => {
        const config = loadConfig();
        const session = getOrCreateSession(channel, userId, 'default');
        const costStr = formatCostSummary(session.id);

        const lines = [
            `📊 **TITAN Status** (v${TITAN_VERSION})`,
            `• **Session**: \`${session.id.slice(0, 8)}\` (${session.messageCount} messages)`,
            `• **Model**: ${session.modelOverride || config.agent.model}${session.modelOverride ? ' *(session override)*' : ''}`,
            `• **Thinking**: ${session.thinkingOverride || config.agent.thinkingMode || 'off'}${session.thinkingOverride ? ' *(session override)*' : ''}`,
            `• **Verbose**: ${session.verboseMode ? 'on' : 'off'}`,
            `• **Usage**: ${costStr}`,
        ];

        return { handled: true, response: lines.join('\n') };
    });

    logger.info(COMPONENT, `Registered ${commands.size} slash commands`);
}
