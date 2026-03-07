/**
 * TITAN -- Comprehensive Computer Use Skill Tests
 *
 * Covers all 6 registered tool handlers:
 *   screenshot, mouse_click, mouse_move, keyboard_type, keyboard_press, screen_read
 *
 * Tests every major execution path including:
 *   - Linux desktop paths (xdotool, scrot, import, xclip, xsel)
 *   - macOS desktop paths (screencapture, osascript, pbpaste, cliclick)
 *   - Browser/Playwright paths
 *   - Region/selector sub-paths
 *   - Validation & error handling
 *   - Unsupported platform fallback
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Shared state captured from mock registerSkill
let handlers: Map<string, any>;
let mockExecFileSync: Mock;
let mockExistsSync: Mock;
let mockReadFileSync: Mock;
let mockMkdirSync: Mock;

// Helpers to set platform
const originalPlatform = process.platform;
function setPlatform(p: string) {
    Object.defineProperty(process, 'platform', { value: p, writable: true });
}
function restorePlatform() {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
}

/**
 * Standard setup: reset modules, create mocks, capture handlers.
 * Accepts overrides for execFileSync behavior.
 */
async function setup(opts?: {
    execFileSync?: Mock;
    existsSync?: Mock;
    readFileSync?: Mock;
}) {
    vi.resetModules();
    handlers = new Map<string, any>();

    vi.doMock('../src/utils/logger.js', () => ({
        default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock('../src/config/config.js', () => ({
        loadConfig: vi.fn().mockReturnValue({
            security: { deniedTools: [], allowedTools: [], commandTimeout: 30000 },
        }),
    }));
    vi.doMock('../src/skills/registry.js', () => ({
        registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
            handlers.set(handler.name, handler);
        }),
    }));

    mockExecFileSync = opts?.execFileSync ?? vi.fn().mockReturnValue(Buffer.from('success'));
    mockExistsSync = opts?.existsSync ?? vi.fn().mockReturnValue(true);
    mockReadFileSync = opts?.readFileSync ?? vi.fn().mockReturnValue(Buffer.from('png-data'));
    mockMkdirSync = vi.fn();

    vi.doMock('child_process', () => ({
        execFileSync: mockExecFileSync,
    }));
    vi.doMock('fs', async () => {
        const actual = await vi.importActual<typeof import('fs')>('fs');
        return {
            ...actual,
            existsSync: mockExistsSync,
            readFileSync: mockReadFileSync,
            mkdirSync: mockMkdirSync,
        };
    });

    const { registerComputerUseSkill } = await import('../src/skills/builtin/computer_use.js');
    registerComputerUseSkill();
}

// ════════════════════════════════════════════════════════════════════
// Screenshot handler
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — screenshot', () => {
    afterEach(() => restorePlatform());

    it('should capture desktop screenshot on Linux with scrot', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({ target: 'screen' });
        expect(result).toContain('data:image/png;base64,');
        // scrot should be checked via which
        expect(mockExecFileSync).toHaveBeenCalledWith('which', ['scrot'], expect.any(Object));
    });

    it('should capture desktop screenshot on Linux with scrot + region', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({
            target: 'screen',
            region: { x: 10, y: 20, width: 100, height: 50 },
        });
        expect(result).toContain('data:image/png;base64,');
        // Should call scrot with --area
        const scrotCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'scrot' && c[1]?.includes('--area'),
        );
        expect(scrotCall).toBeTruthy();
    });

    it('should fall back to ImageMagick import on Linux when scrot is missing', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            // which scrot fails, which import succeeds
            if (cmd === 'which' && args[0] === 'scrot') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screenshot');
        const result = await handler.execute({ target: 'screen' });
        expect(result).toContain('data:image/png;base64,');
        // Should call import -window root
        const importCall = exec.mock.calls.find(
            (c: any[]) => c[0] === 'import',
        );
        expect(importCall).toBeTruthy();
    });

    it('should use ImageMagick import with region on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'which' && args[0] === 'scrot') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screenshot');
        const result = await handler.execute({
            target: 'screen',
            region: { x: 0, y: 0, width: 200, height: 100 },
        });
        expect(result).toContain('data:image/png;base64,');
        const importCall = exec.mock.calls.find(
            (c: any[]) => c[0] === 'import' && c[1]?.includes('-crop'),
        );
        expect(importCall).toBeTruthy();
    });

    it('should error when no screenshot tool on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec, existsSync: vi.fn().mockReturnValue(false) });

        const handler = handlers.get('screenshot');
        const result = await handler.execute({ target: 'screen' });
        expect(result).toContain('Error');
        expect(result).toContain('No screenshot tool');
    });

    it('should capture desktop screenshot on macOS with screencapture', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({ target: 'screen' });
        expect(result).toContain('data:image/png;base64,');
        const scCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'screencapture',
        );
        expect(scCall).toBeTruthy();
    });

    it('should capture macOS screenshot with region', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({
            target: 'screen',
            region: { x: 10, y: 20, width: 300, height: 200 },
        });
        expect(result).toContain('data:image/png;base64,');
        const scCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'screencapture' && c[1]?.includes('-R'),
        );
        expect(scCall).toBeTruthy();
    });

    it('should error on unsupported platform', async () => {
        setPlatform('freebsd');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({ target: 'screen' });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should default target to screen when missing', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({});
        expect(result).toContain('data:image/png;base64,');
    });

    it('should error when screenshot file not found', async () => {
        setPlatform('linux');
        // existsSync returns true for first call (mkdirSync check), false for second (file read)
        let callCount = 0;
        const exists = vi.fn().mockImplementation(() => {
            callCount++;
            // The screenshotTmpPath() calls existsSync for the dir,
            // then fileToBase64 calls it for the file
            return callCount <= 1; // dir exists, file doesn't
        });
        await setup({ existsSync: exists });

        const handler = handlers.get('screenshot');
        const result = await handler.execute({ target: 'screen' });
        expect(result).toContain('Error');
        expect(result).toContain('Screenshot file not found');
    });

    it('should reject region with zero width', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({
            target: 'screen',
            region: { x: 0, y: 0, width: 0, height: 100 },
        });
        expect(result).toContain('Error');
        expect(result).toContain('positive');
    });

    it('should reject region with negative height', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({
            target: 'screen',
            region: { x: 0, y: 0, width: 100, height: -5 },
        });
        expect(result).toContain('Error');
        expect(result).toContain('positive');
    });

    it('should reject region with NaN coordinates', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        const result = await handler.execute({
            target: 'screen',
            region: { x: 'foo', y: 0, width: 100, height: 100 },
        });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid coordinate');
    });

    it('should attempt browser screenshot target (Playwright import fails gracefully)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screenshot');
        // browser target will try to import web_browser.js and playwright — both fail in test env
        const result = await handler.execute({ target: 'browser' });
        expect(result).toContain('Error');
        // Should mention playwright
        expect(result.toLowerCase()).toContain('playwright');
    });
});

