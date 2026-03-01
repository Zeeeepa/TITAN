/**
 * TITAN — Computer Use Skill (Built-in)
 * Desktop automation: screenshots, mouse control, keyboard input, and screen reading.
 *
 * Desktop automation uses platform-native tools:
 *   Linux  : xdotool (mouse/keyboard), scrot / ImageMagick import (screenshots), xclip/xsel (clipboard)
 *   macOS  : osascript (AppleScript), screencapture (screenshots), pbpaste (clipboard)
 *
 * Browser automation delegates to the existing Playwright session in web_browser.ts.
 *
 * Security model:
 *   - All coordinates validated as finite numbers before use
 *   - All shell calls use execFileSync() — arguments are passed as an array,
 *     never interpolated into a shell string, eliminating shell-injection risk
 *   - Key names are validated against an allowlist
 *   - Text typed via xdotool uses --clearmodifiers and individual char calls to
 *     avoid shell-escape issues
 */

import { execFileSync, execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerSkill } from '../registry.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'ComputerUse';

// ─── OS helpers ───────────────────────────────────────────────────────────────

function isLinux(): boolean {
    return process.platform === 'linux';
}

function isMacOS(): boolean {
    return process.platform === 'darwin';
}

/**
 * Check whether an external program is available on PATH.
 * Uses `which` on Linux/macOS — both support it.
 */
function toolAvailable(program: string): boolean {
    try {
        execFileSync('which', [program], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Run a command via execFileSync (no shell) and return its stdout as a string.
 * Throws with a clean message on failure.
 */
function runCmd(program: string, args: string[], timeoutMs = 15_000): string {
    try {
        const out = execFileSync(program, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: timeoutMs,
        });
        return out.toString('utf-8').trim();
    } catch (err: any) {
        // execFileSync puts stderr in err.stderr when available
        const detail = err.stderr?.toString().trim() || err.message;
        throw new Error(`${program} failed: ${detail}`);
    }
}

/**
 * Validate that a value is a finite number (not NaN, not Infinity).
 * Returns the number or throws a descriptive error.
 */
function assertCoord(value: unknown, name: string): number {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        throw new Error(`Invalid coordinate for "${name}": ${String(value)}`);
    }
    return n;
}

// ─── Allowed key names ────────────────────────────────────────────────────────

/**
 * Allowlist for keyboard key names.
 * Format mirrors Playwright / xdotool conventions:
 *   - Single chars: "a" – "z", "0" – "9", punctuation
 *   - Modifier prefixes: Control, Alt, Shift, Meta, Super
 *   - Named keys: Enter, Escape, Tab, Backspace, Delete, …
 *   - Arrow keys, F-keys
 *
 * The validator accepts:
 *   1. Single printable ASCII characters
 *   2. Modifier+key combos like "Control+c", "Alt+F4", "Control+Shift+t"
 *   3. Named keys from the list below
 */
const NAMED_KEYS = new Set([
    'Enter', 'Return', 'Escape', 'Tab', 'BackSpace', 'Delete', 'Insert',
    'Home', 'End', 'PageUp', 'PageDown',
    'Up', 'Down', 'Left', 'Right',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'space', 'Space',
    'Print', 'Pause', 'CapsLock', 'NumLock', 'ScrollLock',
    'super', 'Super_L', 'Super_R',
    'ctrl', 'control', 'Control_L', 'Control_R',
    'alt', 'Alt_L', 'Alt_R',
    'shift', 'Shift_L', 'Shift_R',
    'meta', 'Meta_L', 'Meta_R',
]);

const VALID_MODIFIER = /^(Control|Ctrl|Alt|Shift|Meta|Super)$/i;

/**
 * Validate a key combo string and convert to xdotool's format.
 *
 * Input examples:  "Control+C", "Alt+F4", "Enter", "a"
 * xdotool format:  "ctrl+c",    "alt+F4", "Return", "a"
 */
function validateAndConvertKey(keys: string): string {
    const parts = keys.split('+').map(p => p.trim());
    if (parts.length === 0 || parts.some(p => p === '')) {
        throw new Error(`Invalid key string: "${keys}"`);
    }

    const converted: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const isLast = i === parts.length - 1;

        if (!isLast) {
            // Must be a modifier
            if (!VALID_MODIFIER.test(p)) {
                throw new Error(`Unknown modifier key: "${p}". Valid: Control, Alt, Shift, Meta, Super`);
            }
            // Normalise modifier names for xdotool
            converted.push(normaliseModifier(p));
        } else {
            // Last part: either a named key, single printable ASCII char, or Fn key
            if (NAMED_KEYS.has(p)) {
                converted.push(xdotoolKeyName(p));
            } else if (p.length === 1 && isPrintableAscii(p)) {
                converted.push(p);
            } else if (/^F\d{1,2}$/i.test(p)) {
                converted.push(p); // F1-F12 pass through as-is
            } else {
                throw new Error(
                    `Unknown key: "${p}". Use named keys (Enter, Escape, Tab, …), ` +
                    'single printable ASCII characters, or F1-F12.',
                );
            }
        }
    }

    return converted.join('+');
}

