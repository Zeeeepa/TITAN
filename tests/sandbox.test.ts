/**
 * TITAN — Sandbox Code Execution Tests
 * Tests for the sandbox manager, bridge server, stub generation, and code_exec skill.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        agent: { model: 'anthropic/claude-sonnet-4-20250514', maxTokens: 8192, temperature: 0.7 },
        providers: {},
        security: { deniedTools: [], allowedTools: [], commandTimeout: 30000 },
        sandbox: {
            enabled: true,
            image: 'titan-sandbox',
            timeoutMs: 60000,
            memoryMB: 512,
            cpus: 1,
            deniedTools: ['shell', 'exec', 'code_exec', 'process', 'apply_patch'],
        },
    }),
}));

vi.mock('../src/skills/registry.js', () => ({
    isToolSkillEnabled: vi.fn().mockReturnValue(true),
    registerSkill: vi.fn(),
}));

// Register test tools
import { registerTool } from '../src/agent/toolRunner.js';

function registerTestTools() {
    const tools = [
        { name: 'web_search', description: 'Search the web for information' },
        { name: 'read_file', description: 'Read a file from disk' },
        { name: 'write_file', description: 'Write content to a file' },
        { name: 'shell', description: 'Execute a shell command' },
        { name: 'exec', description: 'Execute with background support' },
        { name: 'process', description: 'Manage background processes' },
        { name: 'code_exec', description: 'Execute code in sandbox' },
        { name: 'memory', description: 'Store or recall memories' },
        { name: 'email_send', description: 'Send an email message' },
        { name: 'list_dir', description: 'List directory contents' },
    ];

    for (const t of tools) {
        registerTool({
            name: t.name,
            description: t.description,
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' },
                    path: { type: 'string', description: 'File path' },
                },
                required: t.name === 'web_search' ? ['query'] : [],
            },
            execute: async () => 'ok',
        });
    }
}

registerTestTools();

// ─── Imports ────────────────────────────────────────────────────────

import {
    generateToolStubs,
    startBridge,
    stopBridge,
    checkDocker,
    getSandboxStatus,
} from '../src/agent/sandbox.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('Sandbox', () => {
    describe('generateToolStubs', () => {
        it('generates Python function stubs for allowed tools', () => {
            const stubs = generateToolStubs();
            expect(stubs).toContain('def web_search(');
            expect(stubs).toContain('def read_file(');
            expect(stubs).toContain('def memory(');
            expect(stubs).toContain('def email_send(');
        });

        it('excludes denied tools from stubs', () => {
            const stubs = generateToolStubs();
            expect(stubs).not.toContain('def shell(');
            expect(stubs).not.toContain('def exec(');
            expect(stubs).not.toContain('def process(');
            expect(stubs).not.toContain('def code_exec(');
        });

        it('includes bridge import', () => {
            const stubs = generateToolStubs();
            expect(stubs).toContain('from bridge import call_tool');
        });

        it('generates valid Python syntax', () => {
            const stubs = generateToolStubs();
            // Each function should have def, docstring, and call_tool
            const funcCount = (stubs.match(/^def \w+\(/gm) || []).length;
            expect(funcCount).toBeGreaterThan(0);
            expect(stubs).toContain('call_tool(');
        });

        it('handles required vs optional parameters', () => {
            const stubs = generateToolStubs();
            // web_search has required 'query' param — should not have default value
            expect(stubs).toMatch(/def web_search\(query: str/);
        });
    });

    describe('Bridge Server', () => {
        afterEach(() => {
            stopBridge();
        });

        it('starts on a random port', async () => {
            const port = await startBridge();
            expect(port).toBeGreaterThan(0);
            expect(port).toBeLessThan(65536);
        });

        it('returns same port on second call (singleton)', async () => {
            const port1 = await startBridge();
            const port2 = await startBridge();
            expect(port1).toBe(port2);
        });

        it('stops cleanly', async () => {
            await startBridge();
            stopBridge();
            const status = getSandboxStatus();
            expect(status.bridgeRunning).toBe(false);
            expect(status.bridgePort).toBe(0);
        });
    });

    describe('getSandboxStatus', () => {
        it('reports not running initially', () => {
            stopBridge(); // ensure clean state
            const status = getSandboxStatus();
            expect(status.bridgeRunning).toBe(false);
            expect(status.activeSessions).toBe(0);
        });

        it('reports running after startBridge', async () => {
            const port = await startBridge();
            const status = getSandboxStatus();
            expect(status.bridgeRunning).toBe(true);
            expect(status.bridgePort).toBe(port);
            stopBridge();
        });
    });

    describe('checkDocker', () => {
        it('returns a boolean', async () => {
            const result = await checkDocker();
            expect(typeof result).toBe('boolean');
        });
    });
});

describe('SandboxConfig', () => {
    it('schema has correct defaults', async () => {
        const { SandboxConfigSchema } = await import('../src/config/schema.js');
        const defaults = SandboxConfigSchema.parse({});
        expect(defaults.enabled).toBe(true);
        expect(defaults.image).toBe('titan-sandbox');
        expect(defaults.timeoutMs).toBe(60000);
        expect(defaults.memoryMB).toBe(512);
        expect(defaults.deniedTools).toContain('shell');
        expect(defaults.deniedTools).toContain('code_exec');
    });

    it('is included in TitanConfigSchema', async () => {
        const { TitanConfigSchema } = await import('../src/config/schema.js');
        const config = TitanConfigSchema.parse({});
        expect(config.sandbox).toBeDefined();
        expect(config.sandbox.enabled).toBe(true);
    });
});
