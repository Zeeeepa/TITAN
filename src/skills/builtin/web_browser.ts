/**
 * TITAN — Universal Web Browser
 * Set-and-forget web browsing for TITAN. No configuration needed.
 * 
 * HOW IT WORKS:
 * ─────────────────────────────────────────────────────────────────
 * 1. Fast path: tries a plain fetch() first — instant, zero cost
 * 2. If the page needs JavaScript (React/Vue/SPAs), falls back to
 *    Playwright with a persistent local Chromium browser session
 * 3. Extracts clean readable text (not raw HTML) so the LLM gets 
 *    signal, not noise
 * 4. Can screenshot pages for visual tasks
 * 5. Session cookies persist between calls — stay logged in
 * 
 * WHY PLAYWRIGHT + PERSISTANCE:
 * ─────────────────────────────────────────────────────────────────
 * Unlike single-use headless browsers, TITAN keeps one browser
 * session alive for the lifetime of the gateway. This means:
 * - No cold-start cost on every request (~500ms saved per call)
 * - You can log into sites once and TITAN stays logged in
 * - Cookies and localStorage persist across page visits
 * - "Set and forget" — just works, no Docker, no config
 * 
 * AUTO-INSTALL: Playwright chromium is auto-installed on first use.
 */
import { registerTool } from '../../agent/toolRunner.js';
import { z } from 'zod';
import logger from '../../utils/logger.js';

const COMPONENT = 'WebBrowser';

// ─── Types ────────────────────────────────────────────────────────
interface BrowseResult {
    url: string;
    title: string;
    content: string;
    screenshot?: string; // base64
    loadedWithJs: boolean;
    extractedLinks?: string[];
}

// ─── Persistent browser session ───────────────────────────────────
let playwrightBrowser: any = null;
let playwrightContext: any = null;

async function getOrCreateBrowser(): Promise<any> {
    if (playwrightBrowser && playwrightBrowser.isConnected()) {
        return playwrightContext;
    }

    let chromium: any;
    try {
        // Try loading playwright (installed as optional dep)
        const pw = await import('playwright' as any);
        chromium = pw.chromium;
    } catch {
        // Not installed yet — auto-install chromium
        const { execSync } = await import('child_process');
        logger.info(COMPONENT, 'Installing Playwright Chromium (first time only, may take ~1 min)...');
        execSync('npx playwright install chromium --with-deps 2>&1', { stdio: 'pipe', timeout: 120_000 });
        const pw = await import('playwright' as any);
        chromium = pw.chromium;
    }

    playwrightBrowser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    playwrightContext = await playwrightBrowser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
    });
    logger.info(COMPONENT, 'Playwright browser started');
    return playwrightContext;
}

/** Extract clean readable text from HTML */
function extractText(html: string, maxChars = 8000): string {
    // Remove scripts, styles, nav, footer
    const clean = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{3,}/g, '\n\n')
        .trim();
    return clean.slice(0, maxChars);
}

/** Try a plain fetch — fast path for simple pages */
async function fetchSimple(url: string): Promise<BrowseResult | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 TITAN-Agent/2026.4.5' },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const html = await res.text();

        // Heuristic: if page has very little text but lots of JS, it needs a real browser
        const textContent = extractText(html, 200);
        const hasContent = textContent.trim().length > 100;
        if (!hasContent) return null; // Needs JS rendering

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return {
            url,
            title: titleMatch?.[1]?.trim() ?? url,
            content: extractText(html, 8000),
            loadedWithJs: false,
        };
    } catch { return null; }
}

/** Full browser render with Playwright */
async function fetchWithBrowser(url: string, screenshot: boolean): Promise<BrowseResult> {
    const ctx = await getOrCreateBrowser();
    const page = await ctx.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

        const title = await page.title();
        const bodyText = await page.evaluate(() => {
            // Note: this runs in browser context — globalThis is the browser window
            const win = globalThis as any;
            const selectors = ['article', 'main', '[role="main"]', '.content', '#content', 'body'];
            for (const sel of selectors) {
                const el = win.document.querySelector(sel);
                if (el && el.textContent && el.textContent.trim().length > 200) {
                    return el.textContent.trim().replace(/\s{3,}/g, '\n\n').slice(0, 8000);
                }
            }
            return win.document.body?.innerText?.slice(0, 8000) ?? '';
        });

        // Optionally grab visible links
        const links = await page.evaluate(() => {
            const win = globalThis as any;
            return Array.from(win.document.querySelectorAll('a[href]') as any[])
                .map((el: any) => el.href)
                .filter((href: string) => href.startsWith('http'))
                .slice(0, 20);
        });

        let screenshotData: string | undefined;
        if (screenshot) {
            const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
            screenshotData = buf.toString('base64');
        }

        return { url, title, content: bodyText, loadedWithJs: true, extractedLinks: links, screenshot: screenshotData };
    } finally {
        await page.close();
    }
}

