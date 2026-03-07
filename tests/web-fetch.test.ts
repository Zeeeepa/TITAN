/**
 * TITAN — Web Fetch Skill Tests
 * Tests the web_fetch tool including HTML conversion and SSRF protection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_VERSION: '2026.5.12',
}));

const registeredTools: Map<string, { name: string; execute: (args: Record<string, unknown>) => Promise<string> }> = new Map();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn((_meta: unknown, handler: { name: string; execute: (args: Record<string, unknown>) => Promise<string> }) => {
        registeredTools.set(handler.name, handler);
    }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { registerWebFetchSkill } from '../src/skills/builtin/web_fetch.js';

/** Helper to create a ReadableStream-like body from string */
function mockBody(text: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    let read = false;
    return {
        body: {
            getReader: () => ({
                read: async () => {
                    if (!read) {
                        read = true;
                        return { done: false, value: data };
                    }
                    return { done: true, value: undefined };
                },
                cancel: vi.fn().mockResolvedValue(undefined),
            }),
        },
    };
}

describe('Web Fetch Skill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools.clear();
        registerWebFetchSkill();
    });

    it('registers the web_fetch tool', () => {
        expect(registeredTools.has('web_fetch')).toBe(true);
    });

    it('fetches URL and returns markdown by default', async () => {
        const html = '<html><head><title>Test Page</title></head><body><h1>Hello</h1><p>World</p></body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('# Test Page');
        expect(result).toContain('Source: https://example.com');
        expect(result).toContain('# Hello');
    });

    it('returns text mode when specified', async () => {
        const html = '<html><head><title>Text</title></head><body><h1>Hello</h1><p>World</p></body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com', extractMode: 'text' });

        expect(result).toContain('Text');
        expect(result).toContain('Hello');
        // Text mode should not have markdown syntax
        expect(result).not.toContain('# Hello');
    });

    it('converts HTML links to markdown', async () => {
        const html = '<html><head><title>Links</title></head><body><a href="https://test.com">Click</a></body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('[Click](https://test.com)');
    });

    it('converts bold and italic', async () => {
        const html = '<html><head><title>T</title></head><body><strong>bold</strong> <em>italic</em></body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('**bold**');
        expect(result).toContain('*italic*');
    });

    it('converts code blocks', async () => {
        const html = '<html><head><title>T</title></head><body><code>inline</code><pre>block</pre></body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('`inline`');
        expect(result).toContain('```');
    });

    it('strips scripts and styles', async () => {
        const html = '<html><head><title>T</title><style>.x{color:red}</style></head><body><script>alert(1)</script>Content</body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('Content');
        expect(result).not.toContain('alert');
        expect(result).not.toContain('color:red');
    });

    it('respects maxChars parameter', async () => {
        const html = '<html><head><title>Long</title></head><body>' + 'A'.repeat(10000) + '</body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com', maxChars: 100 });

        // Header + 100 chars of content
        expect(result.length).toBeLessThan(300);
    });

    // SSRF protection tests
    it('blocks localhost', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://localhost:8080/secret' });
        expect(result).toContain('not permitted');
    });

    it('blocks 127.0.0.1', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://127.0.0.1/admin' });
        expect(result).toContain('not permitted');
    });

    it('blocks 10.x.x.x', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://10.0.0.1/internal' });
        expect(result).toContain('not permitted');
    });

    it('blocks 172.16-31.x.x', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://172.16.0.1/internal' });
        expect(result).toContain('not permitted');
    });

    it('blocks 192.168.x.x', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://192.168.1.1/router' });
        expect(result).toContain('not permitted');
    });

    it('blocks 169.254.x.x link-local', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://169.254.169.254/metadata' });
        expect(result).toContain('not permitted');
    });

    it('blocks IPv6 loopback ::1', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'http://[::1]:8080/secret' });
        expect(result).toContain('not permitted');
    });

    it('blocks unparseable URLs', async () => {
        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'not-a-valid-url' });
        expect(result).toContain('not permitted');
    });

    it('handles fetch errors gracefully', async () => {
        mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://nonexistent.example.com' });

        expect(result).toContain('Error');
        expect(result).toContain('DNS resolution failed');
    });

    it('handles empty response body', async () => {
        mockFetch.mockResolvedValueOnce({ body: null });

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com/empty' });

        expect(result).toContain('Error');
        expect(result).toContain('No response body');
    });

    it('handles empty text response', async () => {
        mockFetch.mockResolvedValueOnce(mockBody(''));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com/blank' });

        expect(result).toContain('Empty response');
    });

    it('decodes HTML entities', async () => {
        const html = '<html><head><title>T</title></head><body>&amp; &lt;tag&gt; &quot;quoted&quot; &#39;apos&#39; &nbsp;space</body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('& <tag>');
        expect(result).toContain('space');
    });

    it('converts list items', async () => {
        const html = '<html><head><title>T</title></head><body><ul><li>One</li><li>Two</li></ul></body></html>';
        mockFetch.mockResolvedValueOnce(mockBody(html));

        const tool = registeredTools.get('web_fetch')!;
        const result = await tool.execute({ url: 'https://example.com' });

        expect(result).toContain('- One');
        expect(result).toContain('- Two');
    });
});