// ════════════════════════════════════════════════════════════════════
// mouse_click handler
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — mouse_click', () => {
    afterEach(() => restorePlatform());

    it('should click at coordinates on Linux with xdotool', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200 });
        expect(result).toContain('Clicked (100, 200)');
        expect(result).toContain('left');
    });

    it('should double-click on Linux', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 50, y: 50, doubleClick: true });
        expect(result).toContain('double-click');
        // Should call xdotool click with --repeat 2
        const clickCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'xdotool' && c[1]?.includes('--repeat'),
        );
        expect(clickCall).toBeTruthy();
    });

    it('should click right button on Linux', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200, button: 'right' });
        expect(result).toContain('right');
        // Button 3 for right
        const clickCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'xdotool' && c[1]?.includes('3'),
        );
        expect(clickCall).toBeTruthy();
    });

    it('should click middle button on Linux', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200, button: 'middle' });
        expect(result).toContain('middle');
    });

    it('should error for missing xdotool on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200 });
        expect(result).toContain('Error');
        expect(result).toContain('xdotool');
    });

    it('should click on macOS with cliclick', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 300, y: 400 });
        expect(result).toContain('Clicked (300, 400)');
    });

    it('should right-click on macOS with cliclick', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 300, y: 400, button: 'right' });
        expect(result).toContain('right');
        // cliclick uses rc: for right click
        const rcCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'cliclick' && typeof c[1]?.[0] === 'string' && c[1][0].startsWith('rc:'),
        );
        expect(rcCall).toBeTruthy();
    });

    it('should double-click on macOS with cliclick', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 300, y: 400, doubleClick: true });
        expect(result).toContain('double-click');
        // cliclick uses dc: for double-click
        const dcCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'cliclick' && typeof c[1]?.[0] === 'string' && c[1][0].startsWith('dc:'),
        );
        expect(dcCall).toBeTruthy();
    });

    it('should fall back to osascript on macOS when cliclick is missing', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'which' && args[0] === 'cliclick') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 200, y: 150 });
        expect(result).toContain('Clicked (200, 150)');
        const osascriptCall = exec.mock.calls.find(
            (c: any[]) => c[0] === 'osascript',
        );
        expect(osascriptCall).toBeTruthy();
    });

    it('should double-click via osascript (called twice) on macOS without cliclick', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'which' && args[0] === 'cliclick') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 200, y: 150, doubleClick: true });
        expect(result).toContain('double-click');
        // osascript should be called twice for double-click
        const osaCalls = exec.mock.calls.filter(
            (c: any[]) => c[0] === 'osascript' && c[1]?.[1]?.includes('click'),
        );
        expect(osaCalls.length).toBe(2);
    });

    it('should error when osascript missing on macOS', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 100 });
        expect(result).toContain('Error');
        expect(result).toContain('osascript');
    });

    it('should error for invalid coordinates (NaN)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 'abc', y: 200 });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid coordinate');
    });

    it('should error for invalid coordinates (Infinity)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: Infinity, y: 200 });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid coordinate');
    });

    it('should error for invalid button name', async () => {
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200, button: 'invalid_btn' });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid button');
    });

    it('should error on unsupported platform', async () => {
        setPlatform('win32');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200 });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should attempt browser click via selector (Playwright fails gracefully)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ selector: '#btn' });
        expect(result).toContain('Error');
        expect(result.toLowerCase()).toContain('playwright');
    });

    it('should default button to left', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_click');
        const result = await handler.execute({ x: 100, y: 200 });
        expect(result).toContain('left');
    });
});

