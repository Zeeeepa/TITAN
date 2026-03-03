/**
 * TITAN — Parallel Tools Tests
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { executeToolsParallel, getParallelStats } from '../src/agent/parallelTools.js';

describe('Parallel Tools', () => {
    const mockExecutor = vi.fn(async (name: string, _args: Record<string, unknown>) => {
        return `result from ${name}`;
    });

    describe('executeToolsParallel', () => {
        it('returns empty array for empty tool calls', async () => {
            const results = await executeToolsParallel([], mockExecutor);
            expect(results).toEqual([]);
        });

        it('executes single tool directly', async () => {
            const results = await executeToolsParallel(
                [{ id: 't1', name: 'read_file', args: { path: '/tmp/test' } }],
                mockExecutor,
            );
            expect(results).toHaveLength(1);
            expect(results[0].toolCallId).toBe('t1');
            expect(results[0].name).toBe('read_file');
            expect(results[0].content).toBe('result from read_file');
        });

        it('executes read-only tools in parallel', async () => {
            const results = await executeToolsParallel(
                [
                    { id: 't1', name: 'read_file', args: { path: '/a' } },
                    { id: 't2', name: 'web_search', args: { query: 'test' } },
                    { id: 't3', name: 'list_dir', args: { path: '/' } },
                ],
                mockExecutor,
            );
            expect(results).toHaveLength(3);
            expect(results[0].toolCallId).toBe('t1');
            expect(results[1].toolCallId).toBe('t2');
            expect(results[2].toolCallId).toBe('t3');
        });

        it('executes sequentially when multiple writers detected', async () => {
            const order: string[] = [];
            const sequentialExecutor = vi.fn(async (name: string) => {
                order.push(name);
                return `done ${name}`;
            });

            const results = await executeToolsParallel(
                [
                    { id: 't1', name: 'write_file', args: { path: '/a' } },
                    { id: 't2', name: 'edit_file', args: { path: '/b' } },
                ],
                sequentialExecutor,
            );
            expect(results).toHaveLength(2);
            // Sequential means first tool finishes before second starts
            expect(order).toEqual(['write_file', 'edit_file']);
        });

        it('allows parallel when only one writer among readers', async () => {
            const results = await executeToolsParallel(
                [
                    { id: 't1', name: 'read_file', args: { path: '/a' } },
                    { id: 't2', name: 'write_file', args: { path: '/b' } },
                    { id: 't3', name: 'web_search', args: { query: 'q' } },
                ],
                mockExecutor,
            );
            expect(results).toHaveLength(3);
        });

        it('handles executor errors gracefully', async () => {
            const failingExecutor = vi.fn(async (name: string) => {
                if (name === 'bad_tool') throw new Error('tool failed');
                return 'ok';
            });

            await expect(
                executeToolsParallel(
                    [{ id: 't1', name: 'bad_tool', args: {} }],
                    failingExecutor,
                ),
            ).rejects.toThrow('tool failed');
        });
    });

    describe('getParallelStats', () => {
        it('returns stats for empty array', () => {
            const stats = getParallelStats([]);
            expect(stats.total).toBe(0);
            expect(stats.canParallelize).toBe(false);
            expect(stats.estimatedSpeedup).toBe('1x (sequential)');
        });

        it('returns stats for single tool', () => {
            const stats = getParallelStats([{ id: 't1', name: 'read_file', args: {} }]);
            expect(stats.total).toBe(1);
            expect(stats.canParallelize).toBe(false);
            expect(stats.estimatedSpeedup).toBe('1x (sequential)');
        });

        it('returns parallel stats for read-only tools', () => {
            const stats = getParallelStats([
                { id: 't1', name: 'read_file', args: {} },
                { id: 't2', name: 'web_search', args: {} },
                { id: 't3', name: 'list_dir', args: {} },
            ]);
            expect(stats.total).toBe(3);
            expect(stats.canParallelize).toBe(true);
            expect(stats.estimatedSpeedup).toBe('~3x faster');
        });

        it('returns sequential stats for multiple writers', () => {
            const stats = getParallelStats([
                { id: 't1', name: 'write_file', args: {} },
                { id: 't2', name: 'shell', args: {} },
            ]);
            expect(stats.total).toBe(2);
            expect(stats.canParallelize).toBe(false);
            expect(stats.estimatedSpeedup).toBe('1x (sequential)');
        });
    });
});
