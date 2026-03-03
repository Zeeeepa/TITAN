import { describe, it, expect, beforeAll } from 'vitest';
import {
    getOrCreateSession, addMessage, closeSession, listSessions,
    getContextMessages, setSessionModelOverride, setSessionThinkingOverride,
    setSessionVerbose, replaceSessionContext,
} from '../src/agent/session.js';
import { initMemory } from '../src/memory/memory.js';

let counter = 0;
const uniq = () => `test-${Date.now()}-${++counter}`;

describe('Session Manager', () => {
    beforeAll(() => { initMemory(); });

    it('creates a new session with UUID id', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(s.status).toBe('active');
        expect(s.messageCount).toBe(0);
    });

    it('returns same session on repeated call with same keys', () => {
        const ch = uniq(); const uid = uniq();
        const s1 = getOrCreateSession(ch, uid, 'default');
        const s2 = getOrCreateSession(ch, uid, 'default');
        expect(s1.id).toBe(s2.id);
    });

    it('addMessage increments messageCount', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        expect(s.messageCount).toBe(0);
        addMessage(s, 'user', 'Hello');
        expect(s.messageCount).toBe(1);
        addMessage(s, 'assistant', 'Hi');
        expect(s.messageCount).toBe(2);
    });

    it('closeSession removes it from listSessions', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        expect(listSessions().map(x => x.id)).toContain(s.id);
        closeSession(s.id);
        expect(listSessions().map(x => x.id)).not.toContain(s.id);
    });

    it('getContextMessages returns messages as ChatMessage format', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        addMessage(s, 'user', 'What is 2+2?');
        addMessage(s, 'assistant', 'The answer is 4.');
        const context = getContextMessages(s);
        expect(context).toHaveLength(2);
        expect(context[0].role).toBe('user');
        expect(context[0].content).toBe('What is 2+2?');
        expect(context[1].role).toBe('assistant');
        expect(context[1].content).toBe('The answer is 4.');
    });

    it('setSessionModelOverride sets model on session', () => {
        const ch = uniq(); const uid = uniq();
        setSessionModelOverride(ch, uid, 'openai/gpt-4o');
        const s = getOrCreateSession(ch, uid, 'default');
        expect(s.modelOverride).toBe('openai/gpt-4o');
    });

    it('setSessionThinkingOverride sets thinking level', () => {
        const ch = uniq(); const uid = uniq();
        setSessionThinkingOverride(ch, uid, 'high');
        const s = getOrCreateSession(ch, uid, 'default');
        expect(s.thinkingOverride).toBe('high');
    });

    it('setSessionVerbose toggles verbose mode', () => {
        const ch = uniq(); const uid = uniq();
        setSessionVerbose(ch, uid, true);
        const s = getOrCreateSession(ch, uid, 'default');
        expect(s.verboseMode).toBe(true);
        setSessionVerbose(ch, uid, false);
        expect(s.verboseMode).toBe(false);
    });

    it('replaceSessionContext replaces history', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        addMessage(s, 'user', 'Hello');
        addMessage(s, 'assistant', 'Hi');
        addMessage(s, 'user', 'How are you?');
        expect(s.messageCount).toBe(3);

        // Replace with compacted context
        replaceSessionContext(s, [
            { role: 'user', content: 'Summary of conversation' },
            { role: 'assistant', content: 'Compacted response' },
        ]);
        expect(s.messageCount).toBe(2);
        const ctx = getContextMessages(s);
        expect(ctx).toHaveLength(2);
        expect(ctx[0].content).toBe('Summary of conversation');
    });

    it('replaceSessionContext skips system messages', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        replaceSessionContext(s, [
            { role: 'system', content: 'You are an assistant' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
        ]);
        // System messages should not be counted
        expect(s.messageCount).toBe(2);
    });

    it('closeSession with non-existent id does not throw', () => {
        expect(() => closeSession('non-existent-session-id')).not.toThrow();
    });

    it('listSessions returns only active sessions', () => {
        const ch1 = uniq(); const uid1 = uniq();
        const ch2 = uniq(); const uid2 = uniq();
        const s1 = getOrCreateSession(ch1, uid1, 'default');
        const s2 = getOrCreateSession(ch2, uid2, 'default');
        const sessions = listSessions();
        expect(sessions.map(s => s.id)).toContain(s1.id);
        expect(sessions.map(s => s.id)).toContain(s2.id);
        closeSession(s1.id);
        const after = listSessions();
        expect(after.map(s => s.id)).not.toContain(s1.id);
        expect(after.map(s => s.id)).toContain(s2.id);
    });

    it('addMessage with tool role and extra metadata', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default');
        addMessage(s, 'tool', 'Tool output result', {
            toolCallId: 'tc_123',
            model: 'anthropic/claude-sonnet-4-20250514',
            tokenCount: 42,
        });
        expect(s.messageCount).toBe(1);
    });

    it('creates encrypted session with e2eKey', () => {
        const s = getOrCreateSession(uniq(), uniq(), 'default', true);
        expect(s.e2eKey).toBeDefined();
        expect(s.e2eKey!.length).toBeGreaterThan(0);
    });
});