// ════════════════════════════════════════════════════════════════════
// mouse_move handler
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — mouse_move', () => {
    afterEach(() => restorePlatform());

    it('should move mouse on Linux with xdotool', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: 500, y: 300 });
        expect(result).toContain('Moved mouse to (500, 300)');
    });

    it('should error when xdotool missing on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: 100, y: 100 });
        expect(result).toContain('Error');
        expect(result).toContain('xdotool');
    });

    it('should move mouse on macOS with cliclick', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: 200, y: 300 });
        expect(result).toContain('Moved mouse to (200, 300)');
        const cliCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'cliclick',
        );
        expect(cliCall).toBeTruthy();
    });

    it('should suggest cliclick when missing on macOS', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'which' && args[0] === 'cliclick') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: 200, y: 300 });
        expect(result).toContain('cliclick');
        expect(result).toContain('brew install');
    });

    it('should error for non-finite coordinates', async () => {
        await setup();

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: Infinity, y: 300 });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid coordinate');
    });

    it('should error for NaN coordinates', async () => {
        await setup();

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: NaN, y: 300 });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid coordinate');
    });

    it('should error on unsupported platform', async () => {
        setPlatform('win32');
        await setup();

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: 100, y: 100 });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should handle runCmd failure gracefully', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'xdotool' && args[0] === 'mousemove') {
                const err: any = new Error('xdotool failed');
                err.stderr = Buffer.from('connection refused');
                throw err;
            }
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('mouse_move');
        const result = await handler.execute({ x: 100, y: 100 });
        expect(result).toContain('Error');
    });
});