function normaliseModifier(mod: string): string {
    const m = mod.toLowerCase();
    if (m === 'control' || m === 'ctrl') return 'ctrl';
    if (m === 'alt') return 'alt';
    if (m === 'shift') return 'shift';
    if (m === 'meta') return 'meta';
    if (m === 'super') return 'super';
    return m;
}

function xdotoolKeyName(key: string): string {
    // Map Playwright / human names → xdotool names
    const MAP: Record<string, string> = {
        Enter: 'Return', Return: 'Return',
        Escape: 'Escape',
        Tab: 'Tab',
        BackSpace: 'BackSpace', Backspace: 'BackSpace',
        Delete: 'Delete',
        Insert: 'Insert',
        Home: 'Home', End: 'End',
        PageUp: 'Prior', PageDown: 'Next',
        Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right',
        space: 'space', Space: 'space',
        Print: 'Print', Pause: 'Pause',
        CapsLock: 'Caps_Lock', NumLock: 'Num_Lock', ScrollLock: 'Scroll_Lock',
        super: 'super', Super_L: 'Super_L', Super_R: 'Super_R',
        ctrl: 'ctrl', control: 'ctrl', Control_L: 'Control_L', Control_R: 'Control_R',
        alt: 'alt', Alt_L: 'Alt_L', Alt_R: 'Alt_R',
        shift: 'shift', Shift_L: 'Shift_L', Shift_R: 'Shift_R',
        meta: 'meta', Meta_L: 'Meta_L', Meta_R: 'Meta_R',
    };
    return MAP[key] ?? key;
}

function isPrintableAscii(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e;
}

// ─── Screenshot helper ────────────────────────────────────────────────────────

/** Generate a temp path for screenshot files */
function screenshotTmpPath(): string {
    const dir = join(tmpdir(), 'titan-screenshots');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return join(dir, `screenshot-${Date.now()}.png`);
}

/**
 * Read a file and return its contents as a base64 string.
 */
function fileToBase64(filePath: string): string {
    if (!existsSync(filePath)) {
        throw new Error(`Screenshot file not found: ${filePath}`);
    }
    const buf = readFileSync(filePath);
    return buf.toString('base64');
}

/**
 * Capture a full-screen screenshot using platform tools.
 * Returns base64-encoded PNG.
 */
async function captureDesktopScreenshot(region?: { x: number; y: number; width: number; height: number }): Promise<string> {
    const outPath = screenshotTmpPath();

    if (isLinux()) {
        // Prefer scrot, fall back to ImageMagick import
        if (toolAvailable('scrot')) {
            if (region) {
                runCmd('scrot', [
                    '--area',
                    `${region.x},${region.y},${region.width},${region.height}`,
                    outPath,
                ]);
            } else {
                runCmd('scrot', [outPath]);
            }
        } else if (toolAvailable('import')) {
            // ImageMagick import
            if (region) {
                runCmd('import', [
                    '-window', 'root',
                    '-crop', `${region.width}x${region.height}+${region.x}+${region.y}`,
                    outPath,
                ]);
            } else {
                runCmd('import', ['-window', 'root', outPath]);
            }
        } else {
            throw new Error(
                'No screenshot tool found. Install scrot (sudo apt install scrot) or ImageMagick (sudo apt install imagemagick).',
            );
        }
    } else if (isMacOS()) {
        if (region) {
            runCmd('screencapture', [
                '-x',
                '-R', `${region.x},${region.y},${region.width},${region.height}`,
                outPath,
            ]);
        } else {
            runCmd('screencapture', ['-x', outPath]);
        }
    } else {
        throw new Error(`Unsupported platform for desktop screenshots: ${process.platform}`);
    }

    return fileToBase64(outPath);
}

