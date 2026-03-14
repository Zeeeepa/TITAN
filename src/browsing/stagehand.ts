/**
 * TITAN — Stagehand Browser Integration
 * Wraps @browserbasehq/stagehand for natural language browser automation.
 * Provides act(), extract(), observe() with self-healing selectors.
 * Falls back to raw Playwright if Stagehand is unavailable.
 *
 * Stagehand advantages over raw Playwright:
 * - Natural language actions: act("click the submit button") instead of CSS selectors
 * - Self-healing: automatically finds elements even when selectors change
 * - Action caching: repeated actions execute faster
 * - Works with any LLM provider
 */
import { getPage, releasePage } from './browserPool.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Stagehand';

/** Stagehand instance type (lazy-loaded) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- optional dynamic dep
let StagehandClass: any = null;
let stagehandAvailable: boolean | null = null;

/** Check if Stagehand is installed */
async function isStagehandAvailable(): Promise<boolean> {
    if (stagehandAvailable !== null) return stagehandAvailable;
    try {
        const mod = await import('@browserbasehq/stagehand');
        StagehandClass = mod.Stagehand;
        stagehandAvailable = true;
        logger.info(COMPONENT, 'Stagehand SDK loaded successfully');
        return true;
    } catch {
        stagehandAvailable = false;
        logger.info(COMPONENT, 'Stagehand not installed — using raw Playwright fallback');
        return false;
    }
}

/**
 * Execute a natural language action on a web page.
 * Uses Stagehand act() if available, falls back to manual Playwright.
 */
export async function act(
    url: string,
    action: string,
    options?: { timeout?: number },
): Promise<{ success: boolean; content: string; screenshot?: string }> {
    const timeout = options?.timeout || 30000;

    if (await isStagehandAvailable()) {
        return actWithStagehand(url, action, timeout);
    }
    return actWithPlaywright(url, action, timeout);
}

/**
 * Extract structured data from a web page using natural language.
 * Uses Stagehand extract() if available, falls back to Readability.
 */
export async function extract(
    url: string,
    instruction: string,
    options?: { schema?: Record<string, unknown> },
): Promise<{ success: boolean; data: unknown; content: string }> {
    if (await isStagehandAvailable()) {
        return extractWithStagehand(url, instruction, options);
    }
    return extractWithPlaywright(url, instruction);
}

/**
 * Observe a page and return actionable elements.
 * Uses Stagehand observe() if available.
 */
export async function observe(
    url: string,
    instruction?: string,
): Promise<{ success: boolean; elements: Array<{ description: string; selector: string }> }> {
    if (await isStagehandAvailable()) {
        return observeWithStagehand(url, instruction);
    }
    return observeWithPlaywright(url);
}

// ─── Stagehand implementations ─────────────────────────────────────

async function actWithStagehand(
    url: string,
    action: string,
    timeout: number,
): Promise<{ success: boolean; content: string; screenshot?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optional dynamic dep
    let stagehand: any = null;
    try {
        stagehand = new StagehandClass({
            env: 'LOCAL',
            headless: true,
            enableCaching: true,
            verbose: 0,
        });
        await stagehand.init();
        await stagehand.page.goto(url, { waitUntil: 'domcontentloaded', timeout });

        await stagehand.act({ action });
        const content = await stagehand.page.content();
        const title = await stagehand.page.title();

        logger.info(COMPONENT, `act() completed: "${action}" on ${url}`);
        return {
            success: true,
            content: `Page: ${title}\nAction "${action}" completed successfully.\n\nPage content excerpt: ${content.slice(0, 2000)}`,
        };
    } catch (err) {
        logger.warn(COMPONENT, `Stagehand act() failed: ${(err as Error).message}, falling back to Playwright`);
        return actWithPlaywright(url, action, timeout);
    } finally {
        try { await stagehand?.close(); } catch { /* ignore */ }
    }
}

