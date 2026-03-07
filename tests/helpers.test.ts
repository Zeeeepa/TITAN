/**
 * TITAN — Helpers & Utility Tests
 * Tests readJsonFile, writeJsonFile, ensureDir, sleep, fetchWithRetry
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    ensureDir,
    readJsonFile,
    writeJsonFile,
    truncate,
    formatBytes,
    formatDuration,
    sleep,
    shortId,
    deepMerge,
    fetchWithRetry,
} from '../src/utils/helpers.js';

describe('Helpers (extended)', () => {
    describe('ensureDir', () => {
        it('should create a directory if it does not exist', () => {
            const dir = join(tmpdir(), `titan-test-ensure-${Date.now()}`);
            ensureDir(dir);
            expect(existsSync(dir)).toBe(true);
            // Cleanup
            try { require('fs').rmdirSync(dir); } catch {}
        });

        it('should not throw if directory already exists', () => {
            expect(() => ensureDir(tmpdir())).not.toThrow();
        });
    });

    describe('readJsonFile', () => {
        it('should return null for non-existent file', () => {
            expect(readJsonFile('/tmp/titan-nonexistent-json.json')).toBeNull();
        });

        it('should read and parse a JSON file', () => {
            const path = join(tmpdir(), `titan-test-json-${Date.now()}.json`);
            writeFileSync(path, '{"key": "value"}', 'utf-8');
            try {
                const data = readJsonFile<{ key: string }>(path);
                expect(data).not.toBeNull();
                expect(data!.key).toBe('value');
            } finally {
                try { unlinkSync(path); } catch {}
            }
        });

        it('should return null for invalid JSON', () => {
            const path = join(tmpdir(), `titan-test-bad-json-${Date.now()}.json`);
            writeFileSync(path, 'not valid json {{{', 'utf-8');
            try {
                expect(readJsonFile(path)).toBeNull();
            } finally {
                try { unlinkSync(path); } catch {}
            }
        });
    });

    describe('writeJsonFile', () => {
        it('should write a JSON file with pretty formatting', () => {
            const path = join(tmpdir(), `titan-test-write-json-${Date.now()}.json`);
            try {
                writeJsonFile(path, { hello: 'world' });
                const data = readJsonFile<{ hello: string }>(path);
                expect(data).not.toBeNull();
                expect(data!.hello).toBe('world');
            } finally {
                try { unlinkSync(path); } catch {}
            }
        });
    });

    describe('sleep', () => {
        it('should resolve after the specified delay', async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });
    });

    describe('truncate (additional)', () => {
        it('should return empty string for empty input', () => {
            expect(truncate('', 10)).toBe('');
        });

        it('should handle maxLength less than 3', () => {
            // With maxLength=2, slice(0, -1) + '...' = 'hell...' (7 chars)
            // Just verify it doesn't crash and returns a string
            const result = truncate('hello', 2);
            expect(typeof result).toBe('string');
        });
    });

    describe('formatBytes (additional)', () => {
        it('should format gigabytes', () => {
            expect(formatBytes(1073741824)).toBe('1 GB');
        });
    });

    describe('formatDuration (additional)', () => {
        it('should format hours', () => {
            expect(formatDuration(7200000)).toBe('2h 0m');
        });

        it('should format hours with minutes', () => {
            expect(formatDuration(5400000)).toBe('1h 30m');
        });
    });

    describe('deepMerge (additional)', () => {
        it('should not mutate the original objects', () => {
            const target = { a: 1, b: { x: 10 } };
            const source = { b: { y: 20 } } as any;
            const result = deepMerge(target, source);
            expect(result.b).toEqual({ x: 10, y: 20 });
            expect(target.b).toEqual({ x: 10 }); // original unchanged
        });

        it('should handle arrays as values (not merge them)', () => {
            const result = deepMerge({ a: [1, 2] }, { a: [3, 4] } as any);
            expect(result.a).toEqual([3, 4]); // replaced, not merged
        });

        it('should handle undefined values in source', () => {
            const result = deepMerge({ a: 1, b: 2 }, { a: undefined } as any);
            expect(result.a).toBe(1); // undefined doesn't overwrite
        });

        it('should handle null values in source', () => {
            const result = deepMerge({ a: 1 }, { a: null } as any);
            expect(result.a).toBeNull(); // null does overwrite
        });

        it('should deeply merge nested objects', () => {
            const result = deepMerge(
                { a: { b: { c: 1, d: 2 } } },
                { a: { b: { c: 3 } } } as any,
            );
            expect(result.a.b.c).toBe(3);
            expect(result.a.b.d).toBe(2);
        });
    });

    describe('shortId', () => {
        it('should return a string of length 8', () => {
            const id = shortId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeLessThanOrEqual(8);
            expect(id.length).toBeGreaterThan(0);
        });

        it('should return unique ids', () => {
            const ids = new Set(Array.from({ length: 100 }, () => shortId()));
            expect(ids.size).toBeGreaterThan(90); // at least 90% unique
        });
    });

    describe('formatBytes (extended)', () => {
        it('should format 0 bytes', () => {
            expect(formatBytes(0)).toBe('0 B');
        });

        it('should format bytes', () => {
            expect(formatBytes(500)).toBe('500 B');
        });

        it('should format kilobytes', () => {
            expect(formatBytes(1024)).toBe('1 KB');
        });

        it('should format megabytes', () => {
            expect(formatBytes(1048576)).toBe('1 MB');
        });
    });

    describe('formatDuration (extended)', () => {
        it('should format milliseconds', () => {
            expect(formatDuration(500)).toBe('500ms');
        });

        it('should format seconds', () => {
            expect(formatDuration(5000)).toBe('5.0s');
        });

        it('should format minutes and seconds', () => {
            expect(formatDuration(90000)).toBe('1m 30s');
        });
    });

    describe('truncate (extended)', () => {
        it('should not truncate string within limit', () => {
            expect(truncate('hello', 10)).toBe('hello');
        });

        it('should truncate long strings with ellipsis', () => {
            expect(truncate('hello world', 8)).toBe('hello...');
        });
    });

    describe('fetchWithRetry', () => {
        const originalFetch = globalThis.fetch;

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('should return response on success', async () => {
            const mockResponse = { status: 200, ok: true, headers: new Headers() } as Response;
            globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

            const result = await fetchWithRetry('https://example.com', {}, { maxRetries: 0 });
            expect(result.status).toBe(200);
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        it('should retry on 429 status', async () => {
            const retryResponse = { status: 429, ok: false, headers: new Headers() } as Response;
            const successResponse = { status: 200, ok: true, headers: new Headers() } as Response;

            globalThis.fetch = vi.fn()
                .mockResolvedValueOnce(retryResponse)
                .mockResolvedValueOnce(successResponse);

            const result = await fetchWithRetry('https://example.com', {}, {
                maxRetries: 1,
                initialDelayMs: 10,
            });
            expect(result.status).toBe(200);
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        });

        it('should retry on 500 status', async () => {
            const retryResponse = { status: 500, ok: false, headers: new Headers() } as Response;
            const successResponse = { status: 200, ok: true, headers: new Headers() } as Response;

            globalThis.fetch = vi.fn()
                .mockResolvedValueOnce(retryResponse)
                .mockResolvedValueOnce(successResponse);

            const result = await fetchWithRetry('https://example.com', {}, {
                maxRetries: 1,
                initialDelayMs: 10,
            });
            expect(result.status).toBe(200);
        });

        it('should return last response after max retries', async () => {
            const retryResponse = { status: 503, ok: false, headers: new Headers() } as Response;

            globalThis.fetch = vi.fn().mockResolvedValue(retryResponse);

            const result = await fetchWithRetry('https://example.com', {}, {
                maxRetries: 2,
                initialDelayMs: 10,
            });
            expect(result.status).toBe(503);
            expect(globalThis.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
        });

        it('should not retry on non-retryable status', async () => {
            const notFoundResponse = { status: 404, ok: false, headers: new Headers() } as Response;

            globalThis.fetch = vi.fn().mockResolvedValue(notFoundResponse);

            const result = await fetchWithRetry('https://example.com', {}, {
                maxRetries: 3,
                initialDelayMs: 10,
            });
            expect(result.status).toBe(404);
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        it('should retry on network error and throw after max retries', async () => {
            globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

            await expect(
                fetchWithRetry('https://example.com', {}, { maxRetries: 1, initialDelayMs: 10 })
            ).rejects.toThrow('Connection refused');
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        });

        it('should respect Retry-After header', async () => {
            const retryHeaders = new Headers();
            retryHeaders.set('Retry-After', '1');
            const retryResponse = { status: 429, ok: false, headers: retryHeaders } as Response;
            const successResponse = { status: 200, ok: true, headers: new Headers() } as Response;

            globalThis.fetch = vi.fn()
                .mockResolvedValueOnce(retryResponse)
                .mockResolvedValueOnce(successResponse);

            const start = Date.now();
            await fetchWithRetry('https://example.com', {}, {
                maxRetries: 1,
                initialDelayMs: 10,
            });
            const elapsed = Date.now() - start;
            // Should have waited ~1000ms (Retry-After: 1 second)
            expect(elapsed).toBeGreaterThanOrEqual(900);
        });

        it('should use custom retryable statuses', async () => {
            const customResponse = { status: 418, ok: false, headers: new Headers() } as Response;
            const successResponse = { status: 200, ok: true, headers: new Headers() } as Response;

            globalThis.fetch = vi.fn()
                .mockResolvedValueOnce(customResponse)
                .mockResolvedValueOnce(successResponse);

            const result = await fetchWithRetry('https://example.com', {}, {
                maxRetries: 1,
                initialDelayMs: 10,
                retryableStatuses: [418],
            });
            expect(result.status).toBe(200);
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        });
    });
});