// ════════════════════════════════════════════════════════════════════
// keyboard_type handler
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — keyboard_type', () => {
    afterEach(() => restorePlatform());

    it('should type text on Linux with xdotool', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'Hello TITAN' });
        expect(result).toContain('Typed 11 character(s)');
        expect(result).toContain('desktop');
    });

    it('should use --clearmodifiers and --delay with xdotool', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_type');
        await handler.execute({ text: 'abc', delay: 100 });
        const typeCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'xdotool' && c[1]?.includes('type'),
        );
        expect(typeCall).toBeTruthy();
        expect(typeCall![1]).toContain('--clearmodifiers');
        expect(typeCall![1]).toContain('--delay');
        expect(typeCall![1]).toContain('100');
    });

    it('should reject empty text', async () => {
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: '' });
        expect(result).toContain('Error');
        expect(result).toContain('non-empty string');
    });

    it('should reject non-string text', async () => {
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 123 });
        expect(result).toContain('Error');
        expect(result).toContain('non-empty string');
    });

    it('should reject text exceeding 10000 chars', async () => {
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'x'.repeat(10001) });
        expect(result).toContain('Error');
        expect(result).toContain('10,000');
    });

    it('should error when xdotool missing on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'test' });
        expect(result).toContain('Error');
        expect(result).toContain('xdotool');
    });

    it('should type on macOS with osascript', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'Hello Mac' });
        expect(result).toContain('Typed 9 character(s)');
        const osaCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'osascript',
        );
        expect(osaCall).toBeTruthy();
    });

    it('should escape special chars for AppleScript on macOS', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('keyboard_type');
        await handler.execute({ text: 'a "quoted" \\path' });
        const osaCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'osascript',
        );
        expect(osaCall).toBeTruthy();
        const script = osaCall![1][1];
        // Backslashes and quotes should be escaped
        expect(script).toContain('\\"');
        expect(script).toContain('\\\\');
    });

    it('should error when osascript missing on macOS', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'test' });
        expect(result).toContain('Error');
        expect(result).toContain('osascript');
    });

    it('should error on unsupported platform', async () => {
        setPlatform('win32');
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'test' });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should try browser target (Playwright fails gracefully)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_type');
        const result = await handler.execute({ text: 'hello', target: 'browser' });
        expect(result).toContain('Error');
        expect(result.toLowerCase()).toContain('playwright');
    });

    it('should clamp delay to valid range', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_type');
        // Negative delay -> clamped to 0
        const result = await handler.execute({ text: 'a', delay: -100 });
        expect(result).toContain('Typed 1 character(s)');
        const typeCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'xdotool' && c[1]?.includes('type'),
        );
        expect(typeCall![1]).toContain('0');
    });
});

// ════════════════════════════════════════════════════════════════════
// keyboard_press handler
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — keyboard_press', () => {
    afterEach(() => restorePlatform());

    it('should press Enter on Linux', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter' });
        expect(result).toContain('Pressed "Enter"');
        expect(result).toContain('desktop');
    });

    it('should press Control+c on Linux', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Control+c' });
        expect(result).toContain('Pressed "Control+c"');
    });

    it('should press Control+Shift+t on Linux', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Control+Shift+t' });
        expect(result).toContain('Pressed "Control+Shift+t"');
    });

    it('should press F5 key', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'F5' });
        expect(result).toContain('Pressed "F5"');
    });

    it('should press single printable ASCII char', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'a' });
        expect(result).toContain('Pressed "a"');
    });

    it('should reject empty keys', async () => {
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: '' });
        expect(result).toContain('Error');
        expect(result).toContain('non-empty string');
    });

    it('should reject invalid key name', async () => {
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'InvalidKeyXYZ123' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown key');
    });

    it('should reject non-modifier in modifier position', async () => {
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter+c' });
        expect(result).toContain('Error');
        expect(result).toContain('Unknown modifier');
    });

    it('should error when xdotool missing on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter' });
        expect(result).toContain('Error');
        expect(result).toContain('xdotool');
    });

    it('should press key on macOS with osascript', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter' });
        expect(result).toContain('Pressed "Enter"');
        const osaCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'osascript' && c[1]?.[1]?.includes('key code'),
        );
        expect(osaCall).toBeTruthy();
    });

    it('should press modifier+key on macOS', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Control+c' });
        expect(result).toContain('Pressed "Control+c"');
        const osaCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'osascript' && c[1]?.[1]?.includes('control down'),
        );
        expect(osaCall).toBeTruthy();
    });

    it('should press Alt key mapped to option on macOS', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('keyboard_press');
        await handler.execute({ keys: 'Alt+a' });
        const osaCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'osascript' && c[1]?.[1]?.includes('option down'),
        );
        expect(osaCall).toBeTruthy();
    });

    it('should error when osascript missing on macOS', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter' });
        expect(result).toContain('Error');
        expect(result).toContain('osascript');
    });

    it('should error on unsupported platform', async () => {
        setPlatform('win32');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter' });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should try browser target (Playwright fails gracefully)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: 'Enter', target: 'browser' });
        expect(result).toContain('Error');
        expect(result.toLowerCase()).toContain('playwright');
    });

    it('should trim whitespace from keys', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        const result = await handler.execute({ keys: '  Enter  ' });
        expect(result).toContain('Pressed');
        expect(result).not.toContain('Unknown');
    });

    it('should handle named keys: Tab, Escape, Backspace, Space', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('keyboard_press');
        for (const key of ['Tab', 'Escape', 'BackSpace', 'Space']) {
            vi.resetModules();
            await setup();
            setPlatform('linux');
            const result = await handler.execute({ keys: key });
            expect(result).toContain('Pressed');
        }
    });
});

