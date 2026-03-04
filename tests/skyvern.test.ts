/**
 * TITAN — Skyvern Native Tools Tests
 * Tests the 3 built-in Skyvern browser automation tools.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock registerSkill to capture tool handlers
const registeredTools: Map<string, { execute: (args: Record<string, unknown>) => Promise<string> }> = new Map();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn((_meta: unknown, handler: { name: string; execute: (args: Record<string, unknown>) => Promise<string> }) => {
        registeredTools.set(handler.name, handler);
    }),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { registerSkyvernSkill } from '../src/skills/builtin/skyvern.js';

describe('Skyvern Native Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools.clear();
        registerSkyvernSkill();
    });

    it('registers all 3 Skyvern tools', () => {
        expect(registeredTools.has('skyvern_task')).toBe(true);
        expect(registeredTools.has('skyvern_extract')).toBe(true);
        expect(registeredTools.has('skyvern_sessions')).toBe(true);
    });

    describe('skyvern_task', () => {
        it('creates a task and polls until complete', async () => {
            // POST creates task
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ task_id: 'task-123' }),
                })
                // GET polls — returns completed
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        task_id: 'task-123',
                        status: 'completed',
                        extracted_information: { price: '$29.99' },
                        screenshot_url: 'https://example.com/ss.png',
                    }),
                });

            const handler = registeredTools.get('skyvern_task')!;
            const result = await handler.execute({ prompt: 'Find the price', url: 'https://example.com' });
            const parsed = JSON.parse(result);

            expect(parsed.task_id).toBe('task-123');
            expect(parsed.status).toBe('completed');
            expect(parsed.extracted_data.price).toBe('$29.99');
        });

        it('returns error on API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            });

            const handler = registeredTools.get('skyvern_task')!;
            const result = await handler.execute({ prompt: 'Do something' });

            expect(result).toContain('Error:');
            expect(result).toContain('401');
        });
    });

    describe('skyvern_extract', () => {
        it('creates an extraction task', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ task_id: 'ext-456' }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        status: 'completed',
                        extracted_information: { title: 'Test Page' },
                    }),
                });

            const handler = registeredTools.get('skyvern_extract')!;
            const result = await handler.execute({ url: 'https://example.com', prompt: 'Get the page title' });
            const parsed = JSON.parse(result);

            expect(parsed.status).toBe('completed');
            expect(parsed.extracted_data.title).toBe('Test Page');
        });
    });

    describe('skyvern_sessions', () => {
        it('creates a browser session', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ browser_session_id: 'sess-789' }),
            });

            const handler = registeredTools.get('skyvern_sessions')!;
            const result = await handler.execute({ action: 'create' });
            const parsed = JSON.parse(result);

            expect(parsed.session_id).toBe('sess-789');
            expect(parsed.status).toBe('created');
        });

        it('lists browser sessions', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ([{ browser_session_id: 'sess-1' }]),
            });

            const handler = registeredTools.get('skyvern_sessions')!;
            const result = await handler.execute({ action: 'list' });

            expect(result).toContain('sess-1');
        });

        it('closes a browser session', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const handler = registeredTools.get('skyvern_sessions')!;
            const result = await handler.execute({ action: 'close', session_id: 'sess-789' });
            const parsed = JSON.parse(result);

            expect(parsed.status).toBe('closed');
        });

        it('requires session_id for close action', async () => {
            const handler = registeredTools.get('skyvern_sessions')!;
            const result = await handler.execute({ action: 'close' });

            expect(result).toContain('session_id is required');
        });

        it('rejects unknown actions', async () => {
            const handler = registeredTools.get('skyvern_sessions')!;
            const result = await handler.execute({ action: 'destroy' });

            expect(result).toContain('Unknown action');
        });
    });
});
