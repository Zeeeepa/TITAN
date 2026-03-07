/**
 * TITAN — web_read + web_act Tests
 * Tests the LLM-friendly browsing tools.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock registerSkill to capture tool handlers
const registeredTools: Map<string, { name: string; execute: (args: Record<string, unknown>) => Promise<string> }> = new Map();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn((_meta: unknown, handler: { name: string; execute: (args: Record<string, unknown>) => Promise<string> }) => {
        registeredTools.set(handler.name, handler);
    }),
}));

// Mock playwright to prevent real browser launches
const mockPage = {
    goto: vi.fn(),
    title: vi.fn().mockResolvedValue('Test Page'),
    evaluate: vi.fn().mockResolvedValue([]),
    content: vi.fn().mockResolvedValue('<html><body>test</body></html>'),
    close: vi.fn(),
    url: vi.fn().mockReturnValue('https://example.com'),
    click: vi.fn(),
    fill: vi.fn(),
    waitForTimeout: vi.fn(),
    focus: vi.fn(),
    keyboard: { press: vi.fn() },
    goBack: vi.fn(),
    mouse: { wheel: vi.fn() },
    locator: vi.fn(),
    $eval: vi.fn(),
};

const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
};

// Mock web_browser.ts getOrCreateBrowser
vi.mock('../src/skills/builtin/web_browser.js', () => ({
    getOrCreateBrowser: vi.fn().mockResolvedValue(mockContext),
}));

// Mock jsdom + readability + turndown
const mockParse = vi.fn();
const mockTurndown = vi.fn();

vi.mock('jsdom', () => ({
    JSDOM: class {
        window: { document: { title: string; documentElement: unknown; querySelector: () => null } };
        constructor(html: string) {
            this.window = {
                document: {
                    title: 'Test Page',
                    documentElement: { innerHTML: html },
                    querySelector: () => null,
                } as unknown as { title: string; documentElement: unknown; querySelector: () => null },
            };
        }
    },
}));

vi.mock('@mozilla/readability', () => ({
    Readability: class {
        parse: typeof mockParse;
        constructor() { this.parse = mockParse; }
    },
}));

vi.mock('turndown', () => {
    return {
        default: class {
            turndown: typeof mockTurndown;
            constructor() { this.turndown = mockTurndown; }
            addRule() { return this; }
        },
    };
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { registerWebBrowseLlmSkill } from '../src/skills/builtin/web_browse_llm.js';

describe('Web Browse LLM Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools.clear();
        registerWebBrowseLlmSkill();
    });

    it('registers both web_read and web_act tools', () => {
        expect(registeredTools.has('web_read')).toBe(true);
        expect(registeredTools.has('web_act')).toBe(true);
    });

    describe('web_read', () => {
        it('fetches URL and returns markdown via Readability + Turndown', async () => {
            const html = '<html><head><title>Test Article</title></head><body><article>This is a long enough test content that should pass the 200 char threshold for plain fetch. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.</article></body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                url: 'https://example.com/article',
                text: async () => html,
            });

            mockParse.mockReturnValueOnce({
                title: 'Test Article',
                content: '<p>Clean article content here</p>',
            });

            mockTurndown.mockReturnValueOnce('Clean article content here');

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/article' });

            expect(result).toContain('Test Article');
            expect(result).toContain('https://example.com/article');
            expect(result).toContain('Clean article content here');
        });

        it('respects maxTokens parameter', async () => {
            const html = '<html><head><title>Long</title></head><body><article>' + 'x'.repeat(500) + '</article></body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                url: 'https://example.com/long',
                text: async () => html,
            });

            mockParse.mockReturnValueOnce({
                title: 'Long',
                content: '<p>' + 'A'.repeat(5000) + '</p>',
            });

            mockTurndown.mockReturnValueOnce('A'.repeat(5000));

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/long', maxTokens: 100 });

            // 100 tokens ≈ 400 chars + header
            expect(result).toContain('[... truncated]');
        });

        it('enforces minimum maxTokens of 100', async () => {
            const html = '<html><head><title>Min</title></head><body><article>' + 'x'.repeat(500) + '</article></body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                url: 'https://example.com/min',
                text: async () => html,
            });

            mockParse.mockReturnValueOnce({
                title: 'Min',
                content: '<p>Content</p>',
            });

            mockTurndown.mockReturnValueOnce('Content');

            const tool = registeredTools.get('web_read')!;
            // maxTokens: 0 should be clamped to 100
            const result = await tool.execute({ url: 'https://example.com/min', maxTokens: 0 });
            expect(result).toContain('Source:');
        });

        it('falls back to basic extraction when Readability returns null', async () => {
            const html = '<html><head><title>Basic Page</title></head><body><p>' + 'Content here. '.repeat(30) + '</p></body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                url: 'https://example.com/basic',
                text: async () => html,
            });

            mockParse.mockReturnValueOnce(null);
            mockTurndown.mockReturnValueOnce('Content from fallback');

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/basic' });

            expect(result).toContain('Source: https://example.com/basic');
        });

        it('falls back to Playwright when fetch has little content', async () => {
            // Simulate JS-heavy page: fetch returns almost no text
            mockFetch.mockResolvedValueOnce({
                ok: true,
                url: 'https://example.com/spa',
                text: async () => '<html><body><div id="app"></div></body></html>',
            });

            // Playwright page mock
            mockPage.content.mockResolvedValueOnce('<html><body><h1>Loaded via JS</h1><p>Rich content</p></body></html>');
            mockPage.url.mockReturnValueOnce('https://example.com/spa');

            mockParse.mockReturnValueOnce({
                title: 'SPA Page',
                content: '<p>JS rendered content</p>',
            });
            mockTurndown.mockReturnValueOnce('JS rendered content');

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/spa' });

            expect(result).toContain('Source:');
            expect(mockPage.goto).toHaveBeenCalled();
            expect(mockPage.close).toHaveBeenCalled();
        });

        it('falls back to Playwright when fetch fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            mockPage.content.mockResolvedValueOnce('<html><body>Fetched by browser</body></html>');
            mockPage.url.mockReturnValueOnce('https://example.com/fail');

            mockParse.mockReturnValueOnce({
                title: 'Fallback',
                content: '<p>From browser</p>',
            });
            mockTurndown.mockReturnValueOnce('From browser');

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/fail' });

            expect(result).toContain('Source:');
            expect(mockPage.goto).toHaveBeenCalled();
        });

        it('falls back to Playwright when fetch returns non-ok status', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            mockPage.content.mockResolvedValueOnce('<html><body>Browser loaded</body></html>');
            mockPage.url.mockReturnValueOnce('https://example.com/404');

            mockParse.mockReturnValueOnce({ title: '404', content: '<p>Not found</p>' });
            mockTurndown.mockReturnValueOnce('Not found');

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/404' });
            expect(result).toContain('Source:');
        });

        it('returns error message when url is missing', async () => {
            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({});
            expect(result).toContain('Error');
        });

        it('handles complete failure gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('DNS fail'));
            mockPage.goto.mockRejectedValueOnce(new Error('Playwright timeout'));

            const tool = registeredTools.get('web_read')!;
            const result = await tool.execute({ url: 'https://example.com/broken' });
            expect(result).toContain('Error');
        });
    });

    describe('web_act', () => {
        it('returns error when no page loaded and action is not open', async () => {
            mockPage.url.mockReturnValueOnce('about:blank');
            const tool = registeredTools.get('web_act')!;
            const result = await tool.execute({ action: 'click 1' });
            expect(result).toContain('No page loaded');
        });

        it('opens a URL and returns snapshot', async () => {
            // First call creates session — page starts at about:blank
            mockPage.url.mockReturnValueOnce('about:blank');
            // After goto, page is at the new URL
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.title.mockResolvedValue('Example');
            mockPage.evaluate
                .mockResolvedValueOnce([ // element map
                    { id: 1, role: 'link', name: 'Home', value: '', href: 'https://example.com', tagName: 'a', type: '', checked: false, disabled: false },
                    { id: 2, role: 'textbox', name: 'Search', value: '', href: '', tagName: 'input', type: 'text', checked: false, disabled: false },
                ])
                .mockResolvedValueOnce('Welcome to Example'); // page text

            const tool = registeredTools.get('web_act')!;
            const result = await tool.execute({ action: 'open https://example.com', sessionId: 'test1' });

            expect(result).toContain('Example');
            expect(result).toContain('[1] link "Home"');
            expect(result).toContain('[2] textbox "Search"');
            expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
        });

        it('auto-prefixes https:// for URLs without protocol', async () => {
            mockPage.url.mockReturnValueOnce('about:blank');
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            await tool.execute({ action: 'open example.com', sessionId: 'test-prefix' });

            expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
        });

        it('clicks an element by number', async () => {
            // Set up a session with a page that has elements
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate
                .mockResolvedValueOnce([
                    { id: 1, role: 'link', name: 'Home', value: '', href: '/', tagName: 'a', type: '', checked: false, disabled: false },
                    { id: 2, role: 'button', name: 'Submit', value: '', href: '', tagName: 'button', type: '', checked: false, disabled: false },
                ])
                .mockResolvedValueOnce('Page text');

            // First open the page
            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-click' });

            // Now click element 2
            mockPage.evaluate
                .mockResolvedValueOnce([
                    { id: 1, role: 'link', name: 'Next', value: '', href: '/next', tagName: 'a', type: '', checked: false, disabled: false },
                ])
                .mockResolvedValueOnce('Next page');

            const result = await tool.execute({ action: 'click 2', sessionId: 'test-click' });
            expect(mockPage.click).toHaveBeenCalledWith('[data-titan-id="2"]', expect.any(Object));
            expect(result).toContain('Page:');
        });

        it('types text into an element', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate
                .mockResolvedValueOnce([
                    { id: 1, role: 'textbox', name: 'Search', value: '', href: '', tagName: 'input', type: 'text', checked: false, disabled: false },
                ])
                .mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-type' });

            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const result = await tool.execute({ action: 'type 1 hello world', sessionId: 'test-type' });
            expect(mockPage.fill).toHaveBeenCalledWith('[data-titan-id="1"]', 'hello world');
            expect(result).toContain('Page:');
        });

        it('presses a key on an element', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([
                { id: 1, role: 'textbox', name: 'Search', value: 'hello', href: '', tagName: 'input', type: 'text', checked: false, disabled: false },
            ]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-press' });

            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const result = await tool.execute({ action: 'press 1 Enter', sessionId: 'test-press' });
            expect(mockPage.focus).toHaveBeenCalledWith('[data-titan-id="1"]');
            expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
            expect(result).toContain('Page:');
        });

        it('scrolls the page', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-scroll' });

            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const result = await tool.execute({ action: 'scroll down', sessionId: 'test-scroll' });
            expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 600);
            expect(result).toContain('Page:');
        });

        it('scrolls up', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-scroll-up' });

            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            await tool.execute({ action: 'scroll up', sessionId: 'test-scroll-up' });
            expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, -600);
        });

        it('goes back', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-back' });

            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            await tool.execute({ action: 'back', sessionId: 'test-back' });
            expect(mockPage.goBack).toHaveBeenCalledWith({ timeout: 10_000 });
        });

        it('returns snapshot on request', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-snap' });

            mockPage.evaluate
                .mockResolvedValueOnce([
                    { id: 1, role: 'link', name: 'About', value: '', href: '/about', tagName: 'a', type: '', checked: false, disabled: false },
                ])
                .mockResolvedValueOnce('About page content');

            const result = await tool.execute({ action: 'snapshot', sessionId: 'test-snap' });
            expect(result).toContain('[1] link "About"');
            expect(result).toContain('About page content');
        });

        it('returns full page text on text action', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-text' });

            mockPage.evaluate.mockResolvedValueOnce('Full article text with lots of content here');

            const result = await tool.execute({ action: 'text', sessionId: 'test-text' });
            expect(result).toContain('Full article text');
        });

        it('returns error for unknown actions', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-unknown' });

            const result = await tool.execute({ action: 'dance', sessionId: 'test-unknown' });
            expect(result).toContain('Unknown action');
            expect(result).toContain('Available:');
        });

        it('returns error when open has no URL', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-nourl' });

            const result = await tool.execute({ action: 'open', sessionId: 'test-nourl' });
            expect(result).toContain('Error');
            expect(result).toContain('URL');
        });

        it('returns error when clicking non-existent element', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-noelem' });

            const result = await tool.execute({ action: 'click 99', sessionId: 'test-noelem' });
            expect(result).toContain('Error');
            expect(result).toContain('not found');
        });

        it('returns error when type has no text', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([
                { id: 1, role: 'textbox', name: 'Q', value: '', href: '', tagName: 'input', type: 'text', checked: false, disabled: false },
            ]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-notype' });

            const result = await tool.execute({ action: 'type 1', sessionId: 'test-notype' });
            expect(result).toContain('Error');
        });

        it('handles Playwright errors gracefully', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate.mockResolvedValueOnce([
                { id: 1, role: 'button', name: 'Go', value: '', href: '', tagName: 'button', type: '', checked: false, disabled: false },
            ]).mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-error' });

            // Make click throw
            mockPage.click.mockRejectedValueOnce(new Error('Element detached from DOM'));

            const result = await tool.execute({ action: 'click 1', sessionId: 'test-error' });
            expect(result).toContain('Error');
            expect(result).toContain('snapshot');
        });

        it('uses default session when no sessionId provided', async () => {
            mockPage.url.mockReturnValueOnce('about:blank');
            const tool = registeredTools.get('web_act')!;
            const result = await tool.execute({ action: 'click 1' });
            // Should use __default__ session and see about:blank
            expect(result).toContain('No page loaded');
        });

        it('select action delegates to evaluate', async () => {
            mockPage.url.mockReturnValue('https://example.com');
            mockPage.evaluate
                .mockResolvedValueOnce([
                    { id: 1, role: 'combobox', name: 'Country', value: '', href: '', tagName: 'select', type: '', checked: false, disabled: false },
                ])
                .mockResolvedValueOnce('');

            const tool = registeredTools.get('web_act')!;
            mockPage.url.mockReturnValueOnce('about:blank');
            await tool.execute({ action: 'open https://example.com', sessionId: 'test-select' });

            mockPage.evaluate
                .mockResolvedValueOnce(undefined) // select evaluate call
                .mockResolvedValueOnce([]) // snapshot elements
                .mockResolvedValueOnce(''); // snapshot text

            const result = await tool.execute({ action: 'select 1 USA', sessionId: 'test-select' });
            expect(result).toContain('Page:');
        });
    });
});
