/**
 * TITAN — Swarm Architecture Tests
 * Tests for src/agent/swarm.ts: getSwarmRouterTools, runSubAgent, domain mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/providers/router.js', () => ({
    chat: vi.fn().mockResolvedValue({ content: 'Sub-agent result', toolCalls: undefined }),
}));

vi.mock('../src/agent/toolRunner.js', () => ({
    executeTools: vi.fn().mockResolvedValue([]),
    getToolDefinitions: vi.fn().mockReturnValue([
        { type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: {} } },
        { type: 'function', function: { name: 'write_file', description: 'Write a file', parameters: {} } },
        { type: 'function', function: { name: 'web_search', description: 'Search the web', parameters: {} } },
        { type: 'function', function: { name: 'shell', description: 'Run shell command', parameters: {} } },
        { type: 'function', function: { name: 'memory_skill', description: 'Memory operations', parameters: {} } },
    ]),
}));

import { getSwarmRouterTools, runSubAgent, type Domain } from '../src/agent/swarm.js';
import { chat } from '../src/providers/router.js';
import { executeTools, getToolDefinitions } from '../src/agent/toolRunner.js';

describe('Swarm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset default mock behaviors
        vi.mocked(chat).mockResolvedValue({ content: 'Sub-agent result', toolCalls: undefined });
        vi.mocked(executeTools).mockResolvedValue([]);
    });

    // ─── getSwarmRouterTools ────────────────────────────────────────
    describe('getSwarmRouterTools', () => {
        it('returns exactly 4 tools', () => {
            const tools = getSwarmRouterTools();
            expect(tools.length).toBe(4);
        });

        it('includes file agent tool', () => {
            const tools = getSwarmRouterTools();
            const fileTool = tools.find(t => t.function.name === 'delegate_to_file_agent');
            expect(fileTool).toBeDefined();
        });

        it('includes web agent tool', () => {
            const tools = getSwarmRouterTools();
            const webTool = tools.find(t => t.function.name === 'delegate_to_web_agent');
            expect(webTool).toBeDefined();
        });

        it('includes system agent tool', () => {
            const tools = getSwarmRouterTools();
            const sysTool = tools.find(t => t.function.name === 'delegate_to_system_agent');
            expect(sysTool).toBeDefined();
        });

        it('includes memory agent tool', () => {
            const tools = getSwarmRouterTools();
            const memTool = tools.find(t => t.function.name === 'delegate_to_memory_agent');
            expect(memTool).toBeDefined();
        });

        it('each tool has correct type "function"', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                expect(tool.type).toBe('function');
            }
        });

        it('each tool has an instruction parameter', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                expect(tool.function.parameters).toHaveProperty('properties');
                expect((tool.function.parameters as any).properties).toHaveProperty('instruction');
            }
        });

        it('instruction is a required parameter', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                expect((tool.function.parameters as any).required).toContain('instruction');
            }
        });

        it('each tool has a description', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                expect(typeof tool.function.description).toBe('string');
                expect(tool.function.description.length).toBeGreaterThan(0);
            }
        });

        it('each tool has a unique name', () => {
            const tools = getSwarmRouterTools();
            const names = tools.map(t => t.function.name);
            expect(new Set(names).size).toBe(4);
        });

        it('returns consistent results on multiple calls', () => {
            const tools1 = getSwarmRouterTools();
            const tools2 = getSwarmRouterTools();
            expect(tools1.length).toBe(tools2.length);
            for (let i = 0; i < tools1.length; i++) {
                expect(tools1[i].function.name).toBe(tools2[i].function.name);
            }
        });
    });

    // ─── runSubAgent ────────────────────────────────────────────────
    describe('runSubAgent', () => {
        it('returns result for file domain', async () => {
            const result = await runSubAgent('file', 'Read /tmp/test.txt', 'openai/gpt-4o');
            expect(result).toContain('Sub-Agent Result');
            expect(result).toContain('file');
            expect(result).toContain('Sub-agent result');
        });

        it('returns result for web domain', async () => {
            const result = await runSubAgent('web', 'Search for TypeScript docs', 'openai/gpt-4o');
            expect(result).toContain('web');
            expect(result).toContain('Sub-agent result');
        });

        it('returns result for system domain', async () => {
            const result = await runSubAgent('system', 'Run ls -la', 'openai/gpt-4o');
            expect(result).toContain('system');
        });

        it('returns result for memory domain', async () => {
            const result = await runSubAgent('memory', 'Remember this fact', 'openai/gpt-4o');
            expect(result).toContain('memory');
        });

        it('calls chat with correct model', async () => {
            await runSubAgent('file', 'Test instruction', 'anthropic/claude-sonnet-4-20250514');
            expect(vi.mocked(chat)).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'anthropic/claude-sonnet-4-20250514' }),
            );
        });

        it('calls chat with system message containing domain', async () => {
            await runSubAgent('web', 'Search for X', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            const systemMsg = callArgs.messages.find((m: any) => m.role === 'system');
            expect(systemMsg).toBeDefined();
            expect(systemMsg!.content).toContain('WEB');
        });

        it('calls chat with user message containing instruction', async () => {
            await runSubAgent('file', 'Read the config file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            const userMsg = callArgs.messages.find((m: any) => m.role === 'user');
            expect(userMsg).toBeDefined();
            expect(userMsg!.content).toBe('Read the config file');
        });

        it('handles tool calls in response (executes and continues loop)', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'Running tool...',
                    toolCalls: [{ id: 'tc-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/tmp/x"}' } }],
                })
                .mockResolvedValueOnce({
                    content: 'File read successfully',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-1', name: 'read_file', content: 'file data', success: true, durationMs: 10 },
            ]);

            const result = await runSubAgent('file', 'Read a file', 'openai/gpt-4o');
            expect(result).toContain('File read successfully');
            expect(vi.mocked(chat)).toHaveBeenCalledTimes(2);
            expect(vi.mocked(executeTools)).toHaveBeenCalledTimes(1);
        });

        it('handles errors gracefully', async () => {
            vi.mocked(chat).mockRejectedValueOnce(new Error('API timeout'));
            const result = await runSubAgent('web', 'Search X', 'openai/gpt-4o');
            expect(result).toContain('error');
            expect(result).toContain('API timeout');
        });

        it('respects 3-round maximum', async () => {
            // Each round returns tool calls, forcing continuation
            vi.mocked(chat).mockResolvedValue({
                content: 'still working...',
                toolCalls: [{ id: 'tc', type: 'function', function: { name: 'shell', arguments: '{}' } }],
            });
            vi.mocked(executeTools).mockResolvedValue([
                { toolCallId: 'tc', name: 'shell', content: 'ok', success: true, durationMs: 5 },
            ]);

            const result = await runSubAgent('system', 'Do stuff', 'openai/gpt-4o');
            // Should stop after 3 rounds
            expect(vi.mocked(chat)).toHaveBeenCalledTimes(3);
            expect(result).toContain('Max sub-agent rounds');
        });

        it('handles empty content response', async () => {
            vi.mocked(chat).mockResolvedValueOnce({
                content: '',
                toolCalls: undefined,
            });
            const result = await runSubAgent('file', 'Do something', 'openai/gpt-4o');
            expect(result).toContain('Task completed silently');
        });

        it('passes domain-specific tools to chat', async () => {
            await runSubAgent('file', 'Read files', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            // Tools should be filtered for the file domain
            if (callArgs.tools) {
                for (const tool of callArgs.tools) {
                    // file domain tools: read_file, write_file
                    expect(['read_file', 'write_file', 'edit_file', 'list_dir', 'filesystem']).toContain(tool.function.name);
                }
            }
        });

        it('uses low temperature (0.2)', async () => {
            await runSubAgent('file', 'Read file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            expect(callArgs.temperature).toBe(0.2);
        });

        it('uses maxTokens of 4096', async () => {
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            expect(callArgs.maxTokens).toBe(4096);
        });

        it('includes domain name in result', async () => {
            const result = await runSubAgent('memory', 'Save fact', 'openai/gpt-4o');
            expect(result).toContain('Domain: memory');
        });

        it('handles multiple tool calls in single response', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'Executing multiple tools',
                    toolCalls: [
                        { id: 'tc-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/a"}' } },
                        { id: 'tc-2', type: 'function', function: { name: 'write_file', arguments: '{"path":"/b"}' } },
                    ],
                })
                .mockResolvedValueOnce({
                    content: 'All done',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-1', name: 'read_file', content: 'data1', success: true, durationMs: 5 },
                { toolCallId: 'tc-2', name: 'write_file', content: 'ok', success: true, durationMs: 5 },
            ]);

            const result = await runSubAgent('file', 'Read and write', 'openai/gpt-4o');
            expect(result).toContain('All done');
        });

        it('tool results are added to messages as tool role', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: '',
                    toolCalls: [{ id: 'tc-x', type: 'function', function: { name: 'shell', arguments: '{}' } }],
                })
                .mockResolvedValueOnce({
                    content: 'Final answer',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-x', name: 'shell', content: 'shell output', success: true, durationMs: 3 },
            ]);

            await runSubAgent('system', 'Run command', 'openai/gpt-4o');
            // Second chat call should have tool message in its messages
            const secondCallMessages = vi.mocked(chat).mock.calls[1][0].messages;
            const toolMsg = secondCallMessages.find((m: any) => m.role === 'tool');
            expect(toolMsg).toBeDefined();
            expect(toolMsg!.content).toBe('shell output');
        });

        it('passes undefined tools when domain has no matching tools', async () => {
            // Override getToolDefinitions to return empty
            vi.mocked(getToolDefinitions).mockReturnValueOnce([]);
            await runSubAgent('memory', 'Save fact', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            expect(callArgs.tools).toBeUndefined();
        });
    });

    // ─── Domain mapping ─────────────────────────────────────────────
    describe('Domain mapping', () => {
        it('read_file is mapped to file domain', async () => {
            await runSubAgent('file', 'Read file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).toContain('read_file');
            }
        });

        it('write_file is mapped to file domain', async () => {
            await runSubAgent('file', 'Write file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).toContain('write_file');
            }
        });

        it('web_search is mapped to web domain', async () => {
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).toContain('web_search');
            }
        });

        it('shell is mapped to system domain', async () => {
            await runSubAgent('system', 'Run cmd', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).toContain('shell');
            }
        });

        it('memory_skill is mapped to memory domain', async () => {
            await runSubAgent('memory', 'Remember X', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).toContain('memory_skill');
            }
        });

        it('file domain does not include web_search', async () => {
            await runSubAgent('file', 'Read', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('web_search');
            }
        });

        it('web domain does not include shell', async () => {
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('shell');
            }
        });

        it('system domain does not include read_file', async () => {
            await runSubAgent('system', 'Run', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('read_file');
            }
        });

        it('memory domain does not include write_file', async () => {
            await runSubAgent('memory', 'Save', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('write_file');
            }
        });

        it('unrecognized tools default to file domain', async () => {
            // Add an unrecognized tool
            vi.mocked(getToolDefinitions).mockReturnValueOnce([
                { type: 'function', function: { name: 'unknown_tool', description: 'Unknown', parameters: {} } },
                { type: 'function', function: { name: 'read_file', description: 'Read', parameters: {} } },
            ]);
            await runSubAgent('file', 'Do stuff', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                // unknown_tool defaults to 'file' domain
                expect(toolNames).toContain('unknown_tool');
            }
        });
    });
});
