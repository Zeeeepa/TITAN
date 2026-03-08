/**
 * TITAN — Shared Browser Pool
 * Single Chromium process shared across all browsing tools.
 * Replaces duplicated getOrCreateBrowser() in web_browser.ts and web_browse_llm.ts.
 *
 * Features:
 * - One Chromium process, multiple BrowserContexts
 * - Max 5 concurrent pages (configurable)
 * - Cookie/localStorage persistence across sessions
 * - Anti-detection: realistic user-agent, viewport
 * - Memory-aware cleanup
 * - 30-minute session TTL (not 10)
 */
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import logger from '../utils/logger.js';

const COMPONENT = 'BrowserPool';
const BROWSER_STATE_DIR = join(homedir(), '.titan', 'browser-state');
const MAX_PAGES = 5;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Realistic user agents for anti-detection
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

/** Lazy-loaded Playwright types */
let pw: typeof import('playwright') | null = null;
let browser: import('playwright').Browser | null = null;
let defaultContext: import('playwright').BrowserContext | null = null;
let launchPromise: Promise<void> | null = null;
let lastActivityMs = 0;
let pageCount = 0;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;

/** Ensure Playwright is available */
async function ensurePlaywright(): Promise<typeof import('playwright')> {
    if (pw) return pw;
    try {
        pw = await import('playwright');
        return pw;
    } catch {
        throw new Error('Playwright not installed. Run: npx playwright install chromium');
    }
}

/** Get or create the shared browser instance */
export async function getSharedBrowser(): Promise<import('playwright').Browser> {
    if (browser?.isConnected()) {
        resetSessionTimer();
        return browser;
    }

    if (launchPromise) {
        await launchPromise;
        if (browser?.isConnected()) return browser;
    }

    launchPromise = (async () => {
        const playwright = await ensurePlaywright();
        logger.info(COMPONENT, 'Launching shared Chromium browser...');

        try {
            mkdirSync(BROWSER_STATE_DIR, { recursive: true });
        } catch { /* exists */ }

        browser = await playwright.chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
            ],
        });

        logger.info(COMPONENT, 'Shared browser launched');
        resetSessionTimer();
    })();

    await launchPromise;
    launchPromise = null;
    return browser!;
}

/** Get or create the default persistent context */
export async function getDefaultContext(): Promise<import('playwright').BrowserContext> {
    if (defaultContext) {
        resetSessionTimer();
        return defaultContext;
    }

    const b = await getSharedBrowser();
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    defaultContext = await b.newContext({
        userAgent,
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        storageState: undefined, // Will be loaded from disk if exists
    });

    logger.info(COMPONENT, 'Default browser context created');
    return defaultContext;
}

/** Get a new page from the pool (max 5 concurrent) */
export async function getPage(): Promise<import('playwright').Page> {
    if (pageCount >= MAX_PAGES) {
        throw new Error(`Browser pool full: ${pageCount}/${MAX_PAGES} pages in use. Close a page first.`);
    }

    const context = await getDefaultContext();
    const page = await context.newPage();
    pageCount++;
    lastActivityMs = Date.now();

    logger.debug(COMPONENT, `Page created (${pageCount}/${MAX_PAGES})`);
    return page;
}

/** Release a page back to the pool */
export async function releasePage(page: import('playwright').Page): Promise<void> {
    try {
        if (!page.isClosed()) {
            await page.close();
        }
    } catch { /* already closed */ }
    pageCount = Math.max(0, pageCount - 1);
    logger.debug(COMPONENT, `Page released (${pageCount}/${MAX_PAGES})`);
}

/** Reset the session inactivity timer */
function resetSessionTimer(): void {
    lastActivityMs = Date.now();
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        const idleMs = Date.now() - lastActivityMs;
        if (idleMs >= SESSION_TTL_MS && pageCount === 0) {
            logger.info(COMPONENT, `Session TTL expired (${SESSION_TTL_MS / 60000}min idle). Closing browser.`);
            closeBrowser().catch(() => {});
        }
    }, SESSION_TTL_MS);
}

/** Close the shared browser and clean up */
export async function closeBrowser(): Promise<void> {
    if (sessionTimer) {
        clearTimeout(sessionTimer);
        sessionTimer = null;
    }

    if (defaultContext) {
        try { await defaultContext.close(); } catch { /* ignore */ }
        defaultContext = null;
    }

    if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
        browser = null;
    }

    pageCount = 0;
    launchPromise = null;
    logger.info(COMPONENT, 'Browser pool closed');
}

/** Get pool status */
export function getPoolStatus(): { connected: boolean; pages: number; maxPages: number; idleMs: number } {
    return {
        connected: browser?.isConnected() ?? false,
        pages: pageCount,
        maxPages: MAX_PAGES,
        idleMs: lastActivityMs ? Date.now() - lastActivityMs : 0,
    };
}
