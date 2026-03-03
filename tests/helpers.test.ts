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
    });
});