// ════════════════════════════════════════════════════════════════════
// screen_read handler
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — screen_read', () => {
    afterEach(() => restorePlatform());

    it('should read clipboard on Linux with xclip', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(typeof result).toBe('string');
    });

    it('should fall back to xsel on Linux when xclip missing', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'which' && args[0] === 'xclip') throw new Error('not found');
            return Buffer.from('clipboard-text');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(typeof result).toBe('string');
        const xselCall = exec.mock.calls.find(
            (c: any[]) => c[0] === 'xsel',
        );
        expect(xselCall).toBeTruthy();
    });

    it('should error when no clipboard tool on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(result).toContain('Error');
        expect(result).toContain('No clipboard tool');
    });

    it('should read clipboard on macOS with pbpaste', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(typeof result).toBe('string');
        const pbCall = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'pbpaste',
        );
        expect(pbCall).toBeTruthy();
    });

    it('should use selection method on Linux (xdotool ctrl+a, ctrl+c then clipboard)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'selection' });
        expect(typeof result).toBe('string');
        // Should call xdotool key ctrl+a and ctrl+c
        const ctrlACalls = mockExecFileSync.mock.calls.filter(
            (c: any[]) => c[0] === 'xdotool' && c[1]?.includes('ctrl+a'),
        );
        expect(ctrlACalls.length).toBeGreaterThan(0);
    });

    it('should use selection method on macOS', async () => {
        setPlatform('darwin');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'selection' });
        expect(typeof result).toBe('string');
        // Should call osascript with command down for select all
        const osaSelectAll = mockExecFileSync.mock.calls.find(
            (c: any[]) => c[0] === 'osascript' && c[1]?.[1]?.includes('keystroke "a" using command down'),
        );
        expect(osaSelectAll).toBeTruthy();
    });

    it('should error for selection on unsupported platform', async () => {
        setPlatform('win32');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'selection' });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should error for clipboard on unsupported platform', async () => {
        setPlatform('win32');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(result).toContain('Error');
        expect(result).toContain('Unsupported platform');
    });

    it('should default method to clipboard when not provided', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({});
        expect(typeof result).toBe('string');
        // Should read clipboard, not error
    });

    it('should try browser method (Playwright fails gracefully)', async () => {
        setPlatform('linux');
        await setup();

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'browser' });
        expect(result).toContain('Error');
        expect(result.toLowerCase()).toContain('playwright');
    });

    it('should error for selection when xdotool missing on Linux', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'which') throw new Error('not found');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'selection' });
        expect(result).toContain('Error');
        expect(result).toContain('xdotool');
    });

    it('should return empty clipboard indicator', async () => {
        setPlatform('linux');
        const exec = vi.fn().mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'xclip') return Buffer.from('');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(result).toContain('clipboard is empty');
    });

    it('should return empty clipboard indicator on macOS', async () => {
        setPlatform('darwin');
        const exec = vi.fn().mockImplementation((cmd: string) => {
            if (cmd === 'pbpaste') return Buffer.from('');
            return Buffer.from('ok');
        });
        await setup({ execFileSync: exec });

        const handler = handlers.get('screen_read');
        const result = await handler.execute({ method: 'clipboard' });
        expect(result).toContain('clipboard is empty');
    });
});

// ════════════════════════════════════════════════════════════════════
// Registration
// ════════════════════════════════════════════════════════════════════

describe('Computer Use — registration', () => {
    it('should register all 6 handlers', async () => {
        await setup();

        expect(handlers.has('screenshot')).toBe(true);
        expect(handlers.has('mouse_click')).toBe(true);
        expect(handlers.has('mouse_move')).toBe(true);
        expect(handlers.has('keyboard_type')).toBe(true);
        expect(handlers.has('keyboard_press')).toBe(true);
        expect(handlers.has('screen_read')).toBe(true);
        expect(handlers.size).toBe(6);
    });
});
