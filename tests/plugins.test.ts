/**
 * TITAN — ContextEngine Plugin System Tests
 * Tests for plugin registration, lifecycle hooks, and config loading.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/memory/graph.js', () => ({
    flushMemoryBeforeCompaction: vi.fn().mockResolvedValue(undefined),
    initGraph: vi.fn(),
    addEpisode: vi.fn(),
    getGraphContext: vi.fn(),
}));

vi.mock('../src/memory/vectors.js', () => ({
    getRagContext: vi.fn().mockResolvedValue(null),
}));

import type { ContextEnginePlugin } from '../src/plugins/contextEngine.js';
import {
    runAssemble,
    runCompact,
    runAfterTurn,
    runIngest,
} from '../src/plugins/contextEngine.js';
import {
    registerPlugin,
    getPlugins,
    getPlugin,
    clearPlugins,
    initPlugins,
} from '../src/plugins/registry.js';
import type { ChatMessage } from '../src/providers/base.js';

describe('ContextEngine Plugin System', () => {
    beforeEach(() => {
        clearPlugins();
    });

    // ─── Registry ───────────────────────────────────────────────────
    describe('Registry', () => {
        it('registers a plugin', () => {
            const plugin: ContextEnginePlugin = { name: 'test', version: '1.0.0' };
            registerPlugin(plugin);
            expect(getPlugins()).toHaveLength(1);
            expect(getPlugins()[0].name).toBe('test');
        });

        it('prevents duplicate registration', () => {
            const plugin: ContextEnginePlugin = { name: 'test', version: '1.0.0' };
            registerPlugin(plugin);
            registerPlugin(plugin);
            expect(getPlugins()).toHaveLength(1);
        });

        it('getPlugin returns undefined for unknown name', () => {
            expect(getPlugin('nope')).toBeUndefined();
        });

        it('getPlugin finds registered plugin by name', () => {
            const plugin: ContextEnginePlugin = { name: 'finder', version: '2.0.0' };
            registerPlugin(plugin);
            expect(getPlugin('finder')).toBe(plugin);
        });

        it('clearPlugins empties the registry', () => {
            registerPlugin({ name: 'a', version: '1.0.0' });
            registerPlugin({ name: 'b', version: '1.0.0' });
            expect(getPlugins()).toHaveLength(2);
            clearPlugins();
            expect(getPlugins()).toHaveLength(0);
        });

        it('getPlugins returns a copy, not the internal array', () => {
            registerPlugin({ name: 'x', version: '1.0.0' });
            const list = getPlugins();
            list.push({ name: 'injected', version: '0.0.0' });
            expect(getPlugins()).toHaveLength(1);
        });
    });

    // ─── Lifecycle: assemble ────────────────────────────────────────
    describe('runAssemble', () => {
        it('returns original context when no plugins have assemble', async () => {
            const msgs: ChatMessage[] = [{ role: 'user', content: 'hello' }];
            const result = await runAssemble([], msgs, 'hello');
            expect(result).toEqual(msgs);
        });

        it('calls assemble on each plugin in order', async () => {
            const order: string[] = [];
            const p1: ContextEnginePlugin = {
                name: 'first', version: '1.0.0',
                async assemble(ctx, _msg) {
                    order.push('first');
                    return [...ctx, { role: 'system', content: 'from-first' }];
                },
            };
            const p2: ContextEnginePlugin = {
                name: 'second', version: '1.0.0',
                async assemble(ctx, _msg) {
                    order.push('second');
                    return [...ctx, { role: 'system', content: 'from-second' }];
                },
            };
            const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const result = await runAssemble([p1, p2], msgs, 'hi');
            expect(order).toEqual(['first', 'second']);
            expect(result).toHaveLength(3);
        });

        it('continues past a failing plugin', async () => {
            const failing: ContextEnginePlugin = {
                name: 'bad', version: '1.0.0',
                async assemble() { throw new Error('boom'); },
            };
            const good: ContextEnginePlugin = {
                name: 'good', version: '1.0.0',
                async assemble(ctx) { return [...ctx, { role: 'system', content: 'ok' }]; },
            };
            const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
            const result = await runAssemble([failing, good], msgs, 'hi');
            expect(result).toHaveLength(2);
            expect(result[1].content).toBe('ok');
        });
    });

    // ─── Lifecycle: compact ─────────────────────────────────────────
    describe('runCompact', () => {
        it('returns original context when no plugins have compact', async () => {
            const msgs: ChatMessage[] = [{ role: 'user', content: 'hello' }];
            const result = await runCompact([], msgs, 4096);
            expect(result).toEqual(msgs);
        });

        it('calls compact and passes maxTokens', async () => {
            let receivedTokens = 0;
            const plugin: ContextEnginePlugin = {
                name: 'compactor', version: '1.0.0',
                async compact(ctx, maxTokens) {
                    receivedTokens = maxTokens;
                    return ctx.slice(-1);
                },
            };
            const msgs: ChatMessage[] = [
                { role: 'user', content: 'old' },
                { role: 'user', content: 'new' },
            ];
            const result = await runCompact([plugin], msgs, 2048);
            expect(receivedTokens).toBe(2048);
            expect(result).toHaveLength(1);
            expect(result[0].content).toBe('new');
        });
    });

    // ─── Lifecycle: afterTurn ───────────────────────────────────────
    describe('runAfterTurn', () => {
        it('calls afterTurn on plugins', async () => {
            let called = false;
            const plugin: ContextEnginePlugin = {
                name: 'tracker', version: '1.0.0',
                async afterTurn() { called = true; },
            };
            await runAfterTurn([plugin], { content: 'done', toolsUsed: ['shell'] });
            expect(called).toBe(true);
        });

        it('continues past a failing afterTurn', async () => {
            let secondCalled = false;
            const bad: ContextEnginePlugin = {
                name: 'bad', version: '1.0.0',
                async afterTurn() { throw new Error('fail'); },
            };
            const good: ContextEnginePlugin = {
                name: 'good', version: '1.0.0',
                async afterTurn() { secondCalled = true; },
            };
            await runAfterTurn([bad, good], { content: 'x', toolsUsed: [] });
            expect(secondCalled).toBe(true);
        });
    });

    // ─── Lifecycle: ingest ──────────────────────────────────────────
    describe('runIngest', () => {
        it('calls ingest with content and metadata', async () => {
            let receivedContent = '';
            let receivedMeta: Record<string, unknown> = {};
            const plugin: ContextEnginePlugin = {
                name: 'ingestor', version: '1.0.0',
                async ingest(content, metadata) {
                    receivedContent = content;
                    receivedMeta = metadata;
                },
            };
            await runIngest([plugin], 'doc text', { source: 'file.pdf' });
            expect(receivedContent).toBe('doc text');
            expect(receivedMeta).toEqual({ source: 'file.pdf' });
        });
    });

    // ─── initPlugins ────────────────────────────────────────────────
    describe('initPlugins', () => {
        it('does nothing with empty config', async () => {
            const config = { plugins: { contextEngine: [] } } as any;
            await initPlugins(config);
            expect(getPlugins()).toHaveLength(0);
        });

        it('does nothing when plugins key is absent', async () => {
            const config = {} as any;
            await initPlugins(config);
            expect(getPlugins()).toHaveLength(0);
        });

        it('calls bootstrap on registered plugin matching config', async () => {
            let bootstrapOpts: Record<string, unknown> = {};
            const plugin: ContextEnginePlugin = {
                name: 'test-plugin', version: '1.0.0',
                async bootstrap(config) { bootstrapOpts = config; },
            };
            registerPlugin(plugin);
            const config = {
                plugins: {
                    contextEngine: [
                        { name: 'test-plugin', enabled: true, options: { key: 'value' } },
                    ],
                },
            } as any;
            await initPlugins(config);
            expect(bootstrapOpts).toEqual({ key: 'value' });
        });

        it('skips disabled plugins', async () => {
            let called = false;
            const plugin: ContextEnginePlugin = {
                name: 'disabled', version: '1.0.0',
                async bootstrap() { called = true; },
            };
            registerPlugin(plugin);
            const config = {
                plugins: {
                    contextEngine: [{ name: 'disabled', enabled: false, options: {} }],
                },
            } as any;
            await initPlugins(config);
            expect(called).toBe(false);
        });

        it('warns when configured plugin is not registered', async () => {
            const config = {
                plugins: {
                    contextEngine: [{ name: 'missing', enabled: true, options: {} }],
                },
            } as any;
            // Should not throw
            await initPlugins(config);
            expect(getPlugins()).toHaveLength(0);
        });
    });
});
