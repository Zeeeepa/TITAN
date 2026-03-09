/**
 * Tests for src/browsing/stagehand.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock browserPool
const mockGetPage = vi.hoisted(() => vi.fn());
const mockReleasePage = vi.hoisted(() => vi.fn());
const mockGetSharedBrowser = vi.hoisted(() => vi.fn());

vi.mock('../src/browsing/browserPool.js', () => ({
    getPage: mockGetPage,
    releasePage: mockReleasePage,
    getSharedBrowser: mockGetSharedBrowser,
}));
vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Default: Stagehand NOT available (test Playwright fallback paths)
vi.mock('@browserbasehq/stagehand', () => {
    throw new Error('Module not found');
});

function makeMockPage() {
    return {
        goto: vi.fn().mockResolvedValue(undefined),
        title: vi.fn().mockResolvedValue('Test Page'),
        content: vi.fn().mockResolvedValue('<html><body>Test content</body></html>'),
        evaluate: vi.fn().mockResolvedValue('Page text content here'),
        close: vi.fn().mockResolvedValue(undefined),
        isClosed: vi.fn().mockReturnValue(false),
        getByText: vi.fn().mockReturnValue({
            first: () => ({ click: vi.fn().mockResolvedValue(undefined) }),
        }),
        getByPlaceholder: vi.fn().mockReturnValue({
            first: () => ({ fill: vi.fn().mockResolvedValue(undefined) }),
        }),
        locator: vi.fn().mockReturnValue({
            first: () => ({ fill: vi.fn().mockResolvedValue(undefined) }),
        }),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
    };
}

let stagehandModule: typeof import('../src/browsing/stagehand.js');

describe('Stagehand', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        vi.doMock('../src/browsing/browserPool.js', () => ({
            getPage: mockGetPage,
            releasePage: mockReleasePage,
            getSharedBrowser: mockGetSharedBrowser,
        }));
        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));
        // Stagehand not available — uses Playwright fallbacks
        vi.doMock('@browserbasehq/stagehand', () => {
            throw new Error('Module not found');
        });

        const mockPage = makeMockPage();
        mockGetPage.mockResolvedValue(mockPage);
        mockReleasePage.mockResolvedValue(undefined);

        stagehandModule = await import('../src/browsing/stagehand.js');
    });

    describe('act (Playwright fallback)', () => {
        it('navigates to URL and attempts action', async () => {
            const mockPage = makeMockPage();
            mockGetPage.mockResolvedValue(mockPage);

            const result = await stagehandModule.act('https://example.com', 'click "Submit"');

            expect(result.success).toBe(true);
            expect(result.content).toContain('Test Page');
            expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
            expect(mockReleasePage).toHaveBeenCalled();
        });

        it('handles click actions by text', async () => {
            const mockPage = makeMockPage();
            mockGetPage.mockResolvedValue(mockPage);

            await stagehandModule.act('https://example.com', 'click "Login"');

            expect(mockPage.getByText).toHaveBeenCalledWith('Login', expect.any(Object));
        });

        it('returns failure on error', async () => {
            const mockPage = makeMockPage();
            mockPage.goto.mockRejectedValue(new Error('Network error'));
            mockGetPage.mockResolvedValue(mockPage);

            const result = await stagehandModule.act('https://example.com', 'click button');

            expect(result.success).toBe(false);
            expect(result.content).toContain('failed');
        });
    });

    describe('extract (Playwright fallback)', () => {
        it('extracts page content', async () => {
            const mockPage = makeMockPage();
            mockGetPage.mockResolvedValue(mockPage);

            const result = await stagehandModule.extract('https://example.com', 'Get the main content');

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(mockReleasePage).toHaveBeenCalled();
        });

        it('handles errors gracefully', async () => {
            const mockPage = makeMockPage();
            mockPage.goto.mockRejectedValue(new Error('Timeout'));
            mockGetPage.mockResolvedValue(mockPage);

            const result = await stagehandModule.extract('https://example.com', 'Get content');

            expect(result.success).toBe(false);
        });
    });

    describe('observe (Playwright fallback)', () => {
        it('returns interactive elements', async () => {
            const mockPage = makeMockPage();
            mockPage.evaluate.mockResolvedValue([
                { description: 'Login Button', selector: '#login' },
                { description: 'Search Input', selector: 'input[type="text"]' },
            ]);
            mockGetPage.mockResolvedValue(mockPage);

            const result = await stagehandModule.observe('https://example.com');

            expect(result.success).toBe(true);
            expect(result.elements).toHaveLength(2);
            expect(mockReleasePage).toHaveBeenCalled();
        });

        it('returns empty elements on error', async () => {
            const mockPage = makeMockPage();
            mockPage.goto.mockRejectedValue(new Error('Timeout'));
            mockGetPage.mockResolvedValue(mockPage);

            const result = await stagehandModule.observe('https://example.com');

            expect(result.success).toBe(false);
            expect(result.elements).toEqual([]);
        });
    });
});
