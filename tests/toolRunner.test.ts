import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/config/config.js', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        loadConfig: vi.fn().mockReturnValue({
            ...actual.getDefaultConfig(),
            security: {
                ...actual.getDefaultConfig().security,
                commandTimeout: 100,  // fast timeout for test
                deniedTools: [],
                allowedTools: [],     // empty = allow all registered tools
            },
        }),
        resetConfigCache: vi.fn(),
    };
});

import {
    registerTool, unregisterTool, getRegisteredTools, getToolDefinitions, executeTool,
} from '../src/agent/toolRunner.js';
import type { ToolCall } from '../src/providers/base.js';

function makeCall(name: string, args: Record<string, unknown> = {}): ToolCall {
    return { id: 'tc-1', type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

const ECHO = 'test_echo_titan';
const SLOW = 'test_slow_titan';

describe('ToolRunner', () => {
    beforeEach(() => {
        registerTool({
            name: ECHO,
            description: 'Echo tool for tests',
            parameters: { type: 'object', properties: { msg: { type: 'string' } } },
            execute: async (args) => `echo:${args.msg ?? 'empty'}`,
        });
    });

    afterEach(() => {
        unregisterTool(ECHO);
        unregisterTool(SLOW);
    });

    it('registerTool adds tool to registry', () => {
        const found = getRegisteredTools().find(t => t.name === ECHO);
        expect(found).toBeDefined();
        expect(found!.description).toBe('Echo tool for tests');
    });

    it('getToolDefinitions returns correct schema shape', () => {
        const defs = getToolDefinitions();
        if (defs.length > 0) {
            expect(defs[0]).toHaveProperty('type', 'function');
            expect(defs[0].function).toHaveProperty('name');
            expect(defs[0].function).toHaveProperty('description');
            expect(defs[0].function).toHaveProperty('parameters');
        }
    });

    it('executeTool: valid tool succeeds', async () => {
        const result = await executeTool(makeCall(ECHO, { msg: 'hello' }));
        expect(result.success).toBe(true);
        expect(result.content).toBe('echo:hello');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('executeTool: unknown tool returns success=false', async () => {
        const result = await executeTool(makeCall('non_existent_tool_xyz'));
        expect(result.success).toBe(false);
        expect(result.content).toMatch(/unknown tool/i);
    });

    it('executeTool: timed-out tool returns timeout error', async () => {
        registerTool({
            name: SLOW,
            description: 'Slow tool',
            parameters: { type: 'object', properties: {} },
            execute: () => new Promise(r => setTimeout(() => r('done'), 60000)),
        });
        const result = await executeTool(makeCall(SLOW));
        expect(result.success).toBe(false);
        expect(result.content).toMatch(/timed out/i);
    }, 10000);
});
