/**
 * TITAN — Slash Command Tests
 * Tests gateway/slashCommands.ts: registerSlashCommand, handleSlashCommand, initSlashCommands
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_VERSION: '2026.5.0',
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        agent: {
            model: 'anthropic/claude-sonnet-4-20250514',
            thinkingMode: 'medium',
            modelAliases: {},
        },
        security: { deniedTools: [], allowedTools: [] },
    }),
}));

vi.mock('../src/agent/session.js', () => ({
    getOrCreateSession: vi.fn().mockReturnValue({
        id: 'sess-1234-5678-9012',
        modelOverride: null,
        thinkingOverride: null,
        verboseMode: false,
        messageCount: 5,
    }),
    closeSession: vi.fn(),
    replaceSessionContext: vi.fn(),
    setSessionModelOverride: vi.fn(),
    setSessionThinkingOverride: vi.fn(),
    setSessionVerbose: vi.fn(),
    getContextMessages: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/agent/costOptimizer.js', () => ({
    getSessionCost: vi.fn().mockReturnValue(null),
    getDailyTotal: vi.fn().mockReturnValue(0.00123),
    formatCostSummary: vi.fn().mockReturnValue('$0.00123'),
}));

vi.mock('../src/agent/contextManager.js', () => ({
    forceCompactContext: vi.fn().mockReturnValue({ messages: [], savedTokens: 500 }),
}));

vi.mock('../src/providers/router.js', () => ({
    resolveModel: vi.fn(),
    getModelAliases: vi.fn().mockReturnValue({ fast: 'openai/gpt-4o-mini', smart: 'anthropic/claude-sonnet-4-20250514' }),
    isModelAllowed: vi.fn().mockReturnValue(true),
}));

import { registerSlashCommand, handleSlashCommand, initSlashCommands } from '../src/gateway/slashCommands.js';

describe('Slash Commands', () => {
    describe('registerSlashCommand', () => {
        it('should register a custom command', async () => {
            registerSlashCommand('test_cmd', () => ({
                handled: true,
                response: 'Test response',
            }));
            const result = await handleSlashCommand('/test_cmd', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toBe('Test response');
        });

        it('should be case-insensitive', async () => {
            registerSlashCommand('MyCmd', () => ({
                handled: true,
                response: 'case test',
            }));
            const result = await handleSlashCommand('/mycmd', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toBe('case test');
        });
    });

    describe('handleSlashCommand', () => {
        it('should return null for non-slash messages', async () => {
            const result = await handleSlashCommand('hello there', 'discord', 'user-1');
            expect(result).toBeNull();
        });

        it('should return null for unknown commands', async () => {
            const result = await handleSlashCommand('/unknown_command_xyz', 'discord', 'user-1');
            expect(result).toBeNull();
        });

        it('should parse args correctly', async () => {
            let capturedArgs = '';
            registerSlashCommand('argtest', (args) => {
                capturedArgs = args;
                return { handled: true, response: 'ok' };
            });
            await handleSlashCommand('/argtest some args here', 'discord', 'user-1');
            expect(capturedArgs).toBe('some args here');
        });

        it('should handle commands with no args', async () => {
            let capturedArgs = '';
            registerSlashCommand('noargs', (args) => {
                capturedArgs = args;
                return { handled: true, response: 'ok' };
            });
            await handleSlashCommand('/noargs', 'discord', 'user-1');
            expect(capturedArgs).toBe('');
        });

        it('should handle leading/trailing whitespace', async () => {
            registerSlashCommand('spacecmd', () => ({
                handled: true,
                response: 'space test',
            }));
            const result = await handleSlashCommand('  /spacecmd  ', 'discord', 'user-1');
            expect(result).not.toBeNull();
        });

        it('should handle async command handlers', async () => {
            registerSlashCommand('asynccmd', async () => ({
                handled: true,
                response: 'async result',
            }));
            const result = await handleSlashCommand('/asynccmd', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toBe('async result');
        });
    });

    describe('initSlashCommands', () => {
        beforeEach(() => {
            initSlashCommands();
        });

        it('should register /model command', async () => {
            const result = await handleSlashCommand('/model', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('Current Model');
        });

        it('should handle /model with a valid model argument', async () => {
            const result = await handleSlashCommand('/model openai/gpt-4o', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('openai/gpt-4o');
        });

        it('should handle /model with disallowed model', async () => {
            const { isModelAllowed } = await import('../src/providers/router.js');
            vi.mocked(isModelAllowed).mockReturnValueOnce(false);
            const result = await handleSlashCommand('/model blocked/model', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('not in the allowed');
        });

        it('should register /think command', async () => {
            const result = await handleSlashCommand('/think', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('Thinking Mode');
        });

        it('should handle /think with valid level', async () => {
            const result = await handleSlashCommand('/think high', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('high');
        });

        it('should reject invalid thinking levels', async () => {
            const result = await handleSlashCommand('/think turbo', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('Invalid thinking level');
        });

        it('should register /usage command', async () => {
            const result = await handleSlashCommand('/usage', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('Usage');
        });

        it('should show detailed usage when cost data exists', async () => {
            const { getSessionCost } = await import('../src/agent/costOptimizer.js');
            vi.mocked(getSessionCost).mockReturnValueOnce({
                calls: 5,
                inputTokens: 1000,
                outputTokens: 500,
                estimatedUsd: 0.005,
            } as any);
            const result = await handleSlashCommand('/usage', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('API Calls');
            expect(result!.response).toContain('Tokens');
        });

        it('should register /compact command', async () => {
            const result = await handleSlashCommand('/compact', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('compact');
        });

        it('should compact when there are more than 4 messages', async () => {
            const { getContextMessages } = await import('../src/agent/session.js');
            vi.mocked(getContextMessages).mockReturnValueOnce([
                { role: 'user', content: '1' },
                { role: 'assistant', content: '2' },
                { role: 'user', content: '3' },
                { role: 'assistant', content: '4' },
                { role: 'user', content: '5' },
            ] as any);
            const result = await handleSlashCommand('/compact', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('Context Compacted');
        });

        it('should register /verbose command', async () => {
            const result = await handleSlashCommand('/verbose', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('Verbose Mode');
        });

        it('should handle /verbose on', async () => {
            const result = await handleSlashCommand('/verbose on', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('on');
        });

        it('should handle /verbose off', async () => {
            const result = await handleSlashCommand('/verbose off', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.response).toContain('off');
        });

        it('should register /reset command', async () => {
            const result = await handleSlashCommand('/reset', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('reset');
        });

        it('should register /new as alias for /reset', async () => {
            const result = await handleSlashCommand('/new', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('reset');
        });

        it('should register /status command', async () => {
            const result = await handleSlashCommand('/status', 'discord', 'user-1');
            expect(result).not.toBeNull();
            expect(result!.handled).toBe(true);
            expect(result!.response).toContain('TITAN Status');
            expect(result!.response).toContain('2026.5.0');
        });
    });
});
