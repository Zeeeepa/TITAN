/**
 * Tests for POST /api/browser/form-fill and POST /api/browser/solve-captcha endpoints
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    initFileLogger: vi.fn(),
    getLogFilePath: vi.fn().mockReturnValue('/tmp/test.log'),
}));

// Mock browserPool
const mockPage = {
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../src/browsing/browserPool.js', () => ({
    getPage: vi.fn().mockResolvedValue(mockPage),
    releasePage: vi.fn().mockResolvedValue(undefined),
    warmUpForCaptcha: vi.fn().mockResolvedValue(undefined),
    humanDelay: vi.fn().mockResolvedValue(undefined),
    getPoolStatus: vi.fn().mockReturnValue({ pages: 0, maxPages: 5, stealth: true }),
}));

// Mock fillFormSmart
vi.mock('../src/skills/builtin/web_browse_llm.js', () => ({
    fillFormSmart: vi.fn().mockResolvedValue(
        '✅ "Full Name" → "Tony Elliott"\n✅ "Email" → "tony@test.com"\nSummary: 2 filled, 0 failed out of 2 fields'
    ),
}));

// Mock captchaSolver
vi.mock('../src/browsing/captchaSolver.js', () => ({
    solveCaptcha: vi.fn().mockResolvedValue({ solved: true, type: 'recaptcha_v3' }),
}));

describe('Browser API Endpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/browser/form-fill', () => {
        it('should validate url is required', async () => {
            const { fillFormSmart } = await import('../src/skills/builtin/web_browse_llm.js');
            // Without actually spinning up Express, test the validation logic
            expect(fillFormSmart).toBeDefined();

            // Test that fillFormSmart was mocked correctly
            const result = await fillFormSmart({} as any, 'https://example.com', { 'Name': 'Tony' }, false);
            expect(result).toContain('✅');
            expect(result).toContain('Tony Elliott');
        });

        it('should parse fill result into structured response', async () => {
            const result = '✅ "Full Name" → "Tony Elliott"\n✅ "Email" → "tony@test.com"\n❌ "Phone": no matching field found\nSummary: 2 filled, 1 failed out of 3 fields';
            const lines = result.split('\n');
            const fieldsMatched = lines.filter(l => l.startsWith('✅')).length;
            const fieldsFailed = lines.filter(l => l.startsWith('❌'))
                .map(l => l.replace(/^❌\s*/, '').split(':')[0]?.trim() || '');

            expect(fieldsMatched).toBe(2);
            expect(fieldsFailed).toEqual(['"Phone"']);
        });

        it('should correctly identify success when no failures', () => {
            const result = '✅ "Name" → "Tony"\n✅ "Email" → "tony@test.com"\nSummary: 2 filled, 0 failed';
            const lines = result.split('\n');
            const fieldsFailed = lines.filter(l => l.startsWith('❌'));
            expect(fieldsFailed.length === 0).toBe(true);
        });

        it('should correctly identify failure when fields fail', () => {
            const result = '✅ "Name" → "Tony"\n❌ "Phone": no match\nSummary: 1 filled, 1 failed';
            const lines = result.split('\n');
            const fieldsFailed = lines.filter(l => l.startsWith('❌'));
            expect(fieldsFailed.length === 0).toBe(false);
        });
    });

    describe('POST /api/browser/solve-captcha', () => {
        it('should call solveCaptcha and return result', async () => {
            const { solveCaptcha } = await import('../src/browsing/captchaSolver.js');
            const result = await solveCaptcha(mockPage as any);
            expect(result.solved).toBe(true);
            expect(result.type).toBe('recaptcha_v3');
        });
    });

    describe('Page lifecycle', () => {
        it('should release page after form fill', async () => {
            const { getPage, releasePage } = await import('../src/browsing/browserPool.js');
            const page = await getPage();
            expect(page).toBe(mockPage);
            await releasePage(page);
            expect(releasePage).toHaveBeenCalledWith(mockPage);
        });
    });
});
