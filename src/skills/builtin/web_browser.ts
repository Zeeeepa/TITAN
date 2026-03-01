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
import { TITAN_VERSION } from '../../utils/constants.js';

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
let launchPromise: Promise<any> | null = null;

async function doLaunchBrowser(): Promise<any> {
    let chromium: any;
    try {
        const pw = await import('playwright' as any);
        chromium = pw.chromium;
    } catch {
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

async function getOrCreateBrowser(): Promise<any> {
    if (playwrightBrowser && playwrightBrowser.isConnected()) {
        return playwrightContext;
    }
    // Singleton launch — prevents thundering herd (concurrent requests launching multiple browsers)
    if (!launchPromise) {
        launchPromise = doLaunchBrowser().finally(() => { launchPromise = null; });
    }
    return launchPromise;
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
            headers: { 'User-Agent': `Mozilla/5.0 TITAN-Agent/${TITAN_VERSION}` },
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
        name: 'browser_search',
        description: 'Search the internet for current information using a real browser. Returns real search results with titles, URLs, and snippets. Works without any API key — truly set and forget.',
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

    // Ultra-Fast Bulk Web Navigation
    registerTool({
        name: 'browser_auto_nav',
        description: 'Navigate a website blazingly fast by executing a bulk sequence of actions (click, fill) in a single tool call, and then returning a Smart Extract DOM of the resulting page. Use this for instant form submissions, logins, and pagination.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Starting URL (if you are already on the page, just provide the current URL)' },
                actions: {
                    type: 'array',
                    description: 'Sequential array of actions to perform at near-instant machine speed.',
                    items: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['click', 'fill', 'wait', 'evaluate'], description: 'Action to perform' },
                            selector: { type: 'string', description: 'CSS selector (e.g. #login-btn, input[name="user"])' },
                            value: { type: 'string', description: 'Text to fill if action is "fill"' },
                            delayMs: { type: 'number', description: 'Milliseconds to wait if action is "wait"' },
                            script: { type: 'string', description: 'JavaScript to run if action is "evaluate"' }
                        },
                        required: ['action']
                    }
                },
                returnType: { type: 'string', enum: ['text', 'smart_dom', 'screenshot'], description: 'What to return after the actions finish: raw text, a mapping of interactive elements, or a base64 screenshot. Default: smart_dom', default: 'smart_dom' }
            },
            required: ['url', 'actions'],
        },
        execute: async (args: any) => {
            const { url, actions, returnType = 'smart_dom' } = args;
            const ctx = await getOrCreateBrowser();
            const page = await ctx.newPage();

            try {
                // Check if we are already on this URL (saves navigation time)
                if (page.url() !== url && url !== 'current') {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                }

                const results: string[] = [];
                for (const step of actions) {
                    try {
                        if (step.action === 'click' && step.selector) {
                            await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
                            await page.click(step.selector);
                            results.push(`✅ Clicked: ${step.selector}`);
                        } else if (step.action === 'fill' && step.selector && step.value !== undefined) {
                            await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
                            await page.fill(step.selector, step.value);
                            results.push(`✅ Filled: ${step.selector} -> *****`);
                        } else if (step.action === 'wait' && step.delayMs) {
                            await page.waitForTimeout(step.delayMs);
                            results.push(`✅ Waited: ${step.delayMs}ms`);
                        } else if (step.action === 'evaluate' && step.script) {
                            await page.evaluate(step.script);
                            results.push(`✅ Evaluated custom script`);
                        }
                    } catch (e: any) {
                        results.push(`❌ Failed Step: ${step.action} on ${step.selector} - ${e.message.split('\\n')[0]}`);
                        break; // Stop execution on first failure to prevent chaos
                    }
                }

                // Wait a moment for dynamic page updates after the last action
                await page.waitForTimeout(1000);

                const title = await page.title();
                const finalUrl = page.url();

                let output = `Workflow Results:\n${results.join('\\n')}\n\nFinal URL: ${finalUrl} (Title: ${title})\n\n`;

                if (returnType === 'smart_dom') {
                    const domMap = await page.evaluate(() => {
                        const win = globalThis as any;
                        const elements: { tag: string, id: string, name: string, cls: string, text: string, type?: string }[] = [];
                        const interactive = win.document.querySelectorAll('button, a[href], input, select, textarea');
                        interactive.forEach((el: any) => {
                            const bounds = el.getBoundingClientRect();
                            if (bounds.width === 0 || bounds.height === 0) return; // Skip invisible elements

                            elements.push({
                                tag: el.tagName.toLowerCase(),
                                id: el.id,
                                name: (el as any).name || '',
                                cls: el.className.toString(),
                                text: (el as any).innerText?.slice(0, 50) || (el as any).value?.slice(0, 50) || '',
                                type: (el as any).type || ''
                            });
                        });
                        return elements;
                    });

                    let domString = "--- Smart DOM Map (Interactive Elements) ---\n";
                    domMap.slice(0, 100).forEach((e: any) => {
                        let sel = e.tag;
                        if (e.id) sel += `#${e.id}`;
                        else if (e.name) sel += `[name="${e.name}"]`;
                        else if (e.cls) sel += `.${e.cls.split(' ')[0]}`;

                        domString += `[${sel}] `;
                        if (e.tag === 'input' || e.tag === 'textarea') domString += `type="${e.type}" `;
                        if (e.text) domString += `-> "${e.text.trim()}"`;
                        domString += '\n';
                    });
                    output += domString;
                } else if (returnType === 'text') {
                    output += "--- Page Text ---\n";
                    const bodyText = await page.evaluate(() => (globalThis as any).document.body?.innerText?.slice(0, 8000) ?? '');
                    output += bodyText;
                } else if (returnType === 'screenshot') {
                    const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
                    output += `--- Screenshot attached: ${buf.length} bytes ---\n`;
                    // In a real multi-modal environment we'd attach the buffer, returning string for now.
                }

                return output;
            } finally {
                await page.close();
            }
        },
    });

    logger.info(COMPONENT, 'Web browser tools registered (browse_url, browser_search, browser_auto_nav)');
}

/** Gracefully close the browser session on gateway shutdown */
export async function closeBrowser(): Promise<void> {
    if (playwrightBrowser) {
        await playwrightBrowser.close();
        playwrightBrowser = null;
        playwrightContext = null;
    }
}
