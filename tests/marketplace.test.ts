/**
 * TITAN — Marketplace (ClaWHub) Tests
 * Tests skills/marketplace.ts: search, details, install from ClaWHub and URLs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_HOME: '/tmp/titan-test-marketplace',
    TITAN_VERSION: '2026.5.0',
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    };
});

vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

vi.mock('../src/skills/scanner.js', () => ({
    scanSkillCode: vi.fn().mockReturnValue({
        safe: true,
        score: 100,
        findings: [],
        recommendation: 'approve',
    }),
    formatScanResult: vi.fn().mockReturnValue('Scan: OK'),
    quarantineSkill: vi.fn().mockReturnValue({ quarantinedTo: '/tmp/quarantine' }),
    scanAllUserSkills: vi.fn().mockReturnValue({ scanned: 0, safe: 0, warned: 0, blocked: 0, quarantined: [], results: new Map() }),
    generateScanReport: vi.fn().mockReturnValue('# Report'),
}));

// We need to mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { searchSkills, getSkillDetails, installFromClaWHub, installFromUrl } from '../src/skills/marketplace.js';
import { scanSkillCode } from '../src/skills/scanner.js';

describe('ClaWHub Marketplace', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Re-establish default mock return values after clearAllMocks
        vi.mocked(scanSkillCode).mockReturnValue({
            safe: true,
            score: 100,
            findings: [],
            recommendation: 'approve',
        });
        // Suppress console.log from formatScanResult
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('searchSkills', () => {
        it('should return search results from ClaWHub API', async () => {
            const mockResult = {
                skills: [
                    { id: 'csv-parser', name: 'csv_parser', description: 'Parse CSV files', author: 'test', version: '1.0.0', tags: ['csv'], downloads: 100, rating: 4.5, verified: true, url: 'https://clawhub.ai/skills/csv-parser' },
                ],
                total: 1,
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResult),
            });

            const result = await searchSkills('csv');
            expect(result.skills).toHaveLength(1);
            expect(result.skills[0].name).toBe('csv_parser');
            expect(result.total).toBe(1);
        });

        it('should return empty results when API is unreachable', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await searchSkills('csv');
            expect(result.skills).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('should encode the query parameter', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ skills: [], total: 0 }),
            });
            await searchSkills('hello world');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('q=hello%20world'),
                expect.any(Object),
            );
        });

        it('should pass the limit parameter', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ skills: [], total: 0 }),
            });
            await searchSkills('test', 5);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=5'),
                expect.any(Object),
            );
        });

        it('should handle non-ok responses gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });
            const result = await searchSkills('csv');
            expect(result.skills).toEqual([]);
            expect(result.total).toBe(0);
        });
    });

    describe('getSkillDetails', () => {
        it('should return skill details', async () => {
            const mockSkill = {
                id: 'csv-parser',
                name: 'csv_parser',
                description: 'Parse CSV',
                author: 'test',
                version: '1.0.0',
                tags: [],
                downloads: 50,
                rating: 4.0,
                verified: false,
                url: 'https://clawhub.ai/skills/csv-parser',
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockSkill),
            });

            const result = await getSkillDetails('csv-parser');
            expect(result).not.toBeNull();
            expect(result!.name).toBe('csv_parser');
        });

        it('should return null on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Not found'));
            const result = await getSkillDetails('nonexistent');
            expect(result).toBeNull();
        });

        it('should return null on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });
            const result = await getSkillDetails('missing');
            expect(result).toBeNull();
        });
    });

    describe('installFromClaWHub', () => {
        it('should install a skill that passes security scan', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ name: 'safe_skill', code: 'export const x = 1;' }),
            });

            const result = await installFromClaWHub('safe_skill');
            expect(result.success).toBe(true);
            expect(result.skillName).toBe('safe_skill');
            expect(result.installedPath).toContain('safe_skill.ts');
        });

        it('should return error when fetch fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
            const result = await installFromClaWHub('bad_skill');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Could not fetch skill');
        });

        it('should block skills with critical findings', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ name: 'evil_skill', code: 'bash -i >& /dev/tcp' }),
            });
            vi.mocked(scanSkillCode).mockReturnValueOnce({
                safe: false,
                score: 0,
                findings: [{ severity: 'critical', rule: 'REVERSE_SHELL', description: 'Bad stuff' }],
                recommendation: 'block',
            });

            const result = await installFromClaWHub('evil_skill');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Blocked by security scanner');
        });

        it('should block warned skills unless forced', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ name: 'risky_skill', code: 'eval(Buffer.from("x"))' }),
            });
            vi.mocked(scanSkillCode).mockReturnValueOnce({
                safe: false,
                score: 30,
                findings: [{ severity: 'high', rule: 'OBFUSCATION', description: 'Obfuscated' }],
                recommendation: 'warn',
            });

            const result = await installFromClaWHub('risky_skill');
            expect(result.success).toBe(false);
            expect(result.error).toContain('--force');
        });

        it('should install warned skills when forced', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ name: 'risky_forced', code: 'some code' }),
            });
            vi.mocked(scanSkillCode).mockReturnValueOnce({
                safe: false,
                score: 30,
                findings: [{ severity: 'high', rule: 'TEST', description: 'Test' }],
                recommendation: 'warn',
            });

            const result = await installFromClaWHub('risky_forced', { force: true });
            expect(result.success).toBe(true);
        });

        it('should use skillIdOrName as fallback name', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ code: 'export const a = 1;' }),
            });

            const result = await installFromClaWHub('my-skill');
            expect(result.skillName).toBe('my-skill');
        });

        it('should sanitize filenames', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ name: 'my skill/name', code: 'export const a = 1;' }),
            });

            const result = await installFromClaWHub('my-skill');
            expect(result.installedPath).toContain('my_skill_name.ts');
        });
    });

    describe('installFromUrl', () => {
        it('should install a skill from a URL', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('export function test() { return 42; }'),
            });

            const result = await installFromUrl('https://example.com/skills/my_skill.ts');
            expect(result.success).toBe(true);
            expect(result.skillName).toBe('my_skill');
        });

        it('should return error when fetch fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Timeout'));
            const result = await installFromUrl('https://example.com/bad.ts');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to fetch skill');
        });

        it('should return error on HTTP error status', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });
            const result = await installFromUrl('https://example.com/missing.ts');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to fetch skill');
        });

        it('should block skills that fail security scan', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('bash -i >& /dev/tcp/evil'),
            });
            vi.mocked(scanSkillCode).mockReturnValueOnce({
                safe: false,
                score: 0,
                findings: [{ severity: 'critical', rule: 'REVERSE_SHELL', description: 'Evil' }],
                recommendation: 'block',
            });

            const result = await installFromUrl('https://example.com/evil.ts');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Blocked by security scanner');
        });

        it('should block warned skills unless forced', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('some code'),
            });
            vi.mocked(scanSkillCode).mockReturnValueOnce({
                safe: false,
                score: 30,
                findings: [{ severity: 'high', rule: 'TEST', description: 'Bad' }],
                recommendation: 'warn',
            });

            const result = await installFromUrl('https://example.com/warn.ts');
            expect(result.success).toBe(false);
            expect(result.error).toContain('--force');
        });

        it('should install warned skills with force flag', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('some code'),
            });
            vi.mocked(scanSkillCode).mockReturnValueOnce({
                safe: false,
                score: 30,
                findings: [{ severity: 'high', rule: 'TEST', description: 'Warn' }],
                recommendation: 'warn',
            });

            const result = await installFromUrl('https://example.com/forced.ts', { force: true });
            expect(result.success).toBe(true);
        });

        it('should handle URL with no filename gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('export const a = 1;'),
            });

            const result = await installFromUrl('https://example.com/');
            expect(result.success).toBe(true);
        });
    });
});
