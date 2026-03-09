/**
 * TITAN — Local-LLM-Friendly Web Browsing
 * Two tools that make browsing work with text-only local LLMs (no vision needed).
 *
 * web_read  — Fetch URL → Readability → Turndown → clean markdown
 * web_act   — Interactive step-by-step browser with numbered elements
 */
import { registerSkill } from '../registry.js';
import logger from '../../utils/logger.js';
import { getPage, releasePage } from '../../browsing/browserPool.js';

const COMPONENT = 'WebBrowseLLM';

// ─── Shared Playwright types (same as web_browser.ts) ────────────
interface PwLocator { first(): PwLocator; waitFor(opts: unknown): Promise<unknown> }
interface PwPage {
    goto(url: string, opts?: unknown): Promise<unknown>;
    title(): Promise<string>;
    evaluate(fn: unknown, ...args: unknown[]): Promise<unknown>;
    content(): Promise<string>;
    close(): Promise<void>;
    url(): string;
    click(sel: string, opts?: unknown): Promise<void>;
    fill(sel: string, val: string): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    locator(sel: string): PwLocator;
    focus(sel: string): Promise<void>;
    keyboard: { press(key: string): Promise<void> };
    goBack(opts?: unknown): Promise<unknown>;
    mouse: { wheel(dx: number, dy: number): Promise<void> };
    $eval(sel: string, fn: (el: unknown) => unknown): Promise<unknown>;
}

// ─── Token estimation (rough: 1 token ≈ 4 chars) ─────────────────
function truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[... truncated]';
}

// ─── web_read: URL → Readability → Turndown → Markdown ───────────

async function webRead(url: string, maxTokens: number): Promise<string> {
    let html: string;
    let finalUrl = url;

    // Try fast fetch first
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 TITAN-Agent/1.0' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
        finalUrl = res.url || url;

        // Heuristic: if almost no text, page needs JS rendering
        const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (stripped.length < 200) throw new Error('needs JS');
    } catch {
        // Fallback to Playwright for JS-heavy pages
        logger.info(COMPONENT, `Using Playwright for: ${url}`);
        const page = await getPage() as unknown as PwPage;
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
            html = await page.content();
            finalUrl = page.url();
        } finally {
            await releasePage(page as unknown as Parameters<typeof releasePage>[0]);
        }
    }

    // Parse with Readability + Turndown
    let title = '';
    let markdown = '';

    try {
        const { JSDOM } = await import('jsdom' as string);
        const dom = new JSDOM(html, { url: finalUrl });
        const doc = dom.window.document;

        // Try Readability first
        const { Readability } = await import('@mozilla/readability' as string);
        const article = new Readability(doc).parse();

        if (article && article.content) {
            title = article.title || '';
            const TurndownService = (await import('turndown' as string)).default || (await import('turndown' as string));
            const td = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
            });
            // Strip images (text-only LLMs can't use them)
            td.addRule('strip-images', {
                filter: 'img',
                replacement: () => '',
            });
            // Simplify tables to text
            td.addRule('simple-tables', {
                filter: 'table',
                replacement: (_content: string, node: unknown) => {
                    const el = node as { textContent?: string };
                    return '\n' + (el.textContent || '').replace(/\s+/g, ' ').trim() + '\n';
                },
            });
            markdown = td.turndown(article.content);
        } else {
            // Fallback: grab main/article/body
            title = doc.title || '';
            const main = doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.body;
            if (main) {
                const TurndownService = (await import('turndown' as string)).default || (await import('turndown' as string));
                const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
                td.addRule('strip-images', { filter: 'img', replacement: () => '' });
                markdown = td.turndown(main.innerHTML || main.textContent || '');
            }
        }
    } catch (e) {
        // If Readability/Turndown unavailable, fall back to basic text extraction
        logger.warn(COMPONENT, `Readability/Turndown failed: ${(e as Error).message}`);
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = titleMatch?.[1]?.trim() || '';
        markdown = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{3,}/g, '\n\n')
            .trim();
    }

    // Build output
    const header = `# ${title || 'Untitled'}\nSource: ${finalUrl}\n\n`;
    return header + truncateToTokens(markdown, maxTokens);
}

// ─── web_act: Interactive browser with numbered elements ──────────

interface WebActSession {
    page: PwPage;
    lastUsed: number;
    elements: Map<number, string>; // id -> CSS selector
}

const sessions: Map<string, WebActSession> = new Map();
const SESSION_TTL = 10 * 60 * 1000; // 10 min

// Cleanup stale sessions every 5 min
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.lastUsed > SESSION_TTL) {
            session.page.close().catch(() => {});
            sessions.delete(id);
            logger.debug(COMPONENT, `Cleaned up stale web_act session: ${id}`);
        }
    }
}, 5 * 60 * 1000).unref();

async function getOrCreateSession(sessionId: string): Promise<WebActSession> {
    let session = sessions.get(sessionId);
    if (session) {
        session.lastUsed = Date.now();
        return session;
    }

    const page = await getPage() as unknown as PwPage;
    session = {
        page,
        lastUsed: Date.now(),
        elements: new Map(),
    };
    sessions.set(sessionId, session);
    return session;
}

