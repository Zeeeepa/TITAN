import { describe, it, expect, beforeAll } from 'vitest';
import { getOrCreateSession, addMessage, closeSession, listSessions } from '../src/agent/session.js';
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
});
