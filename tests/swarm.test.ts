/**
 * TITAN — Swarm Architecture Tests
 * Tests for src/agent/swarm.ts: getSwarmRouterTools, runSubAgent, domain mapping,
 * multi-round execution, error handling, concurrent agents, and edge cases.
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
import logger from '../src/utils/logger.js';

describe('Swarm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset default mock behaviors
        vi.mocked(chat).mockResolvedValue({ content: 'Sub-agent result', toolCalls: undefined });
        vi.mocked(executeTools).mockResolvedValue([]);
        vi.mocked(getToolDefinitions).mockReturnValue([
            { type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: {} } },
            { type: 'function', function: { name: 'write_file', description: 'Write a file', parameters: {} } },
            { type: 'function', function: { name: 'web_search', description: 'Search the web', parameters: {} } },
            { type: 'function', function: { name: 'shell', description: 'Run shell command', parameters: {} } },
            { type: 'function', function: { name: 'memory_skill', description: 'Memory operations', parameters: {} } },
        ]);
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

        it('file agent description mentions file system operations', () => {
            const tools = getSwarmRouterTools();
            const fileTool = tools.find(t => t.function.name === 'delegate_to_file_agent')!;
            const desc = fileTool.function.description.toLowerCase();
            expect(desc).toMatch(/file|read|writ|director/);
        });

        it('web agent description mentions web operations', () => {
            const tools = getSwarmRouterTools();
            const webTool = tools.find(t => t.function.name === 'delegate_to_web_agent')!;
            const desc = webTool.function.description.toLowerCase();
            expect(desc).toMatch(/web|search|url|browser/);
        });

        it('system agent description mentions shell or process operations', () => {
            const tools = getSwarmRouterTools();
            const sysTool = tools.find(t => t.function.name === 'delegate_to_system_agent')!;
            const desc = sysTool.function.description.toLowerCase();
            expect(desc).toMatch(/shell|command|process|os/);
        });

        it('memory agent description mentions memory or knowledge', () => {
            const tools = getSwarmRouterTools();
            const memTool = tools.find(t => t.function.name === 'delegate_to_memory_agent')!;
            const desc = memTool.function.description.toLowerCase();
            expect(desc).toMatch(/memory|fact|knowledge|sav/);
        });

        it('instruction parameter has type string', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                const instrDef = (tool.function.parameters as any).properties.instruction;
                expect(instrDef.type).toBe('string');
            }
        });

        it('instruction parameter has a description', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                const instrDef = (tool.function.parameters as any).properties.instruction;
                expect(typeof instrDef.description).toBe('string');
                expect(instrDef.description.length).toBeGreaterThan(0);
            }
        });

        it('all tool names follow delegate_to_*_agent pattern', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                expect(tool.function.name).toMatch(/^delegate_to_\w+_agent$/);
            }
        });

        it('parameters use type "object"', () => {
            const tools = getSwarmRouterTools();
            for (const tool of tools) {
                expect((tool.function.parameters as any).type).toBe('object');
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

        it('logs info when spawning a sub-agent', async () => {
            await runSubAgent('file', 'Read something', 'openai/gpt-4o');
            expect(logger.info).toHaveBeenCalledWith(
                'Swarm',
                expect.stringContaining('FILE Sub-Agent'),
            );
        });

        it('logs debug for each round', async () => {
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            expect(logger.debug).toHaveBeenCalledWith(
                'Swarm',
                expect.stringContaining('Round 1'),
            );
        });

        it('logs error when chat throws', async () => {
            vi.mocked(chat).mockRejectedValueOnce(new Error('Connection refused'));
            await runSubAgent('system', 'Run cmd', 'openai/gpt-4o');
            expect(logger.error).toHaveBeenCalledWith(
                'Swarm',
                expect.stringContaining('Connection refused'),
            );
        });

        it('system message includes the instruction text', async () => {
            await runSubAgent('file', 'Read /etc/hosts file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            const systemMsg = callArgs.messages.find((m: any) => m.role === 'system');
            expect(systemMsg!.content).toContain('Read /etc/hosts file');
        });

        it('system message identifies the correct domain sub-agent', async () => {
            for (const domain of ['file', 'web', 'system', 'memory'] as Domain[]) {
                vi.clearAllMocks();
                vi.mocked(chat).mockResolvedValue({ content: 'ok', toolCalls: undefined });
                await runSubAgent(domain, 'test', 'openai/gpt-4o');
                const callArgs = vi.mocked(chat).mock.calls[0][0];
                const systemMsg = callArgs.messages.find((m: any) => m.role === 'system');
                expect(systemMsg!.content).toContain(domain.toUpperCase());
            }
        });

        it('assistant message with tool calls is added to conversation', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'Calling tool',
                    toolCalls: [{ id: 'tc-1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
                })
                .mockResolvedValueOnce({
                    content: 'Done',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-1', name: 'read_file', content: 'data', success: true, durationMs: 5 },
            ]);

            await runSubAgent('file', 'Read file', 'openai/gpt-4o');

            const secondCallMessages = vi.mocked(chat).mock.calls[1][0].messages;
            const assistantMsg = secondCallMessages.find((m: any) => m.role === 'assistant' && m.toolCalls);
            expect(assistantMsg).toBeDefined();
            expect(assistantMsg!.toolCalls).toHaveLength(1);
            expect(assistantMsg!.toolCalls![0].id).toBe('tc-1');
        });

        it('handles null content from chat gracefully', async () => {
            vi.mocked(chat).mockResolvedValueOnce({
                content: null as any,
                toolCalls: undefined,
            });
            const result = await runSubAgent('file', 'Do something', 'openai/gpt-4o');
            expect(result).toContain('Task completed silently');
        });

        it('handles executeTools returning failed results', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'Trying',
                    toolCalls: [{ id: 'tc-fail', type: 'function', function: { name: 'shell', arguments: '{}' } }],
                })
                .mockResolvedValueOnce({
                    content: 'Handled failure',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-fail', name: 'shell', content: 'Error: permission denied', success: false, durationMs: 5 },
            ]);

            const result = await runSubAgent('system', 'Run cmd', 'openai/gpt-4o');
            expect(result).toContain('Handled failure');
        });

        it('preserves tool call ID in messages for proper correlation', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: '',
                    toolCalls: [{ id: 'unique-id-123', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
                })
                .mockResolvedValueOnce({
                    content: 'Final',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'unique-id-123', name: 'read_file', content: 'data', success: true, durationMs: 5 },
            ]);

            await runSubAgent('file', 'Read', 'openai/gpt-4o');

            const secondCallMessages = vi.mocked(chat).mock.calls[1][0].messages;
            const toolMsg = secondCallMessages.find((m: any) => m.role === 'tool');
            expect(toolMsg!.toolCallId).toBe('unique-id-123');
        });

        it('error in round 2 after successful round 1 returns error result', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'Round 1',
                    toolCalls: [{ id: 'tc-1', type: 'function', function: { name: 'shell', arguments: '{}' } }],
                })
                .mockRejectedValueOnce(new Error('Round 2 failure'));
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-1', name: 'shell', content: 'ok', success: true, durationMs: 5 },
            ]);

            const result = await runSubAgent('system', 'Multi step', 'openai/gpt-4o');
            expect(result).toContain('error');
            expect(result).toContain('Round 2 failure');
        });

        it('result format starts with [Sub-Agent Result', async () => {
            const result = await runSubAgent('file', 'Test', 'openai/gpt-4o');
            expect(result).toMatch(/^\[Sub-Agent Result/);
        });

        it('each tool result is added as separate message', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'Multi tools',
                    toolCalls: [
                        { id: 'tc-a', type: 'function', function: { name: 'read_file', arguments: '{}' } },
                        { id: 'tc-b', type: 'function', function: { name: 'write_file', arguments: '{}' } },
                    ],
                })
                .mockResolvedValueOnce({
                    content: 'Done',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc-a', name: 'read_file', content: 'data-a', success: true, durationMs: 5 },
                { toolCallId: 'tc-b', name: 'write_file', content: 'data-b', success: true, durationMs: 5 },
            ]);

            await runSubAgent('file', 'Multi', 'openai/gpt-4o');

            const secondCallMessages = vi.mocked(chat).mock.calls[1][0].messages;
            const toolMsgs = secondCallMessages.filter((m: any) => m.role === 'tool');
            expect(toolMsgs).toHaveLength(2);
            expect(toolMsgs[0].content).toBe('data-a');
            expect(toolMsgs[1].content).toBe('data-b');
        });

        it('exactly 3 rounds of tool calls returns max rounds message', async () => {
            vi.mocked(chat).mockResolvedValue({
                content: 'working',
                toolCalls: [{ id: 'tc', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
            });
            vi.mocked(executeTools).mockResolvedValue([
                { toolCallId: 'tc', name: 'read_file', content: 'ok', success: true, durationMs: 5 },
            ]);

            const result = await runSubAgent('file', 'Lots of work', 'openai/gpt-4o');
            expect(vi.mocked(chat)).toHaveBeenCalledTimes(3);
            expect(result).toContain('Max sub-agent rounds reached');
            expect(result).toContain('Partial results');
        });

        it('completes in 2 rounds if tool calls stop on round 2', async () => {
            vi.mocked(chat)
                .mockResolvedValueOnce({
                    content: 'round 1',
                    toolCalls: [{ id: 'tc1', type: 'function', function: { name: 'shell', arguments: '{}' } }],
                })
                .mockResolvedValueOnce({
                    content: 'Final result after 2 rounds',
                    toolCalls: undefined,
                });
            vi.mocked(executeTools).mockResolvedValueOnce([
                { toolCallId: 'tc1', name: 'shell', content: 'ok', success: true, durationMs: 5 },
            ]);

            const result = await runSubAgent('system', 'Two step task', 'openai/gpt-4o');
            expect(vi.mocked(chat)).toHaveBeenCalledTimes(2);
            expect(result).toContain('Final result after 2 rounds');
            expect(result).not.toContain('Max sub-agent rounds');
        });
    });

    // ─── Concurrent sub-agents ─────────────────────────────────────
    describe('concurrent sub-agents', () => {
        it('multiple sub-agents can run in parallel', async () => {
            vi.mocked(chat).mockResolvedValue({ content: 'Result from agent', toolCalls: undefined });

            const results = await Promise.all([
                runSubAgent('file', 'Read /a', 'openai/gpt-4o'),
                runSubAgent('web', 'Search B', 'openai/gpt-4o'),
                runSubAgent('system', 'Run cmd', 'openai/gpt-4o'),
                runSubAgent('memory', 'Save fact', 'openai/gpt-4o'),
            ]);

            expect(results).toHaveLength(4);
            expect(results[0]).toContain('Domain: file');
            expect(results[1]).toContain('Domain: web');
            expect(results[2]).toContain('Domain: system');
            expect(results[3]).toContain('Domain: memory');
            expect(vi.mocked(chat)).toHaveBeenCalledTimes(4);
        });

        it('one failing sub-agent does not block others', async () => {
            let callCount = 0;
            vi.mocked(chat).mockImplementation(async () => {
                callCount++;
                if (callCount === 2) throw new Error('One agent failed');
                return { content: 'Success', toolCalls: undefined };
            });

            const results = await Promise.all([
                runSubAgent('file', 'Read', 'openai/gpt-4o'),
                runSubAgent('web', 'Search', 'openai/gpt-4o'),
                runSubAgent('system', 'Run', 'openai/gpt-4o'),
            ]);

            // All should resolve (no unhandled rejections)
            expect(results).toHaveLength(3);
            expect(results[0]).toContain('Success');
            expect(results[1]).toContain('error');
            expect(results[2]).toContain('Success');
        });

        it('concurrent agents use independent message histories', async () => {
            let fileCallCount = 0;
            let webCallCount = 0;

            vi.mocked(chat).mockImplementation(async (args: any) => {
                const systemMsg = args.messages.find((m: any) => m.role === 'system');
                if (systemMsg?.content?.includes('FILE')) {
                    fileCallCount++;
                    if (fileCallCount === 1) {
                        return {
                            content: 'File tool',
                            toolCalls: [{ id: 'tc-file', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
                        };
                    }
                    return { content: 'File done', toolCalls: undefined };
                }
                webCallCount++;
                return { content: 'Web done immediately', toolCalls: undefined };
            });

            vi.mocked(executeTools).mockResolvedValue([
                { toolCallId: 'tc-file', name: 'read_file', content: 'data', success: true, durationMs: 5 },
            ]);

            const [fileResult, webResult] = await Promise.all([
                runSubAgent('file', 'Read file', 'openai/gpt-4o'),
                runSubAgent('web', 'Search web', 'openai/gpt-4o'),
            ]);

            expect(fileResult).toContain('File done');
            expect(webResult).toContain('Web done immediately');
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

        it('file domain does not include shell', async () => {
            await runSubAgent('file', 'Read file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('shell');
            }
        });

        it('file domain does not include memory_skill', async () => {
            await runSubAgent('file', 'Read file', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('memory_skill');
            }
        });

        it('web domain does not include read_file', async () => {
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('read_file');
            }
        });

        it('web domain does not include memory_skill', async () => {
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('memory_skill');
            }
        });

        it('system domain does not include web_search', async () => {
            await runSubAgent('system', 'Run', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('web_search');
            }
        });

        it('system domain does not include memory_skill', async () => {
            await runSubAgent('system', 'Run', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('memory_skill');
            }
        });

        it('memory domain does not include shell', async () => {
            await runSubAgent('memory', 'Save', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                expect(toolNames).not.toContain('shell');
            }
        });

        it('unrecognized tools do NOT appear in web domain', async () => {
            vi.mocked(getToolDefinitions).mockReturnValueOnce([
                { type: 'function', function: { name: 'unknown_tool', description: 'Unknown', parameters: {} } },
                { type: 'function', function: { name: 'web_search', description: 'Search', parameters: {} } },
            ]);
            await runSubAgent('web', 'Search', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            if (callArgs.tools && callArgs.tools.length > 0) {
                const toolNames = callArgs.tools.map((t: any) => t.function.name);
                // unknown_tool defaults to file domain, should NOT appear in web
                expect(toolNames).not.toContain('unknown_tool');
            }
        });

        it('all known file domain tools are included for file agent', async () => {
            vi.mocked(getToolDefinitions).mockReturnValueOnce([
                { type: 'function', function: { name: 'read_file', description: 'Read', parameters: {} } },
                { type: 'function', function: { name: 'write_file', description: 'Write', parameters: {} } },
                { type: 'function', function: { name: 'edit_file', description: 'Edit', parameters: {} } },
                { type: 'function', function: { name: 'list_dir', description: 'List', parameters: {} } },
                { type: 'function', function: { name: 'filesystem', description: 'FS', parameters: {} } },
            ]);
            await runSubAgent('file', 'Work with files', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            expect(callArgs.tools).toBeDefined();
            expect(callArgs.tools!.length).toBe(5);
        });

        it('all known web domain tools are included for web agent', async () => {
            vi.mocked(getToolDefinitions).mockReturnValueOnce([
                { type: 'function', function: { name: 'web_search', description: 'Search', parameters: {} } },
                { type: 'function', function: { name: 'web_fetch', description: 'Fetch', parameters: {} } },
                { type: 'function', function: { name: 'webhook', description: 'Hook', parameters: {} } },
                { type: 'function', function: { name: 'browser', description: 'Browser', parameters: {} } },
            ]);
            await runSubAgent('web', 'Web tasks', 'openai/gpt-4o');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            expect(callArgs.tools).toBeDefined();
            expect(callArgs.tools!.length).toBe(4);
        });
    });

    // ─── Edge cases ────────────────────────────────────────────────
    describe('edge cases', () => {
        it('handles very long instruction string', async () => {
            const longInstruction = 'A'.repeat(10000);
            const result = await runSubAgent('file', longInstruction, 'openai/gpt-4o');
            expect(result).toContain('Domain: file');
        });

        it('handles empty string instruction', async () => {
            const result = await runSubAgent('file', '', 'openai/gpt-4o');
            expect(result).toContain('Domain: file');
        });

        it('handles instruction with special characters', async () => {
            const result = await runSubAgent('file', 'Read file with <html> & "quotes"', 'openai/gpt-4o');
            expect(result).toContain('Domain: file');
            const callArgs = vi.mocked(chat).mock.calls[0][0];
            const userMsg = callArgs.messages.find((m: any) => m.role === 'user');
            expect(userMsg!.content).toContain('<html>');
        });

        it('handles chat returning empty toolCalls array', async () => {
            vi.mocked(chat).mockResolvedValueOnce({
                content: 'No tools needed',
                toolCalls: [],
            });
            const result = await runSubAgent('file', 'Simple task', 'openai/gpt-4o');
            expect(result).toContain('No tools needed');
            expect(vi.mocked(executeTools)).not.toHaveBeenCalled();
        });

        it('handles different model strings correctly', async () => {
            const models = [
                'openai/gpt-4o',
                'anthropic/claude-sonnet-4-20250514',
                'google/gemini-pro',
                'kimi-k2.5:cloud',
            ];
            for (const model of models) {
                vi.clearAllMocks();
                vi.mocked(chat).mockResolvedValue({ content: 'ok', toolCalls: undefined });
                await runSubAgent('file', 'Test', model);
                expect(vi.mocked(chat)).toHaveBeenCalledWith(
                    expect.objectContaining({ model }),
                );
            }
        });
    });
});