/** Build a numbered snapshot of interactive elements on the page */
async function buildSnapshot(session: WebActSession): Promise<string> {
    const page = session.page;
    const title = await page.title();
    const url = page.url();

    // Inject data-titan-id attributes and collect element info
    const elements = await page.evaluate(() => {
        const results: Array<{
            id: number;
            role: string;
            name: string;
            value: string;
            href: string;
            tagName: string;
            type: string;
            checked: boolean;
            disabled: boolean;
        }> = [];

        const selector = [
            'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
            '[role="button"]', '[role="link"]', '[role="tab"]', '[role="checkbox"]',
            '[role="menuitem"]', '[contenteditable="true"]',
        ].join(', ');

        const els = document.querySelectorAll(selector);
        let nextId = 1;

        for (const el of els) {
            if (nextId > 80) break;

            const rect = el.getBoundingClientRect();
            // Skip invisible elements
            if (rect.width === 0 || rect.height === 0) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            // Skip elements way off screen (>3 viewports below)
            if (rect.top > window.innerHeight * 3) continue;

            const htmlEl = el as HTMLElement;
            const inputEl = el as HTMLInputElement;
            const anchorEl = el as HTMLAnchorElement;

            // Set data attribute for later targeting
            htmlEl.setAttribute('data-titan-id', String(nextId));

            // Determine role
            let role = el.getAttribute('role') || el.tagName.toLowerCase();
            if (role === 'a') role = 'link';
            if (role === 'input') {
                const t = inputEl.type || 'text';
                if (t === 'submit' || t === 'button') role = 'button';
                else if (t === 'checkbox') role = 'checkbox';
                else if (t === 'radio') role = 'radio';
                else role = 'textbox';
            }
            if (role === 'textarea') role = 'textbox';
            if (role === 'select') role = 'combobox';

            // Determine accessible name
            let name =
                el.getAttribute('aria-label') ||
                (el as HTMLElement).innerText?.trim() ||
                inputEl.placeholder ||
                inputEl.name ||
                el.getAttribute('title') ||
                '';
            name = name.slice(0, 60).replace(/\n/g, ' ').trim();

            results.push({
                id: nextId,
                role,
                name,
                value: inputEl.value || '',
                href: anchorEl.href || '',
                tagName: el.tagName.toLowerCase(),
                type: inputEl.type || '',
                checked: inputEl.checked || false,
                disabled: inputEl.disabled || false,
            });
            nextId++;
        }
        return results;
    }) as Array<{
        id: number; role: string; name: string; value: string;
        href: string; tagName: string; type: string; checked: boolean; disabled: boolean;
    }>;

    // Update session element map
    session.elements.clear();
    for (const el of elements) {
        session.elements.set(el.id, `[data-titan-id="${el.id}"]`);
    }

    // Build text output
    const lines: string[] = [];
    lines.push(`Page: "${title}" (${url})`);
    lines.push(`Session: ${[...sessions.entries()].find(([, s]) => s === session)?.[0] || '__default__'}`);
    lines.push('');

    for (const el of elements) {
        let line = `[${el.id}] ${el.role}`;
        if (el.name) line += ` "${el.name}"`;
        if (el.value) line += ` value="${el.value}"`;
        if (el.href && el.role === 'link') line += ` -> ${el.href}`;
        if (el.checked) line += ' [checked]';
        if (el.disabled) line += ' [disabled]';
        lines.push(line);
    }

    // Add condensed page text
    const pageText = await page.evaluate(() => {
        const main = document.querySelector('main') || document.querySelector('article') ||
            document.querySelector('[role="main"]') || document.body;
        return main?.innerText?.slice(0, 2000) || '';
    }) as string;

    if (pageText.trim()) {
        lines.push('');
        lines.push('--- Page content ---');
        lines.push(truncateToTokens(pageText.trim(), 500));
    }

    return lines.join('\n');
}

