/**
 * TITAN — Sessions Skill (Built-in)
 * Agent-to-agent session management: list, history, send, spawn.
 * Mirrors OpenClaw's sessions_* tools.
 */
import { registerSkill } from '../registry.js';
import { listSessions, getOrCreateSession, addMessage, getContextMessages, closeSession } from '../../agent/session.js';
import { processMessage } from '../../agent/agent.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'Sessions';

export function registerSessionsSkill(): void {
    // sessions_list
    registerSkill(
        { name: 'sessions_list', description: 'List active sessions', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'sessions_list',
            description: 'List all active agent sessions with their IDs, channels, users, and message counts.',
            parameters: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const sessions = listSessions();
                if (sessions.length === 0) return 'No active sessions.';
                return sessions.map((s) =>
                    `• ${s.id.slice(0, 8)} | ${s.channel} | user: ${s.userId} | msgs: ${s.messageCount} | last active: ${s.lastActive}`
                ).join('\n');
            },
        },
    );

    // sessions_history
    registerSkill(
        { name: 'sessions_history', description: 'Get session message history', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'sessions_history',
            description: 'Retrieve the recent message history for a specific session.',
            parameters: {
                type: 'object',
                properties: {
                    sessionChannel: { type: 'string', description: 'Channel of the session' },
                    sessionUserId: { type: 'string', description: 'User ID of the session' },
                    limit: { type: 'number', description: 'Max messages to return (default: 20)' },
                },
                required: ['sessionChannel', 'sessionUserId'],
            },
            execute: async (args) => {
                const channel = args.sessionChannel as string;
                const userId = args.sessionUserId as string;
                const limit = (args.limit as number) || 20;
                const session = getOrCreateSession(channel, userId);
                const messages = getContextMessages(session, limit);
                if (messages.length === 0) return `No messages in session ${channel}/${userId}.`;
                return messages.map((m) =>
                    `[${m.role}] ${m.content.slice(0, 500)}`
                ).join('\n---\n');
            },
        },
    );

    // sessions_send
    registerSkill(
        { name: 'sessions_send', description: 'Send a message to another session', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'sessions_send',
            description: 'Send a message to a specific user\'s session on a channel, triggering agent processing.',
            parameters: {
                type: 'object',
                properties: {
                    targetChannel: { type: 'string', description: 'Target channel (e.g., "discord", "telegram")' },
                    targetUserId: { type: 'string', description: 'Target user ID' },
                    message: { type: 'string', description: 'Message to send' },
                },
                required: ['targetChannel', 'targetUserId', 'message'],
            },
            execute: async (args) => {
                const channel = args.targetChannel as string;
                const userId = args.targetUserId as string;
                const message = args.message as string;
                logger.info(COMPONENT, `Sending inter-session message to ${channel}/${userId}`);

                try {
                    const response = await processMessage(message, channel, userId);
                    return `Message delivered to ${channel}/${userId}. Response: ${response.content.slice(0, 500)}`;
                } catch (error) {
                    return `Error sending to ${channel}/${userId}: ${(error as Error).message}`;
                }
            },
        },
    );

    // sessions_close
    registerSkill(
        { name: 'sessions_close', description: 'Close a session', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'sessions_close',
            description: 'Close a specific session by its session ID.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID to close' },
                },
                required: ['sessionId'],
            },
            execute: async (args) => {
                const sessionId = args.sessionId as string;
                closeSession(sessionId);
                return `Session ${sessionId} closed.`;
            },
        },
    );
}