async function extractWithStagehand(
    url: string,
    instruction: string,
    options?: { schema?: Record<string, unknown> },
): Promise<{ success: boolean; data: unknown; content: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optional dynamic dep
    let stagehand: any = null;
    try {
        stagehand = new StagehandClass({
            env: 'LOCAL',
            headless: true,
            enableCaching: true,
            verbose: 0,
        });
        await stagehand.init();
        await stagehand.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const extractArgs: Record<string, unknown> = { instruction };
        if (options?.schema) extractArgs.schema = options.schema;

        const data = await stagehand.extract(extractArgs);

        logger.info(COMPONENT, `extract() completed: "${instruction}" on ${url}`);
        return {
            success: true,
            data,
            content: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        };
    } catch (err) {
        logger.warn(COMPONENT, `Stagehand extract() failed: ${(err as Error).message}, falling back`);
        return extractWithPlaywright(url, instruction);
    } finally {
        try { await stagehand?.close(); } catch { /* ignore */ }
    }
}

async function observeWithStagehand(
    url: string,
    instruction?: string,
): Promise<{ success: boolean; elements: Array<{ description: string; selector: string }> }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optional dynamic dep
    let stagehand: any = null;
    try {
        stagehand = new StagehandClass({
            env: 'LOCAL',
            headless: true,
            enableCaching: true,
            verbose: 0,
        });
        await stagehand.init();
        await stagehand.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const observations = await stagehand.observe(instruction ? { instruction } : undefined);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optional dynamic dep
        const elements = (observations || []).map((obs: any) => ({
            description: obs.description || obs.text || '',
            selector: obs.selector || '',
        }));

        logger.info(COMPONENT, `observe() found ${elements.length} elements on ${url}`);
        return { success: true, elements };
    } catch (err) {
        logger.warn(COMPONENT, `Stagehand observe() failed: ${(err as Error).message}`);
        return observeWithPlaywright(url);
    } finally {
        try { await stagehand?.close(); } catch { /* ignore */ }
    }
}

// ─── Playwright fallback implementations ─────────────────────────────

async function actWithPlaywright(
    url: string,
    action: string,
    timeout: number,
): Promise<{ success: boolean; content: string; screenshot?: string }> {
    const page = await getPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

        // Basic action parsing for common patterns
        const lower = action.toLowerCase();
        if (lower.includes('click') || lower.includes('press')) {
            const textMatch = action.match(/['"](.*?)['"]/);
            if (textMatch) {
                await page.getByText(textMatch[1], { exact: false }).first().click({ timeout: 10000 });
            }
        } else if (lower.includes('type') || lower.includes('fill') || lower.includes('enter')) {
            const parts = action.match(/['"](.*?)['"].*['"](.*?)['"]/);
            if (parts) {
                await page.getByPlaceholder(parts[1]).first().fill(parts[2]);
            }
        } else if (lower.includes('search')) {
            const query = action.match(/['"](.*?)['"]/)?.[1] || action.split('search')[1]?.trim() || '';
            const searchInput = page.locator('input[type="search"], input[name="q"], input[type="text"]').first();
            await searchInput.fill(query);
            await searchInput.press('Enter');
            await page.waitForLoadState('domcontentloaded');
        }

        const title = await page.title();
        const text = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) || '');

        return {
            success: true,
            content: `Page: ${title}\nAction attempted: "${action}"\n\n${text}`,
        };
    } catch (err) {
        return {
            success: false,
            content: `Playwright fallback failed: ${(err as Error).message}`,
        };
    } finally {
        await releasePage(page);
    }
}

async function extractWithPlaywright(
    url: string,
    _instruction: string,
): Promise<{ success: boolean; data: unknown; content: string }> {
    const page = await getPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        const text = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');

        return {
            success: true,
            data: { title, text },
            content: `# ${title}\n\n${text}`,
        };
    } catch (err) {
        return {
            success: false,
            data: null,
            content: `Extraction failed: ${(err as Error).message}`,
        };
    } finally {
        await releasePage(page);
    }
}

async function observeWithPlaywright(
    url: string,
): Promise<{ success: boolean; elements: Array<{ description: string; selector: string }> }> {
    const page = await getPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const elements = await page.evaluate(() => {
            const interactable = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]');
            return Array.from(interactable).slice(0, 50).map((el, i) => ({
                description: (el as HTMLElement).innerText?.slice(0, 100) || el.getAttribute('aria-label') || el.tagName,
                selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
            }));
        });

        return { success: true, elements };
    } catch {
        return { success: false, elements: [] };
    } finally {
        await releasePage(page);
    }
}
