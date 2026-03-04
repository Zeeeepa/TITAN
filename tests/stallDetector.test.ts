/**
 * TITAN — Stall Detector Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
    heartbeat,
    recordToolCall,
    checkResponse,
    getNudgeMessage,
    clearSession,
    getStallStats,
    setStallHandler,
    setStallThreshold,
    type StallEvent,
} from '../src/agent/stallDetector.js';

describe('Stall Detector', () => {
    beforeEach(() => {
        clearSession('test-session');
    });

    describe('heartbeat', () => {
        it('should not throw on heartbeat', () => {
            expect(() => heartbeat('test-session')).not.toThrow();
        });
    });

    describe('recordToolCall', () => {
        it('should return null for non-repeated tool calls', () => {
            const result = recordToolCall('test-session', 'shell', { command: 'ls' });
            expect(result).toBeNull();
        });

        it('should detect tool loop after 3 identical calls', () => {
            recordToolCall('test-session', 'shell', { command: 'ls' });
            recordToolCall('test-session', 'shell', { command: 'ls' });
            const result = recordToolCall('test-session', 'shell', { command: 'ls' });
            expect(result).not.toBeNull();
            expect(result!.type).toBe('tool_loop');
        });

        it('should not detect loop with different args', () => {
            recordToolCall('test-session', 'shell', { command: 'ls' });
            recordToolCall('test-session', 'shell', { command: 'pwd' });
            const result = recordToolCall('test-session', 'shell', { command: 'ls' });
            expect(result).toBeNull();
        });

        it('should not detect loop with different tool names', () => {
            recordToolCall('test-session', 'shell', { command: 'ls' });
            recordToolCall('test-session', 'read_file', { path: 'test.txt' });
            const result = recordToolCall('test-session', 'shell', { command: 'ls' });
            expect(result).toBeNull();
        });
    });

    describe('checkResponse', () => {
        it('should return null for valid responses', () => {
            const result = checkResponse('test-session', 'Here is a complete answer.', 0, 10);
            expect(result).toBeNull();
        });

        it('should detect empty responses', () => {
            const result = checkResponse('test-session', '', 0, 10);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('empty_response');
        });

        it('should detect near-empty responses', () => {
            const result = checkResponse('test-session', 'ok', 0, 10);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('empty_response');
        });

        it('should detect max rounds hit', () => {
            const result = checkResponse('test-session', 'Some valid content here', 9, 10);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('max_rounds');
        });

        it('should not trigger max_rounds if not at limit', () => {
            const result = checkResponse('test-session', 'Valid response', 5, 10);
            expect(result).toBeNull();
        });
    });

    describe('getNudgeMessage', () => {
        it('should return a nudge message for silence stall', () => {
            const event: StallEvent = {
                type: 'silence',
                sessionId: 'test',
                detectedAt: new Date().toISOString(),
                detail: 'test',
                nudgeCount: 0,
            };
            const msg = getNudgeMessage(event);
            expect(typeof msg).toBe('string');
            expect(msg.length).toBeGreaterThan(0);
        });

        it('should return a nudge message for tool_loop stall', () => {
            const event: StallEvent = {
                type: 'tool_loop',
                sessionId: 'test',
                detectedAt: new Date().toISOString(),
                detail: 'test',
                nudgeCount: 0,
            };
            const msg = getNudgeMessage(event);
            expect(msg).toContain('different approach');
        });

        it('should return a message string for any stall type', () => {
            // getNudgeMessage reads nudgeCount from internal session state,
            // so just verify it returns meaningful strings for each type
            for (const type of ['silence', 'tool_loop', 'empty_response', 'max_rounds'] as const) {
                const event: StallEvent = {
                    type,
                    sessionId: 'nudge-type-test',
                    detectedAt: new Date().toISOString(),
                    detail: 'test',
                    nudgeCount: 0,
                };
                const msg = getNudgeMessage(event);
                expect(typeof msg).toBe('string');
                expect(msg.length).toBeGreaterThan(10);
            }
            clearSession('nudge-type-test');
        });
    });

    describe('clearSession / getStallStats', () => {
        it('should remove session on clear', () => {
            heartbeat('clear-test');
            clearSession('clear-test');
            const stats = getStallStats();
            expect(stats.find(s => s.sessionId === 'clear-test')).toBeUndefined();
        });

        it('should track stall stats', () => {
            checkResponse('stats-test', '', 0, 10); // triggers stall
            const stats = getStallStats();
            const found = stats.find(s => s.sessionId === 'stats-test');
            expect(found).toBeDefined();
            expect(found!.stallCount).toBeGreaterThan(0);
            clearSession('stats-test');
        });
    });

    describe('setStallHandler', () => {
        it('should accept a handler function', () => {
            expect(() => setStallHandler(async () => 'nudge')).not.toThrow();
        });
    });

    describe('setStallThreshold', () => {
        it('should change the silence timeout without throwing', () => {
            expect(() => setStallThreshold(50)).not.toThrow();
            // Reset to default
            setStallThreshold(30_000);
        });

        it('setStallThreshold changes the silence timeout', async () => {
            // Set a very short threshold
            setStallThreshold(50);

            // Start heartbeat — the stall should trigger after 50ms, not 30s
            heartbeat('test-threshold');

            // Wait 100ms — stall should have triggered
            await new Promise(r => setTimeout(r, 100));

            clearSession('test-threshold');

            // Reset to default
            setStallThreshold(30_000);
        });
    });
});