// ─── Schema ───────────────────────────────────────────────────────
const BrowseSchema = z.object({
    url: z.string().url().describe('The URL to browse'),
    screenshot: z.boolean().optional().default(false).describe('Whether to take a screenshot'),
    extractLinks: z.boolean().optional().default(false).describe('Whether to extract all links from the page'),
});

const SearchSchema = z.object({
    query: z.string().describe('The search query'),
    numResults: z.number().optional().default(5).describe('Number of results to return (1-10)'),
});

// ─── Register tools ────────────────────────────────────────────────
export function initWebBrowserTool(): void {
    // Browse any URL
    registerTool({
        name: 'browse_url',
        description: 'Browse any webpage and extract its content as clean text. Uses a real browser with JavaScript support for dynamic sites. Perfect for reading articles, documentation, news, checking websites, or any web research.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The full URL to browse (must start with https://)' },
                screenshot: { type: 'boolean', description: 'Take a visual screenshot of the page (optional)', default: false },
                extractLinks: { type: 'boolean', description: 'Also return links found on the page', default: false },
            },
            required: ['url'],
        },
        execute: async (args) => {
            const { url, screenshot, extractLinks } = BrowseSchema.parse(args);
            logger.info(COMPONENT, `Browsing: ${url}`);

            // Try fast path first
            let result = await fetchSimple(url);

            // Fall back to real browser if needed
            if (!result) {
                logger.info(COMPONENT, `Switching to Playwright for JS-heavy page: ${url}`);
                result = await fetchWithBrowser(url, screenshot ?? false);
            }

            const lines = [
                `🌐 **${result.title}**`,
                `URL: ${result.url}`,
                `Loaded with: ${result.loadedWithJs ? 'Browser (JavaScript enabled)' : 'Direct fetch (fast)'}`,
                '',
                result.content,
            ];

            if (extractLinks && result.extractedLinks && result.extractedLinks.length > 0) {
                lines.push('', '🔗 **Links found:**');
                result.extractedLinks.slice(0, 10).forEach((l) => lines.push(`  - ${l}`));
            }

            if (result.screenshot) {
                lines.push('', `📷 Screenshot captured (${result.screenshot.length} bytes)`);
            }

            return lines.join('\n');
        },
    });

    // Web search using DuckDuckGo (no API key needed)
    registerTool({
        name: 'web_search',
        description: 'Search the internet for current information. Returns real search results with titles, URLs, and snippets. Works without any API key — truly set and forget.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for on the internet' },
                numResults: { type: 'number', description: 'Number of results to return (1-10)', default: 5 },
            },
            required: ['query'],
        },
        execute: async (args) => {
            const { query, numResults } = SearchSchema.parse(args);
            logger.info(COMPONENT, `Searching: ${query}`);

            // Use DuckDuckGo Lite — no API key, no rate limit for reasonable use
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const res = await fetchWithBrowser(searchUrl, false);

            // The results page content already has the search results as text
            const lines = [
                `🔍 **Search results for: "${query}"**`,
                '',
                res.content.slice(0, 4000),
            ];

            return lines.join('\n');
        },
    });

    // Navigate a page and click/interact (for forms and login flows)
    registerTool({
        name: 'browser_navigate',
        description: 'Navigate a website step-by-step: click buttons, fill forms, interact with pages. Useful for multi-step workflows like submitting forms, navigating pagination, or automating repetitive web tasks.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Starting URL' },
                action: { type: 'string', enum: ['click', 'fill', 'screenshot', 'evaluate'], description: 'Action to perform' },
                selector: { type: 'string', description: 'CSS selector for click/fill actions' },
                value: { type: 'string', description: 'Text to fill into a form field' },
                script: { type: 'string', description: 'JavaScript to evaluate on the page' },
            },
            required: ['url', 'action'],
        },
        execute: async (args: any) => {
            const { url, action, selector, value, script } = args;
            const ctx = await getOrCreateBrowser();
            const page = await ctx.newPage();

            try {
                await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });

                let result = '';
                if (action === 'click' && selector) {
                    await page.click(selector);
                    await page.waitForTimeout(1000);
                    result = `Clicked "${selector}" on ${url}`;
                } else if (action === 'fill' && selector && value) {
                    await page.fill(selector, value);
                    result = `Filled "${selector}" with "${value}"`;
                } else if (action === 'screenshot') {
                    const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
                    result = `Screenshot taken (${buf.length} bytes)`;
                } else if (action === 'evaluate' && script) {
                    const output = await page.evaluate(script);
                    result = `Script result: ${JSON.stringify(output)}`;
                }

                const title = await page.title();
                return `✅ ${result}\nPage: ${title} (${url})`;
            } finally {
                await page.close();
            }
        },
    });

    logger.info(COMPONENT, 'Web browser tools registered (browse_url, web_search, browser_navigate)');
}

/** Gracefully close the browser session on gateway shutdown */
export async function closeBrowser(): Promise<void> {
    if (playwrightBrowser) {
        await playwrightBrowser.close();
        playwrightBrowser = null;
        playwrightContext = null;
    }
}
