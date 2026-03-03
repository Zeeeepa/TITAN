/**
 * TITAN — Autonomy Engine Tests
 * Tests getAutonomyMode, getToolRisk, checkAutonomy, describeMode
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        autonomy: { mode: 'supervised' },
    }),
}));

import {
    getAutonomyMode,
    getToolRisk,
    checkAutonomy,
    describeMode,
    setToolRisk,
    listPendingActions,
} from '../src/agent/autonomy.js';
import { loadConfig } from '../src/config/config.js';

describe('Autonomy Engine', () => {
    describe('getAutonomyMode', () => {
        it('should return supervised as the default mode', () => {
            expect(getAutonomyMode()).toBe('supervised');
        });

        it('should return the configured mode', () => {
            vi.mocked(loadConfig).mockReturnValueOnce({
                autonomy: { mode: 'autonomous' },
            } as any);
            expect(getAutonomyMode()).toBe('autonomous');
        });

        it('should fall back to supervised on error', () => {
            vi.mocked(loadConfig).mockImplementationOnce(() => {
                throw new Error('Config broken');
            });
            expect(getAutonomyMode()).toBe('supervised');
        });
    });

    describe('getToolRisk', () => {
        it('should return safe for read_file', () => {
            expect(getToolRisk('read_file')).toBe('safe');
        });

        it('should return safe for web_search', () => {
            expect(getToolRisk('web_search')).toBe('safe');
        });

        it('should return moderate for write_file', () => {
            expect(getToolRisk('write_file')).toBe('moderate');
        });

        it('should return dangerous for shell', () => {
            expect(getToolRisk('shell')).toBe('dangerous');
        });

        it('should return dangerous for exec', () => {
            expect(getToolRisk('exec')).toBe('dangerous');
        });

        it('should return dangerous for unknown tools', () => {
            expect(getToolRisk('unknown_tool_xyz')).toBe('dangerous');
        });
    });

    describe('checkAutonomy', () => {
        it('should allow safe tools in supervised mode', async () => {
            const result = await checkAutonomy('read_file', {});
            expect(result.allowed).toBe(true);
        });

        it('should allow moderate tools from cli in supervised mode', async () => {
            const result = await checkAutonomy('write_file', {}, 'cli');
            expect(result.allowed).toBe(true);
        });

        it('should allow moderate tools from webchat in supervised mode', async () => {
            const result = await checkAutonomy('edit_file', {}, 'webchat');
            expect(result.allowed).toBe(true);
        });

        it('should block guests from dangerous tools', async () => {
            const result = await checkAutonomy('shell', {}, 'discord', 'guest');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Permission denied');
        });

        it('should allow everything in autonomous mode', async () => {
            vi.mocked(loadConfig).mockReturnValue({
                autonomy: { mode: 'autonomous' },
            } as any);
            const result = await checkAutonomy('shell', { command: 'rm -rf /' });
            expect(result.allowed).toBe(true);
            // Reset
            vi.mocked(loadConfig).mockReturnValue({
                autonomy: { mode: 'supervised' },
            } as any);
        });

        it('should auto-approve dangerous tools in CLI supervised mode', async () => {
            const result = await checkAutonomy('shell', { command: 'ls' }, 'cli');
            expect(result.allowed).toBe(true);
        });
    });

    describe('describeMode', () => {
        it('should describe autonomous mode', () => {
            const desc = describeMode('autonomous');
            expect(desc).toContain('Autonomous');
        });

        it('should describe supervised mode', () => {
            const desc = describeMode('supervised');
            expect(desc).toContain('Supervised');
        });

        it('should describe locked mode', () => {
            const desc = describeMode('locked');
            expect(desc).toContain('Locked');
        });

        it('should use current mode when no argument', () => {
            const desc = describeMode();
            expect(desc).toContain('Supervised');
        });
    });

    describe('setToolRisk', () => {
        it('should override the risk level for a tool', () => {
            setToolRisk('custom_tool', 'safe');
            expect(getToolRisk('custom_tool')).toBe('safe');
            // Reset
            setToolRisk('custom_tool', 'dangerous');
        });
    });

    describe('listPendingActions', () => {
        it('should return empty array when no pending actions', () => {
            expect(listPendingActions()).toEqual([]);
        });
    });
});