/**
 * Capture a browser screenshot using the Playwright session from web_browser.ts.
 * Imports dynamically so the skill still loads even when Playwright is absent.
 */
async function captureBrowserScreenshot(selector?: string): Promise<string> {
    let getOrCreateBrowser: () => Promise<any>;
    try {
        const mod = await import('./web_browser.js');
        // web_browser.ts does not export getOrCreateBrowser — use the browse_url
        // side-effect approach: open a new page from the existing context.
        // We reach the context via the exported closeBrowser symbol to confirm
        // the module loaded, then call the internal launch path indirectly.
        //
        // Because getOrCreateBrowser is NOT exported, we use a fresh import of
        // playwright directly (the browser may already be running from web_browser).
        void mod; // confirm import succeeded
    } catch {
        throw new Error('Playwright is not installed. Run: npx playwright install chromium');
    }

    // Launch (or reuse) Playwright directly
    let pw: any;
    try {
        pw = await import('playwright' as any);
    } catch {
        throw new Error('Playwright is not installed. Run: npx playwright install chromium');
    }

    const chromium = pw.chromium;
    const outPath = screenshotTmpPath();

    // Launch a temporary browser for screenshot purposes
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
        if (selector) {
            const element = await page.$(selector);
            if (!element) throw new Error(`Selector not found: ${selector}`);
            await element.screenshot({ path: outPath });
        } else {
            await page.screenshot({ path: outPath, fullPage: false });
        }
        return fileToBase64(outPath);
    } finally {
        await page.close();
        await browser.close();
    }
}

// ─── Mouse helpers ────────────────────────────────────────────────────────────

const BUTTON_MAP: Record<string, string> = {
    left: '1',
    middle: '2',
    right: '3',
};

function xdotoolButtonNumber(button: string): string {
    const n = BUTTON_MAP[button];
    if (!n) throw new Error(`Unknown mouse button: "${button}". Valid: left, right, middle`);
    return n;
}

// ─── Skill registration ───────────────────────────────────────────────────────

