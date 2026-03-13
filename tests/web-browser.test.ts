/**
 * TITAN — Web Browser Skill Tests
 * Tests browse_url, browser_search, and browser_auto_nav tools.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_VERSION: '2026.5.12',
}));

// Capture registered tool handlers
const registeredTools: Map<string, { name: string; execute: (args: Record<string, unknown>) => Promise<string> }> = new Map();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn((_meta: unknown, handler: { name: string; execute: (args: Record<string, unknown>) => Promise<string> }) => {
        registeredTools.set(handler.name, handler);
    }),
}));

// Mock Playwright
const mockEvaluate = vi.fn();
const mockScreenshot = vi.fn();
const mockPage = {
    goto: vi.fn(),
    title: vi.fn().mockResolvedValue('Test Page Title'),
    evaluate: mockEvaluate,
    screenshot: mockScreenshot.mockResolvedValue(Buffer.from('fake-screenshot')),
    close: vi.fn(),
    url: vi.fn().mockReturnValue('https://example.com'),
    click: vi.fn(),
    fill: vi.fn(),
    waitForTimeout: vi.fn(),
    locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
            waitFor: vi.fn().mockResolvedValue(undefined),
        }),
    }),
    innerText: vi.fn(),
    focus: vi.fn(),
    type: vi.fn(),
    keyboard: { type: vi.fn(), press: vi.fn() },
};

const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
    addInitScript: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn(),
};

vi.mock('playwright', () => ({
    chromium: {
        launch: vi.fn().mockResolvedValue(mockBrowser),
    },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { initWebBrowserTool, closeBrowser } from '../src/skills/builtin/web_browser.js';

describe('Web Browser Skill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools.clear();
        initWebBrowserTool();
    });

    it('registers all 3 web browser tools', () => {
        expect(registeredTools.has('browse_url')).toBe(true);
        expect(registeredTools.has('browser_search')).toBe(true);
        expect(registeredTools.has('browser_auto_nav')).toBe(true);
    });

    describe('browse_url', () => {
        it('uses fast path fetch for simple pages', async () => {
            const html = `<html><head><title>Simple Page</title></head><body>
                <article>${'This is a substantial amount of content that should pass the threshold check. '.repeat(5)}</article>
            </body></html>`;

            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: async () => html,
            });

            const tool = registeredTools.get('browse_url')!;
            const result = await tool.execute({ url: 'https://example.com/article' });

            expect(result).toContain('Simple Page');
            expect(result).toContain('Direct fetch (fast)');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('falls back to Playwright when fetch returns little content', async () => {
            // Simulate JS-heavy page with minimal content from fetch
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: async () => '<html><body><div id="app"></div></body></html>',
            });

            // Set up Playwright response
            mockEvaluate
                .mockResolvedValueOnce('Rich content loaded via JavaScript that is quite long and substantial for testing purposes.'.repeat(3))
                .mockResolvedValueOnce(['https://example.com/link1', 'https://example.com/link2']);

            const tool = registeredTools.get('browse_url')!;
            const result = await tool.execute({ url: 'https://example.com/spa', extractLinks: true });

            expect(result).toContain('Browser (JavaScript enabled)');
            expect(result).toContain('Test Page Title');
        });

        it('handles fetch failure gracefully and falls back to Playwright', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            mockEvaluate
                .mockResolvedValueOnce('Fallback content from browser')
                .mockResolvedValueOnce([]);

            const tool = registeredTools.get('browse_url')!;
            const result = await tool.execute({ url: 'https://example.com/fail' });

            expect(result).toContain('Browser (JavaScript enabled)');
        });

        it('includes screenshot when requested', async () => {
            mockFetch.mockRejectedValueOnce(new Error('force playwright'));

            mockEvaluate
                .mockResolvedValueOnce('Page content here')
                .mockResolvedValueOnce([]);

            const tool = registeredTools.get('browse_url')!;
            const result = await tool.execute({ url: 'https://example.com', screenshot: true });

            expect(result).toContain('Screenshot captured');
            expect(mockScreenshot).toHaveBeenCalled();
        });

        it('includes extracted links when requested', async () => {
            mockFetch.mockRejectedValueOnce(new Error('force playwright'));

            mockEvaluate
                .mockResolvedValueOnce('Page content')
                .mockResolvedValueOnce(['https://example.com/link1', 'https://example.com/link2']);

            const tool = registeredTools.get('browse_url')!;
            const result = await tool.execute({ url: 'https://example.com', extractLinks: true });

            expect(result).toContain('Links found');
            expect(result).toContain('https://example.com/link1');
        });

        it('rejects invalid URLs', async () => {
            const tool = registeredTools.get('browse_url')!;
            await expect(tool.execute({ url: 'not-a-url' })).rejects.toThrow();
        });
    });

    describe('browser_search', () => {
        it('searches using DuckDuckGo via Playwright', async () => {
            mockEvaluate
                .mockResolvedValueOnce('Search result 1 - some content\nSearch result 2 - more content')
                .mockResolvedValueOnce([]);

            const tool = registeredTools.get('browser_search')!;
            const result = await tool.execute({ query: 'test search' });

            expect(result).toContain('Search results for: "test search"');
            expect(mockPage.goto).toHaveBeenCalledWith(
                expect.stringContaining('duckduckgo.com'),
                expect.any(Object)
            );
        });
    });

    describe('browser_auto_nav', () => {
        it('executes click actions', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockEvaluate.mockResolvedValue([
                { tag: 'button', id: 'submit', name: '', cls: '', text: 'Submit', type: 'submit' },
            ]);

            const tool = registeredTools.get('browser_auto_nav')!;
            const result = await tool.execute({
                url: 'https://example.com',
                actions: [{ action: 'click', selector: '#submit' }],
            });

            expect(result).toContain('Clicked: #submit');
            expect(mockPage.click).toHaveBeenCalledWith('#submit');
        });

        it('executes fill actions', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockEvaluate.mockResolvedValue([]);

            const tool = registeredTools.get('browser_auto_nav')!;
            const result = await tool.execute({
                url: 'https://example.com',
                actions: [{ action: 'fill', selector: '#email', value: 'test@example.com' }],
            });

            expect(result).toContain('Filled: #email');
        });

        it('handles wait actions', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockEvaluate.mockResolvedValue([]);

            const tool = registeredTools.get('browser_auto_nav')!;
            const result = await tool.execute({
                url: 'https://example.com',
                actions: [{ action: 'wait', delayMs: 500 }],
            });

            expect(result).toContain('Waited: 500ms');
        });

        it('stops on first action failure', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.click.mockRejectedValueOnce(new Error('Element not found'));
            mockEvaluate.mockResolvedValue([]);

            const tool = registeredTools.get('browser_auto_nav')!;
            const result = await tool.execute({
                url: 'https://example.com',
                actions: [
                    { action: 'click', selector: '#missing' },
                    { action: 'click', selector: '#second' },
                ],
            });

            expect(result).toContain('Failed Step');
            expect(mockPage.click).toHaveBeenCalledTimes(1);
        });

        it('returns text when returnType is text', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockEvaluate
                .mockResolvedValueOnce(undefined) // evaluate action
                .mockResolvedValueOnce('Full page text content'); // text extraction

            const tool = registeredTools.get('browser_auto_nav')!;
            const result = await tool.execute({
                url: 'https://example.com',
                actions: [{ action: 'evaluate', script: 'console.log("test")' }],
                returnType: 'text',
            });

            expect(result).toContain('Page Text');
        });

        it('returns screenshot when returnType is screenshot', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockEvaluate.mockResolvedValue(undefined);

            const tool = registeredTools.get('browser_auto_nav')!;
            const result = await tool.execute({
                url: 'https://example.com',
                actions: [{ action: 'wait', delayMs: 100 }],
                returnType: 'screenshot',
            });

            expect(result).toContain('Screenshot attached');
        });
    });

    describe('closeBrowser', () => {
        it('is exported and callable', () => {
            expect(typeof closeBrowser).toBe('function');
        });
    });
});
