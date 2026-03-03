/**
 * TITAN — Cost Optimizer Tests
 * Tests for src/agent/costOptimizer.ts: classifyComplexity, routeModel,
 * recordTokenUsage, getSessionCost, getDailyTotal, maybeCompressContext,
 * getCostStatus, formatCostSummary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
    }),
    resetConfigCache: vi.fn(),
}));

import {
    classifyComplexity,
    routeModel,
    recordTokenUsage,
    getSessionCost,
    getDailyTotal,
    maybeCompressContext,
    getCostStatus,
    formatCostSummary,
    type ChatMessageLike,
} from '../src/agent/costOptimizer.js';
import { loadConfig } from '../src/config/config.js';

describe('CostOptimizer', () => {
    // ─── classifyComplexity ──────────────────────────────────────────
    describe('classifyComplexity', () => {
        it('classifies "hello" as simple', () => {
            expect(classifyComplexity('hello')).toBe('simple');
        });

        it('classifies "hi" as simple', () => {
            expect(classifyComplexity('hi')).toBe('simple');
        });

        it('classifies "thanks" as simple', () => {
            expect(classifyComplexity('thanks')).toBe('simple');
        });

        it('classifies "ok" as simple', () => {
            expect(classifyComplexity('ok')).toBe('simple');
        });

        it('classifies "yes" as simple', () => {
            expect(classifyComplexity('yes')).toBe('simple');
        });

        it('classifies "no" as simple', () => {
            expect(classifyComplexity('no')).toBe('simple');
        });

        it('classifies very short messages (<=20 chars) as simple', () => {
            expect(classifyComplexity('short msg')).toBe('simple');
        });

        it('classifies "what time is it" as simple', () => {
            expect(classifyComplexity('what time is it')).toBe('simple');
        });

        it('classifies "who are you" as simple', () => {
            expect(classifyComplexity('who are you')).toBe('simple');
        });

        it('classifies a message with one complex keyword as moderate', () => {
            expect(classifyComplexity('Can you analyze this data in a thorough way for the project?')).toBe('moderate');
        });

        it('classifies complex instructions with 2+ complex keywords as complex', () => {
            expect(classifyComplexity('Write a function that analyzes the data and compares results')).toBe('complex');
        });

        it('classifies messages with "build" and "design" as complex', () => {
            expect(classifyComplexity('Build a new API and design the architecture for the system')).toBe('complex');
        });

        it('classifies "debug and fix" as complex (2 patterns)', () => {
            expect(classifyComplexity('Debug and fix the broken authentication code in the server')).toBe('complex');
        });

        it('classifies "plan" and "strategy" as complex (2 patterns)', () => {
            expect(classifyComplexity('Create a plan and strategy roadmap for the migration project')).toBe('complex');
        });

        it('classifies very long messages (>200 chars) as complex', () => {
            const longMsg = 'a'.repeat(201);
            expect(classifyComplexity(longMsg)).toBe('complex');
        });

        it('classifies messages with code-related keywords as moderate', () => {
            expect(classifyComplexity('Show me the code for the main function in the application.')).toBe('moderate');
        });

        it('handles empty string as moderate (no patterns match)', () => {
            // Empty/trimmed string: no SIMPLE_PATTERNS match (^.{1,20}$ needs >=1 char),
            // no COMPLEX_PATTERNS match, not >200 chars => moderate
            expect(classifyComplexity('')).toBe('moderate');
        });

        it('handles whitespace-only as moderate (trims to empty)', () => {
            expect(classifyComplexity('   ')).toBe('moderate');
        });

        it('classifies mixed case patterns correctly', () => {
            expect(classifyComplexity('WRITE a function and ANALYZE the results carefully')).toBe('complex');
        });

        it('classifies moderate length messages with no complex keywords as moderate', () => {
            const msg = 'Tell me about the weather forecast for the upcoming week and what I should wear tomorrow afternoon please';
            expect(classifyComplexity(msg)).toBe('moderate');
        });
    });

    // ─── routeModel ─────────────────────────────────────────────────
    describe('routeModel', () => {
        it('returns forced model when forceModel is provided', () => {
            const result = routeModel('hello', 'anthropic/claude-sonnet-4-20250514', 'anthropic/claude-opus-4-0');
            expect(result.model).toBe('anthropic/claude-opus-4-0');
            expect(result.reason).toBe('user override');
            expect(result.willSaveMoney).toBe(false);
        });

        it('returns configured model when smart routing is disabled', () => {
            vi.mocked(loadConfig).mockReturnValueOnce({
                agent: { costOptimization: { smartRouting: false } },
            } as any);
            const result = routeModel('hello', 'anthropic/claude-sonnet-4-20250514');
            expect(result.model).toBe('anthropic/claude-sonnet-4-20250514');
            expect(result.reason).toBe('smart routing disabled');
            expect(result.willSaveMoney).toBe(false);
        });

        it('routes simple message to fast tier from balanced tier (anthropic)', () => {
            const result = routeModel('hello', 'anthropic/claude-sonnet-4-20250514');
            expect(result.model).toBe('anthropic/claude-3-5-haiku-20241022');
            expect(result.willSaveMoney).toBe(true);
        });

        it('routes simple message to fast tier from premium tier (anthropic)', () => {
            const result = routeModel('hi', 'anthropic/claude-opus-4-0');
            expect(result.model).toBe('anthropic/claude-3-5-haiku-20241022');
            expect(result.willSaveMoney).toBe(true);
        });

        it('routes simple message to fast tier from openai balanced', () => {
            const result = routeModel('thanks', 'openai/gpt-4o');
            expect(result.model).toBe('openai/gpt-4o-mini');
            expect(result.willSaveMoney).toBe(true);
        });

        it('routes simple message to fast tier from google balanced', () => {
            const result = routeModel('ok', 'google/gemini-2.5-pro');
            expect(result.model).toBe('google/gemini-2.0-flash');
            expect(result.willSaveMoney).toBe(true);
        });

        it('keeps configured model for complex messages', () => {
            const result = routeModel('Write a function that analyzes the data and compares results', 'anthropic/claude-sonnet-4-20250514');
            expect(result.model).toBe('anthropic/claude-sonnet-4-20250514');
            expect(result.willSaveMoney).toBe(false);
        });

        it('keeps configured model for moderate messages', () => {
            const result = routeModel('Can you explain how to properly handle errors in this code?', 'openai/gpt-4o');
            expect(result.model).toBe('openai/gpt-4o');
            expect(result.willSaveMoney).toBe(false);
        });

        it('returns configured model if already on fast tier', () => {
            const result = routeModel('hello', 'openai/gpt-4o-mini');
            expect(result.model).toBe('openai/gpt-4o-mini');
            expect(result.reason).toBe('already on fast tier');
            expect(result.willSaveMoney).toBe(false);
        });

        it('returns configured model if model is unknown (not in cost table)', () => {
            const result = routeModel('hello', 'unknown/model-xyz');
            expect(result.model).toBe('unknown/model-xyz');
            expect(result.reason).toBe('already on fast tier');
            expect(result.willSaveMoney).toBe(false);
        });

        it('routes simple message from premium openai to fast tier', () => {
            const result = routeModel('sure', 'openai/o3');
            expect(result.model).toBe('openai/gpt-4o-mini');
            expect(result.willSaveMoney).toBe(true);
        });

        it('keeps premium model for complex instructions', () => {
            const result = routeModel('Build and design a comprehensive API for the system', 'openai/o3');
            expect(result.model).toBe('openai/o3');
            expect(result.willSaveMoney).toBe(false);
        });

        it('does not set forceModel when not provided', () => {
            const result = routeModel('hello', 'anthropic/claude-sonnet-4-20250514');
            expect(result.reason).not.toBe('user override');
        });

        it('returns reason describing complexity for non-simple messages', () => {
            const result = routeModel('Write some code please plus analyze it', 'anthropic/claude-sonnet-4-20250514');
            expect(result.reason).toContain('configured model');
        });
    });

    // ─── recordTokenUsage ────────────────────────────────────────────
    describe('recordTokenUsage', () => {
        // Each test uses a unique session ID to avoid state leakage
        it('creates a session entry on first usage', () => {
            const sid = `rec-first-${Math.random()}`;
            const result = recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            expect(result.sessionTotal).toBeGreaterThanOrEqual(0);
            expect(result.dailyTotal).toBeGreaterThanOrEqual(0);
        });

        it('accumulates tokens across multiple calls', () => {
            const sid = `rec-accum-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            const r2 = recordTokenUsage(sid, 'openai/gpt-4o', 200, 100);
            const cost = getSessionCost(sid);
            expect(cost).not.toBeNull();
            expect(cost!.inputTokens).toBe(300);
            expect(cost!.outputTokens).toBe(150);
            expect(cost!.calls).toBe(2);
        });

        it('tracks estimated cost correctly', () => {
            const sid = `rec-cost-${Math.random()}`;
            // openai/gpt-4o: input=2.50, output=10.00 per 1M tokens
            recordTokenUsage(sid, 'openai/gpt-4o', 1_000_000, 1_000_000);
            const cost = getSessionCost(sid);
            expect(cost!.estimatedUsd).toBeCloseTo(12.5, 1);
        });

        it('reports budget warning at 80%', () => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 0.001 } },
            } as any);
            const sid = `rec-warn-${Math.random()}`;
            // Push over 80% with small budget
            const result = recordTokenUsage(sid, 'openai/gpt-4o', 1000, 1000);
            // dailyTotal includes previous calls in this test run, so we check the flag logic
            if (result.dailyTotal >= 0.0008) {
                expect(result.budgetWarning).toBe(true);
            }
        });

        it('reports budget exceeded at 100%', () => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 0.00001 } },
            } as any);
            const sid = `rec-exceed-${Math.random()}`;
            const result = recordTokenUsage(sid, 'openai/gpt-4o', 10000, 10000);
            if (result.dailyTotal >= 0.00001) {
                expect(result.budgetExceeded).toBe(true);
            }
        });

        it('ollama is free (zero cost)', () => {
            const sid = `rec-ollama-${Math.random()}`;
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
            recordTokenUsage(sid, 'ollama/llama3', 1000, 500);
            const cost = getSessionCost(sid);
            expect(cost!.estimatedUsd).toBe(0);
        });

        it('returns sessionTotal and dailyTotal as numbers', () => {
            const sid = `rec-type-${Math.random()}`;
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
            const result = recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            expect(typeof result.sessionTotal).toBe('number');
            expect(typeof result.dailyTotal).toBe('number');
        });

        it('uses fallback pricing for unknown non-ollama models', () => {
            const sid = `rec-fallback-${Math.random()}`;
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
            recordTokenUsage(sid, 'custom/model-v1', 1_000_000, 1_000_000);
            const cost = getSessionCost(sid);
            // Fallback is openai/gpt-4o pricing: 2.50 input + 10.00 output = 12.50
            expect(cost!.estimatedUsd).toBeCloseTo(12.5, 1);
        });

        it('increments call count each time', () => {
            const sid = `rec-calls-${Math.random()}`;
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
            recordTokenUsage(sid, 'openai/gpt-4o-mini', 10, 5);
            recordTokenUsage(sid, 'openai/gpt-4o-mini', 10, 5);
            recordTokenUsage(sid, 'openai/gpt-4o-mini', 10, 5);
            const cost = getSessionCost(sid);
            expect(cost!.calls).toBe(3);
        });

        it('does not warn when no budget is set', () => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 0 } },
            } as any);
            const sid = `rec-nobud-${Math.random()}`;
            const result = recordTokenUsage(sid, 'openai/gpt-4o', 100000, 100000);
            expect(result.budgetWarning).toBe(false);
            expect(result.budgetExceeded).toBe(false);
        });

        it('handles zero tokens gracefully', () => {
            const sid = `rec-zero-${Math.random()}`;
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
            const result = recordTokenUsage(sid, 'openai/gpt-4o', 0, 0);
            const cost = getSessionCost(sid);
            expect(cost!.estimatedUsd).toBe(0);
            expect(result.sessionTotal).toBe(0);
        });
    });

    // ─── getSessionCost ──────────────────────────────────────────────
    describe('getSessionCost', () => {
        beforeEach(() => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
        });

        it('returns null for unknown session', () => {
            expect(getSessionCost(`nonexistent-${Math.random()}`)).toBeNull();
        });

        it('returns session cost after recording usage', () => {
            const sid = `gsc-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 500, 200);
            const cost = getSessionCost(sid);
            expect(cost).not.toBeNull();
            expect(cost!.inputTokens).toBe(500);
            expect(cost!.outputTokens).toBe(200);
            expect(cost!.calls).toBe(1);
        });

        it('returns accumulated cost for multiple calls', () => {
            const sid = `gsc-multi-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            recordTokenUsage(sid, 'openai/gpt-4o', 200, 100);
            const cost = getSessionCost(sid);
            expect(cost!.inputTokens).toBe(300);
            expect(cost!.outputTokens).toBe(150);
        });
    });

    // ─── getDailyTotal ───────────────────────────────────────────────
    describe('getDailyTotal', () => {
        it('returns a number', () => {
            expect(typeof getDailyTotal()).toBe('number');
        });

        it('returns value >= 0', () => {
            expect(getDailyTotal()).toBeGreaterThanOrEqual(0);
        });

        it('increases after recording usage', () => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
            const before = getDailyTotal();
            recordTokenUsage(`daily-${Math.random()}`, 'openai/gpt-4o', 10000, 10000);
            expect(getDailyTotal()).toBeGreaterThan(before);
        });
    });

    // ─── maybeCompressContext ─────────────────────────────────────────
    describe('maybeCompressContext', () => {
        it('returns original messages when context summarization is disabled', () => {
            vi.mocked(loadConfig).mockReturnValueOnce({
                agent: { costOptimization: { contextSummarization: false } },
            } as any);
            const msgs: ChatMessageLike[] = [{ role: 'user', content: 'x'.repeat(40000) }];
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(false);
            expect(result.messages).toBe(msgs);
            expect(result.savedTokens).toBe(0);
        });

        it('does not compress when under token threshold', () => {
            const msgs: ChatMessageLike[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' },
            ];
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(false);
            expect(result.messages).toBe(msgs);
        });

        it('compresses when over token threshold (>8000 tokens ~32KB)', () => {
            const msgs: ChatMessageLike[] = [];
            // Create enough messages to exceed 8000 tokens (32000 chars)
            for (let i = 0; i < 20; i++) {
                msgs.push({ role: 'user', content: 'x'.repeat(2000) });
                msgs.push({ role: 'assistant', content: 'y'.repeat(2000) });
            }
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(true);
            expect(result.savedTokens).toBeGreaterThan(0);
            expect(result.messages.length).toBeLessThan(msgs.length);
        });

        it('keeps system messages after compression', () => {
            const msgs: ChatMessageLike[] = [
                { role: 'system', content: 'You are TITAN.' },
            ];
            for (let i = 0; i < 20; i++) {
                msgs.push({ role: 'user', content: 'x'.repeat(2000) });
                msgs.push({ role: 'assistant', content: 'y'.repeat(2000) });
            }
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(true);
            const systemMsgs = result.messages.filter(m => m.role === 'system');
            // Original system message + summary system message
            expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
            expect(systemMsgs.some(m => m.content === 'You are TITAN.')).toBe(true);
        });

        it('keeps last 6 non-system messages', () => {
            const msgs: ChatMessageLike[] = [];
            for (let i = 0; i < 20; i++) {
                msgs.push({ role: 'user', content: `msg-${i} ${'z'.repeat(2000)}` });
                msgs.push({ role: 'assistant', content: `reply-${i} ${'w'.repeat(2000)}` });
            }
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(true);
            // Should have kept last 6 non-system messages + summary
            const nonSystem = result.messages.filter(m => !m.content.startsWith('[CONTEXT SUMMARY'));
            // Last 6 messages should include the most recent ones
            expect(nonSystem.some(m => m.content.includes('msg-19'))).toBe(true);
        });

        it('creates a summary message with earlier conversation topics', () => {
            const msgs: ChatMessageLike[] = [];
            for (let i = 0; i < 20; i++) {
                msgs.push({ role: 'user', content: `topic-${i} ${'a'.repeat(2000)}` });
                msgs.push({ role: 'assistant', content: `response-${i} ${'b'.repeat(2000)}` });
            }
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(true);
            const summaryMsg = result.messages.find(m => m.content.includes('CONTEXT SUMMARY'));
            expect(summaryMsg).toBeDefined();
            expect(summaryMsg!.role).toBe('system');
        });

        it('handles empty messages array', () => {
            const result = maybeCompressContext([]);
            expect(result.didCompress).toBe(false);
            expect(result.messages).toEqual([]);
        });

        it('does not compress when only 6 or fewer non-system messages (even if long)', () => {
            const msgs: ChatMessageLike[] = [];
            for (let i = 0; i < 3; i++) {
                msgs.push({ role: 'user', content: 'x'.repeat(20000) });
                msgs.push({ role: 'assistant', content: 'y'.repeat(20000) });
            }
            // 6 messages * ~10000 tokens each = 60000 tokens > threshold
            // but slice(0, -6) = empty => no compression
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(false);
        });

        it('savedTokens is positive when compression occurs', () => {
            const msgs: ChatMessageLike[] = [];
            for (let i = 0; i < 20; i++) {
                msgs.push({ role: 'user', content: `conversation topic number ${i} ${'content '.repeat(500)}` });
                msgs.push({ role: 'assistant', content: `response to topic ${i} ${'data '.repeat(500)}` });
            }
            const result = maybeCompressContext(msgs);
            expect(result.didCompress).toBe(true);
            expect(result.savedTokens).toBeGreaterThan(0);
        });
    });

    // ─── getCostStatus ───────────────────────────────────────────────
    describe('getCostStatus', () => {
        beforeEach(() => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
        });

        it('returns an object (Record)', () => {
            const status = getCostStatus();
            expect(typeof status).toBe('object');
        });

        it('includes sessions that have been recorded', () => {
            const sid = `status-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            const status = getCostStatus();
            expect(status[sid]).toBeDefined();
            expect(status[sid].calls).toBe(1);
        });

        it('returns session data with correct structure', () => {
            const sid = `status-struct-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            const status = getCostStatus();
            const entry = status[sid];
            expect(entry).toHaveProperty('inputTokens');
            expect(entry).toHaveProperty('outputTokens');
            expect(entry).toHaveProperty('estimatedUsd');
            expect(entry).toHaveProperty('calls');
        });
    });

    // ─── formatCostSummary ───────────────────────────────────────────
    describe('formatCostSummary', () => {
        beforeEach(() => {
            vi.mocked(loadConfig).mockReturnValue({
                agent: { costOptimization: { smartRouting: true, contextSummarization: true, dailyBudgetUsd: 10 } },
            } as any);
        });

        it('returns "No usage recorded" for unknown session', () => {
            expect(formatCostSummary(`nope-${Math.random()}`)).toBe('No usage recorded');
        });

        it('returns formatted string after recording usage', () => {
            const sid = `fmt-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 500, 200);
            const summary = formatCostSummary(sid);
            expect(summary).toContain('$');
            expect(summary).toContain('session');
            expect(summary).toContain('tokens');
            expect(summary).toContain('1 calls');
        });

        it('includes total token count', () => {
            const sid = `fmt-tok-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 1000, 500);
            const summary = formatCostSummary(sid);
            expect(summary).toContain('1500 tokens');
        });

        it('updates after multiple recordings', () => {
            const sid = `fmt-multi-${Math.random()}`;
            recordTokenUsage(sid, 'openai/gpt-4o', 100, 50);
            recordTokenUsage(sid, 'openai/gpt-4o', 200, 100);
            const summary = formatCostSummary(sid);
            expect(summary).toContain('2 calls');
            expect(summary).toContain('450 tokens');
        });
    });
});