/** Parse and execute a web_act action */
async function executeAction(session: WebActSession, action: string): Promise<string> {
    const page = session.page;
    const parts = action.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    try {
        switch (cmd) {
            case 'open': {
                let url = parts[1];
                if (!url) return 'Error: open requires a URL. Usage: open <url>';
                // Auto-prefix protocol if missing
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                await page.waitForTimeout(1000);
                return buildSnapshot(session);
            }
            case 'click': {
                const n = parseInt(parts[1]);
                const sel = session.elements.get(n);
                if (!sel) return `Error: element [${n}] not found. Run snapshot to refresh.`;
                await page.click(sel, { timeout: 5000 });
                await page.waitForTimeout(1000);
                return buildSnapshot(session);
            }
            case 'type': {
                const n = parseInt(parts[1]);
                const text = parts.slice(2).join(' ');
                const sel = session.elements.get(n);
                if (!sel) return `Error: element [${n}] not found.`;
                if (!text) return 'Error: type requires text. Usage: type <n> <text>';
                await page.fill(sel, text);
                return buildSnapshot(session);
            }
            case 'press': {
                const n = parseInt(parts[1]);
                const key = parts[2];
                const sel = session.elements.get(n);
                if (!sel) return `Error: element [${n}] not found.`;
                if (!key) return 'Error: press requires a key. Usage: press <n> <key>';
                await page.focus(sel);
                await page.keyboard.press(key);
                await page.waitForTimeout(1000);
                return buildSnapshot(session);
            }
            case 'select': {
                const n = parseInt(parts[1]);
                const value = parts.slice(2).join(' ');
                const sel = session.elements.get(n);
                if (!sel) return `Error: element [${n}] not found.`;
                await page.evaluate((selector: string, val: string) => {
                    const el = document.querySelector(selector) as HTMLSelectElement;
                    if (!el) return;
                    for (const opt of el.options) {
                        if (opt.text.trim().toLowerCase().includes(val.toLowerCase()) || opt.value === val) {
                            el.value = opt.value;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                        }
                    }
                }, sel, value);
                return buildSnapshot(session);
            }
            case 'scroll': {
                const dir = parts[1]?.toLowerCase();
                const amount = dir === 'up' ? -600 : 600;
                await page.mouse.wheel(0, amount);
                await page.waitForTimeout(500);
                return buildSnapshot(session);
            }
            case 'back': {
                await page.goBack({ timeout: 10_000 });
                await page.waitForTimeout(1000);
                return buildSnapshot(session);
            }
            case 'snapshot': {
                return buildSnapshot(session);
            }
            case 'text': {
                const fullText = await page.evaluate(() => {
                    const main = document.querySelector('main') || document.querySelector('article') ||
                        document.querySelector('[role="main"]') || document.body;
                    return main?.innerText || '';
                }) as string;
                return truncateToTokens(fullText, 3000);
            }
            default:
                return `Unknown action: "${cmd}". Available: open, click, type, press, select, scroll, back, snapshot, text`;
        }
    } catch (e) {
        const msg = (e as Error).message?.split('\n')[0] || 'Unknown error';
        logger.warn(COMPONENT, `web_act action "${action}" failed: ${msg}`);
        return `Error: ${msg}\n\nTry "snapshot" to refresh the page state.`;
    }
}

// ─── Register tools ───────────────────────────────────────────────

export function registerWebBrowseLlmSkill(): void {
    // web_read
    registerSkill({
        name: 'web_read',
        description: 'Read a webpage as clean markdown. Uses Readability + Turndown. Works with text-only LLMs.',
        version: '1.0.0',
        source: 'bundled',
        enabled: true,
    }, {
        name: 'web_read',
        description: 'Read a webpage and return its content as clean, structured markdown. Strips ads, navigation, scripts — just the article content with headings, links, lists, and code blocks preserved. Perfect for reading articles, documentation, news, and reference pages. Works great with local text-only LLMs.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The URL to read' },
                maxTokens: { type: 'number', description: 'Maximum tokens in the response (default: 5000)', default: 5000 },
            },
            required: ['url'],
        },
        execute: async (args) => {
            const url = args.url as string;
            if (!url) return 'Error: url is required.';
            const maxTokens = Math.max(100, (args.maxTokens as number) || 5000);
            logger.info(COMPONENT, `web_read: ${url}`);
            try {
                return await webRead(url, maxTokens);
            } catch (e) {
                const msg = (e as Error).message?.split('\n')[0] || 'Unknown error';
                logger.warn(COMPONENT, `web_read failed for ${url}: ${msg}`);
                return `Error reading ${url}: ${msg}`;
            }
        },
    });

    // web_act
    registerSkill({
        name: 'web_act',
        description: 'Interactive step-by-step browser. Returns numbered elements for text-only LLM interaction.',
        version: '1.0.0',
        source: 'bundled',
        enabled: true,
    }, {
        name: 'web_act',
        description: 'Interactive step-by-step browser for text-only LLMs. Returns a numbered list of interactive elements on the page. Use actions like "open <url>", "click <n>", "type <n> <text>", "press <n> Enter", "select <n> <value>", "scroll up|down", "back", "snapshot", "text" to interact. Maintains persistent sessions.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', description: 'Action to perform: "open <url>", "click <n>", "type <n> <text>", "press <n> <key>", "select <n> <value>", "scroll up|down", "back", "snapshot", "text"' },
                sessionId: { type: 'string', description: 'Session ID for persistent browsing (optional, auto-created if not provided)' },
            },
            required: ['action'],
        },
        execute: async (args) => {
            const action = args.action as string;
            const sessionId = (args.sessionId as string) || '__default__';
            logger.info(COMPONENT, `web_act [${sessionId}]: ${action}`);

            const session = await getOrCreateSession(sessionId);

            // If this is the first action and it's not "open", return helpful error
            if (session.page.url() === 'about:blank' && !action.trim().toLowerCase().startsWith('open')) {
                return 'No page loaded. Start with: open <url>';
            }

            return executeAction(session, action);
        },
    });

    logger.info(COMPONENT, 'Registered web_read + web_act (LLM-friendly browsing)');
}
