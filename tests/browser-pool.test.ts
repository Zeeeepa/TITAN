/**
 * Tests for src/browsing/browserPool.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMkdirSync = vi.hoisted(() => vi.fn());

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return { ...actual, mkdirSync: mockMkdirSync };
});
vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock playwright
const mockPage = {
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    goto: vi.fn().mockResolvedValue(undefined),
};

const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
    isConnected: vi.fn().mockReturnValue(true),
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
};

const mockChromium = {
    launch: vi.fn().mockResolvedValue(mockBrowser),
};

vi.mock('playwright', () => ({
    chromium: mockChromium,
}));

let poolModule: typeof import('../src/browsing/browserPool.js');

describe('BrowserPool', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        vi.doMock('fs', async (importOriginal) => {
            const actual = await importOriginal<typeof import('fs')>();
            return { ...actual, mkdirSync: mockMkdirSync };
        });
        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));
        vi.doMock('playwright', () => ({
            chromium: mockChromium,
        }));

        poolModule = await import('../src/browsing/browserPool.js');
    });

    describe('getSharedBrowser', () => {
        it('launches a browser on first call', async () => {
            const browser = await poolModule.getSharedBrowser();
            expect(mockChromium.launch).toHaveBeenCalledTimes(1);
            expect(browser).toBe(mockBrowser);
        });

        it('reuses existing browser on subsequent calls', async () => {
            await poolModule.getSharedBrowser();
            await poolModule.getSharedBrowser();
            expect(mockChromium.launch).toHaveBeenCalledTimes(1);
        });
    });

    describe('getDefaultContext', () => {
        it('creates a context with realistic user agent', async () => {
            const ctx = await poolModule.getDefaultContext();
            expect(mockBrowser.newContext).toHaveBeenCalledWith(expect.objectContaining({
                viewport: { width: 1280, height: 800 },
            }));
            expect(ctx).toBe(mockContext);
        });
    });

    describe('getPage / releasePage', () => {
        it('creates and releases pages', async () => {
            const page = await poolModule.getPage();
            expect(mockContext.newPage).toHaveBeenCalled();

            const status = poolModule.getPoolStatus();
            expect(status.pages).toBe(1);

            await poolModule.releasePage(page);
            const statusAfter = poolModule.getPoolStatus();
            expect(statusAfter.pages).toBe(0);
        });

        it('enforces max page limit (5)', async () => {
            // Get 5 pages
            for (let i = 0; i < 5; i++) {
                await poolModule.getPage();
            }

            // 6th should throw
            await expect(poolModule.getPage()).rejects.toThrow(/pool full/i);
        });
    });

    describe('closeBrowser', () => {
        it('closes browser and resets state', async () => {
            await poolModule.getSharedBrowser();
            await poolModule.closeBrowser();

            expect(mockBrowser.close).toHaveBeenCalled();
            const status = poolModule.getPoolStatus();
            expect(status.pages).toBe(0);
        });
    });

    describe('getPoolStatus', () => {
        it('returns pool status', async () => {
            const status = poolModule.getPoolStatus();
            expect(status).toHaveProperty('connected');
            expect(status).toHaveProperty('pages');
            expect(status).toHaveProperty('maxPages');
            expect(status.maxPages).toBe(5);
        });
    });
});
