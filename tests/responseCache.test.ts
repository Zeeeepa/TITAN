/**
 * TITAN — Response Cache Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getCachedResponse, setCachedResponse, getCacheStats, clearCache } from '../src/agent/responseCache.js';

describe('Response Cache', () => {
    beforeEach(() => {
        clearCache();
    });

    const userMsg = (content: string) => [{ role: 'user', content }];
    const model = 'anthropic/claude-sonnet-4-20250514';

    describe('getCachedResponse', () => {
        it('returns null for empty cache', () => {
            expect(getCachedResponse(userMsg('hello'), model)).toBeNull();
        });

        it('returns null for empty messages array', () => {
            expect(getCachedResponse([], model)).toBeNull();
        });

        it('returns null for messages with no user role', () => {
            expect(getCachedResponse([{ role: 'system', content: 'hi' }], model)).toBeNull();
        });

        it('returns null for user message with no content', () => {
            expect(getCachedResponse([{ role: 'user' }], model)).toBeNull();
        });

        it('returns null for non-array messages', () => {
            expect(getCachedResponse('not-array' as any, model)).toBeNull();
        });

        it('returns cached response on hit', () => {
            const msgs = userMsg('What is 2+2?');
            setCachedResponse(msgs, model, 'The answer is 4.');
            expect(getCachedResponse(msgs, model)).toBe('The answer is 4.');
        });

        it('returns null for different model', () => {
            const msgs = userMsg('What is 2+2?');
            setCachedResponse(msgs, model, 'The answer is 4.');
            expect(getCachedResponse(msgs, 'openai/gpt-4')).toBeNull();
        });

        it('returns null for different prompt', () => {
            setCachedResponse(userMsg('What is 2+2?'), model, 'The answer is 4.');
            expect(getCachedResponse(userMsg('What is 3+3?'), model)).toBeNull();
        });

        it('returns null for expired entries', () => {
            const msgs = userMsg('test expired');
            setCachedResponse(msgs, model, 'A long enough response for caching.');

            // Fast-forward time past TTL (5 minutes)
            vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
            expect(getCachedResponse(msgs, model)).toBeNull();
            vi.restoreAllMocks();
        });

        it('increments hit counter', () => {
            const msgs = userMsg('repeated query');
            setCachedResponse(msgs, model, 'A long enough cached response here.');
            getCachedResponse(msgs, model);
            getCachedResponse(msgs, model);
            getCachedResponse(msgs, model);
            const stats = getCacheStats();
            expect(stats.hits).toBe(3);
        });
    });

    describe('setCachedResponse', () => {
        it('stores and retrieves responses', () => {
            const msgs = userMsg('hello world');
            setCachedResponse(msgs, model, 'Hello! How can I help you today?');
            expect(getCachedResponse(msgs, model)).toBe('Hello! How can I help you today?');
        });

        it('does not cache short responses (< 10 chars)', () => {
            const msgs = userMsg('hi');
            setCachedResponse(msgs, model, 'Hello');
            expect(getCachedResponse(msgs, model)).toBeNull();
        });

        it('does not cache error responses', () => {
            const msgs = userMsg('cause error');
            setCachedResponse(msgs, model, 'Error: something went wrong with the request');
            expect(getCachedResponse(msgs, model)).toBeNull();
        });

        it('does not cache empty key (no user message)', () => {
            setCachedResponse([], model, 'A sufficiently long response.');
            const stats = getCacheStats();
            expect(stats.size).toBe(0);
        });

        it('evicts oldest when at capacity', () => {
            // Fill cache to MAX_CACHE_SIZE (100)
            for (let i = 0; i < 101; i++) {
                setCachedResponse(
                    userMsg(`unique query number ${i}`),
                    model,
                    `Response for query ${i} with enough text`,
                );
            }
            const stats = getCacheStats();
            expect(stats.size).toBeLessThanOrEqual(100);
        });
    });

    describe('getCacheStats', () => {
        it('returns zeroed stats when empty', () => {
            const stats = getCacheStats();
            expect(stats.size).toBe(0);
            expect(stats.maxSize).toBe(100);
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.hitRate).toBe('0%');
            expect(stats.ttlMinutes).toBe(5);
        });

        it('returns correct hit rate', () => {
            const msgs = userMsg('stats query');
            setCachedResponse(msgs, model, 'A long enough cached response.');
            getCachedResponse(msgs, model); // hit
            getCachedResponse(userMsg('miss'), model); // miss
            const stats = getCacheStats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBe('50.0%');
        });
    });

    describe('clearCache', () => {
        it('clears all entries and resets stats', () => {
            setCachedResponse(userMsg('clear test'), model, 'A long enough response to cache.');
            getCachedResponse(userMsg('clear test'), model);
            clearCache();
            const stats = getCacheStats();
            expect(stats.size).toBe(0);
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
        });
    });
});