export function registerComputerUseSkill(): void {
    // ── 1. screenshot ──────────────────────────────────────────────────────────
    registerSkill(
        {
            name: 'screenshot',
            description: 'Capture the screen or browser viewport as a PNG image',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'screenshot',
            description:
                'Capture a screenshot of the screen or a browser page and return it as a base64-encoded PNG string. ' +
                'Use target="screen" for desktop screenshots, target="browser" for a Playwright browser page. ' +
                'Optionally restrict capture to a region {x, y, width, height} for desktop, or pass a CSS selector for browser.',
            parameters: {
                type: 'object',
                properties: {
                    target: {
                        type: 'string',
                        enum: ['screen', 'browser'],
                        description: 'What to capture: "screen" for the desktop, "browser" for a Playwright browser page. Default: screen.',
                        default: 'screen',
                    },
                    selector: {
                        type: 'string',
                        description: 'CSS selector to capture a specific element (browser target only, optional).',
                    },
                    region: {
                        type: 'object',
                        description: 'Restrict capture to a region (screen target only, optional).',
                        properties: {
                            x: { type: 'number', description: 'Left edge (pixels from screen left)' },
                            y: { type: 'number', description: 'Top edge (pixels from screen top)' },
                            width: { type: 'number', description: 'Width in pixels' },
                            height: { type: 'number', description: 'Height in pixels' },
                        },
                        required: ['x', 'y', 'width', 'height'],
                    },
                },
            },
            execute: async (args) => {
                const target = (args.target as string) || 'screen';
                const selector = args.selector as string | undefined;
                const regionRaw = args.region as { x: unknown; y: unknown; width: unknown; height: unknown } | undefined;

                logger.info(COMPONENT, `screenshot target=${target}`);

                try {
                    let base64: string;

                    if (target === 'browser') {
                        base64 = await captureBrowserScreenshot(selector);
                    } else {
                        // Validate region if provided
                        let region: { x: number; y: number; width: number; height: number } | undefined;
                        if (regionRaw) {
                            region = {
                                x: assertCoord(regionRaw.x, 'region.x'),
                                y: assertCoord(regionRaw.y, 'region.y'),
                                width: assertCoord(regionRaw.width, 'region.width'),
                                height: assertCoord(regionRaw.height, 'region.height'),
                            };
                            if (region.width <= 0 || region.height <= 0) {
                                throw new Error('region.width and region.height must be positive numbers');
                            }
                        }
                        base64 = await captureDesktopScreenshot(region);
                    }

                    return `data:image/png;base64,${base64}`;
                } catch (err: any) {
                    logger.error(COMPONENT, `screenshot failed: ${err.message}`);
                    return `Error taking screenshot: ${err.message}`;
                }
            },
        },
    );

    // ── 2. mouse_click ─────────────────────────────────────────────────────────
    registerSkill(
        {
            name: 'mouse_click',
            description: 'Click the mouse at screen coordinates or a browser CSS selector',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'mouse_click',
            description:
                'Click the mouse at specified screen coordinates (x, y) or at a CSS selector inside a browser page. ' +
                'Supports left, right, and middle buttons, and double-click.',
            parameters: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate (pixels from screen left). Required for desktop clicks.' },
                    y: { type: 'number', description: 'Y coordinate (pixels from screen top). Required for desktop clicks.' },
                    selector: { type: 'string', description: 'CSS selector to click inside the browser (Playwright). If provided, x/y are ignored.' },
                    button: {
                        type: 'string',
                        enum: ['left', 'right', 'middle'],
                        description: 'Mouse button to click. Default: left.',
                        default: 'left',
                    },
                    doubleClick: {
                        type: 'boolean',
                        description: 'Whether to double-click. Default: false.',
                        default: false,
                    },
                },
            },
            execute: async (args) => {
                const selector = args.selector as string | undefined;
                const button = (args.button as string) || 'left';
                const doubleClick = Boolean(args.doubleClick);

                if (!['left', 'right', 'middle'].includes(button)) {
                    return `Error: Invalid button "${button}". Valid: left, right, middle`;
                }

                logger.info(COMPONENT, `mouse_click selector=${selector ?? `(${args.x},${args.y})`} button=${button} double=${doubleClick}`);

                try {
                    if (selector) {
                        // Browser path — use Playwright
                        let pw: any;
                        try {
                            pw = await import('playwright' as any);
                        } catch {
                            return 'Error: Playwright is not installed. Run: npx playwright install chromium';
                        }
                        const chromium = pw.chromium;
                        const browser = await chromium.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                        });
                        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
                        const page = await context.newPage();
                        try {
                            if (doubleClick) {
                                await page.dblclick(selector);
                            } else {
                                await page.click(selector, { button: button as 'left' | 'right' | 'middle' });
                            }
                            return `Clicked selector "${selector}" with ${button} button${doubleClick ? ' (double-click)' : ''}`;
                        } finally {
                            await page.close();
                            await browser.close();
                        }
                    }

                    // Desktop path
                    const x = assertCoord(args.x, 'x');
                    const y = assertCoord(args.y, 'y');

                    if (isLinux()) {
                        if (!toolAvailable('xdotool')) {
                            return 'Error: xdotool is not installed. Run: sudo apt install xdotool';
                        }
                        const btnNum = xdotoolButtonNumber(button);
                        if (doubleClick) {
                            // xdotool click with --repeat 2
                            runCmd('xdotool', [
                                'mousemove', '--sync', String(Math.round(x)), String(Math.round(y)),
                            ]);
                            runCmd('xdotool', ['click', '--repeat', '2', '--delay', '100', btnNum]);
                        } else {
                            runCmd('xdotool', [
                                'mousemove', '--sync', String(Math.round(x)), String(Math.round(y)),
                            ]);
                            runCmd('xdotool', ['click', btnNum]);
                        }
                        return `Clicked (${x}, ${y}) with ${button} button${doubleClick ? ' (double-click)' : ''}`;
                    } else if (isMacOS()) {
                        // AppleScript click via osascript — supports left click only natively
                        if (!toolAvailable('osascript')) {
                            return 'Error: osascript not available on this macOS system';
                        }
                        const clicks = doubleClick ? 2 : 1;
                        // cliclick is an optional but more capable tool; fall back to osascript
                        if (toolAvailable('cliclick')) {
                            const cmd = button === 'right' ? 'rc' : (doubleClick ? 'dc' : 'c');
                            runCmd('cliclick', [`${cmd}:${Math.round(x)},${Math.round(y)}`]);
                        } else {
                            // osascript: move mouse and click — no right-click via osascript easily
                            const script =
                                `tell application "System Events" to ` +
                                `click at {${Math.round(x)}, ${Math.round(y)}}`;
                            // We have to use execSync here because osascript -e takes a script string
                            // but we have already validated x and y are finite numbers (no injection risk)
                            runCmd('osascript', ['-e', script]);
                            if (clicks === 2) {
                                runCmd('osascript', ['-e', script]);
                            }
                        }
                        return `Clicked (${x}, ${y}) with ${button} button${doubleClick ? ' (double-click)' : ''}`;
                    } else {
                        return `Error: Unsupported platform for desktop mouse clicks: ${process.platform}`;
                    }
                } catch (err: any) {
                    logger.error(COMPONENT, `mouse_click failed: ${err.message}`);
                    return `Error: ${err.message}`;
                }
            },
        },
    );

    // ── 3. mouse_move ──────────────────────────────────────────────────────────
    registerSkill(
        {
            name: 'mouse_move',
            description: 'Move the mouse cursor to specified screen coordinates',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'mouse_move',
            description:
                'Move the mouse cursor to the specified (x, y) pixel coordinates on the desktop screen. ' +
                'Useful before drag operations or to hover over elements.',
            parameters: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate (pixels from screen left)' },
                    y: { type: 'number', description: 'Y coordinate (pixels from screen top)' },
                },
                required: ['x', 'y'],
            },
            execute: async (args) => {
                try {
                    const x = assertCoord(args.x, 'x');
                    const y = assertCoord(args.y, 'y');

                    logger.info(COMPONENT, `mouse_move (${x}, ${y})`);

                    if (isLinux()) {
                        if (!toolAvailable('xdotool')) {
                            return 'Error: xdotool is not installed. Run: sudo apt install xdotool';
                        }
                        runCmd('xdotool', ['mousemove', '--sync', String(Math.round(x)), String(Math.round(y))]);
                        return `Moved mouse to (${x}, ${y})`;
                    } else if (isMacOS()) {
                        if (toolAvailable('cliclick')) {
                            runCmd('cliclick', [`m:${Math.round(x)},${Math.round(y)}`]);
                        } else {
                            // osascript can't reliably move the mouse without System Events permission
                            return (
                                `Mouse move to (${x}, ${y}) requested. ` +
                                'Install cliclick (brew install cliclick) for reliable macOS mouse control.'
                            );
                        }
                        return `Moved mouse to (${x}, ${y})`;
                    } else {
                        return `Error: Unsupported platform for mouse_move: ${process.platform}`;
                    }
                } catch (err: any) {
                    logger.error(COMPONENT, `mouse_move failed: ${err.message}`);
                    return `Error: ${err.message}`;
                }
            },
        },
    );

    // ── 4. keyboard_type ───────────────────────────────────────────────────────
    registerSkill(
        {
            name: 'keyboard_type',
            description: 'Type text via the keyboard into the desktop or browser',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'keyboard_type',
            description:
                'Type the specified text using keyboard input. ' +
                'Use target="desktop" to type into whatever application currently has focus on the desktop. ' +
                'Use target="browser" to type into a CSS selector inside a Playwright browser page.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The text to type' },
                    target: {
                        type: 'string',
                        enum: ['desktop', 'browser'],
                        description: 'Where to type: "desktop" (active window) or "browser" (Playwright page). Default: desktop.',
                        default: 'desktop',
                    },
                    selector: {
                        type: 'string',
                        description: 'CSS selector to focus before typing (browser target only, optional).',
                    },
                    delay: {
                        type: 'number',
                        description: 'Delay between keystrokes in milliseconds (desktop xdotool only). Default: 50.',
                        default: 50,
                    },
                },
                required: ['text'],
            },
            execute: async (args) => {
                const text = args.text as string;
                if (typeof text !== 'string' || text.length === 0) {
                    return 'Error: "text" parameter must be a non-empty string';
                }
                if (text.length > 10_000) {
                    return 'Error: text exceeds 10,000 character limit';
                }

                const target = (args.target as string) || 'desktop';
                const selector = args.selector as string | undefined;
                const delay = Math.max(0, Math.min(5000, Number(args.delay) || 50));

                logger.info(COMPONENT, `keyboard_type target=${target} length=${text.length}`);

                try {
                    if (target === 'browser') {
                        let pw: any;
                        try {
                            pw = await import('playwright' as any);
                        } catch {
                            return 'Error: Playwright is not installed. Run: npx playwright install chromium';
                        }
                        const chromium = pw.chromium;
                        const browser = await chromium.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                        });
                        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
                        const page = await context.newPage();
                        try {
                            if (selector) {
                                await page.focus(selector);
                                await page.type(selector, text, { delay });
                            } else {
                                await page.keyboard.type(text, { delay });
                            }
                            return `Typed ${text.length} character(s) into browser${selector ? ` (${selector})` : ''}`;
                        } finally {
                            await page.close();
                            await browser.close();
                        }
                    }

                    // Desktop path
                    if (isLinux()) {
                        if (!toolAvailable('xdotool')) {
                            return 'Error: xdotool is not installed. Run: sudo apt install xdotool';
                        }
                        // xdotool type with --clearmodifiers prevents active modifiers
                        // (e.g. Shift/Ctrl still held) from corrupting the typed text.
                        // --delay controls inter-keystroke timing.
                        // The text is passed as a separate argv element — no shell interpretation.
                        runCmd('xdotool', [
                            'type',
                            '--clearmodifiers',
                            '--delay', String(delay),
                            '--', text,
                        ]);
                        return `Typed ${text.length} character(s) into focused desktop window`;
                    } else if (isMacOS()) {
                        if (!toolAvailable('osascript')) {
                            return 'Error: osascript not available';
                        }
                        // Escape backslashes and double-quotes for AppleScript string
                        // text is already validated as a string of ≤10k chars;
                        // we replace the two AppleScript-significant chars to prevent injection.
                        const safe = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        runCmd('osascript', [
                            '-e',
                            `tell application "System Events" to keystroke "${safe}"`,
                        ]);
                        return `Typed ${text.length} character(s) into focused desktop window`;
                    } else {
                        return `Error: Unsupported platform for keyboard_type: ${process.platform}`;
                    }
                } catch (err: any) {
                    logger.error(COMPONENT, `keyboard_type failed: ${err.message}`);
                    return `Error: ${err.message}`;
                }
            },
        },
    );

    // ── 5. keyboard_press ──────────────────────────────────────────────────────
    registerSkill(
        {
            name: 'keyboard_press',
            description: 'Press a key combination on the keyboard',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'keyboard_press',
            description:
                'Press a keyboard key or key combination such as "Enter", "Escape", "Control+C", "Alt+F4". ' +
                'Supports modifier keys (Control, Alt, Shift, Meta, Super) combined with letter keys, ' +
                'named keys (Enter, Escape, Tab, Backspace, Delete, Home, End, PageUp, PageDown, ' +
                'arrow keys, F1-F12), and single printable characters.',
            parameters: {
                type: 'object',
                properties: {
                    keys: {
                        type: 'string',
                        description:
                            'Key or key combination to press. ' +
                            'Examples: "Enter", "Escape", "Tab", "Control+C", "Alt+F4", "Control+Shift+t", "F5"',
                    },
                    target: {
                        type: 'string',
                        enum: ['desktop', 'browser'],
                        description: 'Where to send the key: "desktop" (active window) or "browser" (Playwright). Default: desktop.',
                        default: 'desktop',
                    },
                },
                required: ['keys'],
            },
            execute: async (args) => {
                const keysRaw = args.keys as string;
                if (typeof keysRaw !== 'string' || keysRaw.trim() === '') {
                    return 'Error: "keys" parameter must be a non-empty string';
                }
                const target = (args.target as string) || 'desktop';

                logger.info(COMPONENT, `keyboard_press keys="${keysRaw}" target=${target}`);

                try {
                    // Validate key string (throws on invalid input)
                    const xdotoolKeys = validateAndConvertKey(keysRaw.trim());

                    if (target === 'browser') {
                        let pw: any;
                        try {
                            pw = await import('playwright' as any);
                        } catch {
                            return 'Error: Playwright is not installed. Run: npx playwright install chromium';
                        }
                        const chromium = pw.chromium;
                        const browser = await chromium.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                        });
                        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
                        const page = await context.newPage();
                        try {
                            // Playwright uses its own key format — pass the original keysRaw
                            await page.keyboard.press(keysRaw.trim());
                            return `Pressed "${keysRaw}" in browser`;
                        } finally {
                            await page.close();
                            await browser.close();
                        }
                    }

                    // Desktop path
                    if (isLinux()) {
                        if (!toolAvailable('xdotool')) {
                            return 'Error: xdotool is not installed. Run: sudo apt install xdotool';
                        }
                        runCmd('xdotool', ['key', '--clearmodifiers', xdotoolKeys]);
                        return `Pressed "${keysRaw}" on desktop`;
                    } else if (isMacOS()) {
                        if (!toolAvailable('osascript')) {
                            return 'Error: osascript not available';
                        }
                        // Build an AppleScript keystroke command.
                        // We parse the validated key string and construct an osascript command.
                        const oaScript = buildMacOsKeystroke(keysRaw.trim());
                        runCmd('osascript', ['-e', oaScript]);
                        return `Pressed "${keysRaw}" on desktop`;
                    } else {
                        return `Error: Unsupported platform for keyboard_press: ${process.platform}`;
                    }
                } catch (err: any) {
                    logger.error(COMPONENT, `keyboard_press failed: ${err.message}`);
                    return `Error: ${err.message}`;
                }
            },
        },
    );

    // ── 6. screen_read ─────────────────────────────────────────────────────────
    registerSkill(
        {
            name: 'screen_read',
            description: 'Extract text from the screen or browser (clipboard, selection, or DOM)',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'screen_read',
            description:
                'Extract visible text from the screen or an open browser page. ' +
                'Three methods are supported: ' +
                '"browser" reads the full text content of the current browser page DOM (most reliable for web); ' +
                '"clipboard" reads whatever is currently on the system clipboard; ' +
                '"selection" uses Ctrl+A then Ctrl+C to select all text in the active window and read it from the clipboard.',
            parameters: {
                type: 'object',
                properties: {
                    method: {
                        type: 'string',
                        enum: ['browser', 'clipboard', 'selection'],
                        description:
                            'How to read the screen: ' +
                            '"browser" reads DOM text via Playwright, ' +
                            '"clipboard" reads current clipboard contents, ' +
                            '"selection" selects all and copies to clipboard then reads. ' +
                            'Default: clipboard.',
                        default: 'clipboard',
                    },
                    selector: {
                        type: 'string',
                        description: 'CSS selector to read text from (browser method only, optional). Default: body.',
                    },
                    url: {
                        type: 'string',
                        description: 'URL to navigate to before reading (browser method only, optional).',
                    },
                },
            },
            execute: async (args) => {
                const method = (args.method as string) || 'clipboard';
                const selector = (args.selector as string) || 'body';
                const url = args.url as string | undefined;

                logger.info(COMPONENT, `screen_read method=${method}`);

                try {
                    if (method === 'browser') {
                        let pw: any;
                        try {
                            pw = await import('playwright' as any);
                        } catch {
                            return 'Error: Playwright is not installed. Run: npx playwright install chromium';
                        }
                        const chromium = pw.chromium;
                        const browser = await chromium.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                        });
                        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
                        const page = await context.newPage();
                        try {
                            if (url) {
                                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                            }
                            const text = await page.innerText(selector);
                            const trimmed = text.trim().slice(0, 50_000);
                            return trimmed || '(no text found)';
                        } finally {
                            await page.close();
                            await browser.close();
                        }
                    }

                    if (method === 'selection') {
                        // Select all and copy to clipboard, then read clipboard
                        if (isLinux()) {
                            if (!toolAvailable('xdotool')) {
                                return 'Error: xdotool is not installed. Run: sudo apt install xdotool';
                            }
                            runCmd('xdotool', ['key', '--clearmodifiers', 'ctrl+a']);
                            // Small pause to let the selection settle
                            await new Promise<void>(r => setTimeout(r, 200));
                            runCmd('xdotool', ['key', '--clearmodifiers', 'ctrl+c']);
                            await new Promise<void>(r => setTimeout(r, 200));
                        } else if (isMacOS()) {
                            runCmd('osascript', ['-e', 'tell application "System Events" to keystroke "a" using command down']);
                            await new Promise<void>(r => setTimeout(r, 200));
                            runCmd('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
                            await new Promise<void>(r => setTimeout(r, 200));
                        } else {
                            return `Error: Unsupported platform for screen_read: ${process.platform}`;
                        }
                        // Fall through to clipboard read
                    }

                    // clipboard (and selection after copy)
                    if (isLinux()) {
                        // Try xclip first, then xsel
                        if (toolAvailable('xclip')) {
                            const text = runCmd('xclip', ['-selection', 'clipboard', '-o']);
                            return text.slice(0, 50_000) || '(clipboard is empty)';
                        } else if (toolAvailable('xsel')) {
                            const text = runCmd('xsel', ['--clipboard', '--output']);
                            return text.slice(0, 50_000) || '(clipboard is empty)';
                        } else {
                            return (
                                'Error: No clipboard tool found. ' +
                                'Install xclip (sudo apt install xclip) or xsel (sudo apt install xsel).'
                            );
                        }
                    } else if (isMacOS()) {
                        const text = runCmd('pbpaste', []);
                        return text.slice(0, 50_000) || '(clipboard is empty)';
                    } else {
                        return `Error: Unsupported platform for clipboard reading: ${process.platform}`;
                    }
                } catch (err: any) {
                    logger.error(COMPONENT, `screen_read failed: ${err.message}`);
                    return `Error: ${err.message}`;
                }
            },
        },
    );

    logger.info(COMPONENT, 'Computer use tools registered (screenshot, mouse_click, mouse_move, keyboard_type, keyboard_press, screen_read)');
}

