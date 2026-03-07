/**
 * TITAN Brain — Unit Tests
 * Tests brain module behavior with mocked node-llama-cpp
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let mockBrainEnabled = false;
let mockBrainModel = 'smollm2-360m';

const mockLoadConfig = vi.fn().mockImplementation(() => ({
    agent: { model: 'anthropic/claude-sonnet-4-20250514', maxTokens: 8192, temperature: 0.7 },
    providers: {},
    security: { deniedTools: [], allowedTools: [], commandTimeout: 30000 },
    brain: {
        enabled: mockBrainEnabled,
        model: mockBrainModel,
        autoDownload: false,
        maxToolsPerRequest: 12,
        timeoutMs: 2000,
    },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

// Mock node-llama-cpp — not actually available in test environment
vi.mock('node-llama-cpp', () => {
    throw new Error('node-llama-cpp not installed');
});

// ─── Imports (after mocks) ──────────────────────────────────────────

import { isAvailable, getStats, ensureLoaded, selectTools, unload } from '../src/agent/brain.js';
import type { ToolDefinition } from '../src/providers/base.js';

// ─── Test helpers ───────────────────────────────────────────────────

function makeTool(name: string, description: string): ToolDefinition {
    return {
        type: 'function',
        function: { name, description, parameters: {} },
    };
}

const ALL_TOOLS: ToolDefinition[] = [
    makeTool('shell', 'Execute a shell command'),
    makeTool('read_file', 'Read a file from disk'),
    makeTool('write_file', 'Write content to a file'),
    makeTool('edit_file', 'Edit a file with find/replace'),
    makeTool('list_dir', 'List directory contents'),
    makeTool('web_search', 'Search the web'),
    makeTool('web_fetch', 'Fetch a web page'),
    makeTool('memory', 'Store or recall memories'),
    makeTool('browser_navigate', 'Navigate browser to URL'),
    makeTool('browser_snapshot', 'Take browser screenshot'),
    makeTool('cron_schedule', 'Schedule a cron job'),
    makeTool('webhook_create', 'Create a webhook endpoint'),
    makeTool('vision_analyze', 'Analyze an image'),
    makeTool('voice_speak', 'Text to speech'),
];

// ─── Tests ──────────────────────────────────────────────────────────

describe('Brain', () => {
    beforeEach(() => {
        mockBrainEnabled = false;
        mockBrainModel = 'smollm2-360m';
    });

    afterEach(async () => {
        await unload();
    });

    describe('isAvailable', () => {
        it('returns false when brain is not loaded', () => {
            expect(isAvailable()).toBe(false);
        });
    });

    describe('getStats', () => {
        it('returns default stats when not loaded', () => {
            const stats = getStats();
            expect(stats.loaded).toBe(false);
            expect(stats.inferenceCount).toBe(0);
            expect(stats.avgLatencyMs).toBe(0);
            expect(stats.error).toBeNull();
        });
    });

    describe('ensureLoaded', () => {
        it('returns false when brain is disabled', async () => {
            mockBrainEnabled = false;
            const result = await ensureLoaded();
            expect(result).toBe(false);
        });

        it('returns false when node-llama-cpp is not installed', async () => {
            mockBrainEnabled = true;
            const result = await ensureLoaded();
            expect(result).toBe(false);
            // Should have an error recorded
            const stats = getStats();
            expect(stats.error).toBeTruthy();
        });
    });

    describe('selectTools', () => {
        it('returns all tools when brain is not available', async () => {
            const result = await selectTools('search the web for AI news', ALL_TOOLS);
            expect(result).toBe(ALL_TOOLS);
            expect(result.length).toBe(ALL_TOOLS.length);
        });

        it('returns all tools when tool count is below maxToolsPerRequest', async () => {
            const fewTools = ALL_TOOLS.slice(0, 5);
            const result = await selectTools('hello', fewTools);
            expect(result).toBe(fewTools);
        });
    });

    describe('unload', () => {
        it('resets all state', async () => {
            await unload();
            expect(isAvailable()).toBe(false);
            const stats = getStats();
            expect(stats.loaded).toBe(false);
            expect(stats.inferenceCount).toBe(0);
            expect(stats.error).toBeNull();
        });
    });
});

describe('BrainConfig', () => {
    it('config schema has brain section with correct defaults', async () => {
        // Import the schema to verify it compiles and has correct defaults
        const { BrainConfigSchema } = await import('../src/config/schema.js');
        const defaults = BrainConfigSchema.parse({});
        expect(defaults.enabled).toBe(false);
        expect(defaults.model).toBe('smollm2-360m');
        expect(defaults.autoDownload).toBe(true);
        expect(defaults.maxToolsPerRequest).toBe(12);
        expect(defaults.timeoutMs).toBe(2000);
    });

    it('brain is included in TitanConfigSchema', async () => {
        const { TitanConfigSchema } = await import('../src/config/schema.js');
        const config = TitanConfigSchema.parse({});
        expect(config.brain).toBeDefined();
        expect(config.brain.enabled).toBe(false);
    });
});