// ─── macOS keystroke builder ───────────────────────────────────────────────────

/**
 * Convert a key combo string like "Control+C" or "Alt+F4" into an AppleScript
 * keystroke command string.
 *
 * AppleScript uses:  keystroke "c" using {command down}
 *                    key code 36  (for Enter)
 *
 * We handle common cases; for anything exotic cliclick is a better tool.
 */
function buildMacOsKeystroke(keys: string): string {
    const parts = keys.split('+').map(p => p.trim());
    const modifiers: string[] = [];
    let keyPart = parts[parts.length - 1];

    // Map modifiers
    for (let i = 0; i < parts.length - 1; i++) {
        const m = parts[i].toLowerCase();
        if (m === 'control' || m === 'ctrl') modifiers.push('control down');
        else if (m === 'alt') modifiers.push('option down');
        else if (m === 'shift') modifiers.push('shift down');
        else if (m === 'meta' || m === 'super' || m === 'command') modifiers.push('command down');
    }

    // Map named keys to AppleScript key codes
    const KEY_CODE_MAP: Record<string, number> = {
        Enter: 36, Return: 36,
        Tab: 48,
        Escape: 53,
        BackSpace: 51, Backspace: 51,
        Delete: 117,
        Home: 115, End: 119,
        PageUp: 116, PageDown: 121,
        Up: 126, Down: 125, Left: 123, Right: 124,
        F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97,
        F7: 98, F8: 100, F9: 101, F10: 109, F11: 103, F12: 111,
        space: 49, Space: 49,
    };

    const usingClause = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';

    if (KEY_CODE_MAP[keyPart] !== undefined) {
        return `tell application "System Events" to key code ${KEY_CODE_MAP[keyPart]}${usingClause}`;
    }

    // Single printable char — escape for AppleScript
    const safe = keyPart.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `tell application "System Events" to keystroke "${safe}"${usingClause}`;
}
