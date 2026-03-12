/**
 * TITAN — Research Pipeline Skill Tests
 * Tests for:
 *   - Skill registration (both tools)
 *   - Question decomposition via LLM
 *   - Parallel sub-agent spawning
 *   - Result synthesis
 *   - Structured report output
 *   - Graceful sub-agent failure handling
 *   - Depth preset enforcement
 *   - Non-JSON LLM fallback parsing
 *   - Intermediate result compression
 *   - Pipeline status tracking
 *   - Parameter validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        agent: { model: 'test-model', modelAliases: { fast: 'fast-model' } },
        researchPipeline: { enabled: true, maxParallelAgents: 3, compressIntermediateResults: true },
    }),
}));

vi.mock('../src/skills/registry.js', () => {
    const tools: Array<{ meta: unknown; tool: unknown }> = [];
    return {
        registerSkill: vi.fn((meta: unknown, tool: unknown) => tools.push({ meta, tool })),
        _getRegisteredTools: () => tools,
    };
});

const mockChat = vi.fn();
vi.mock('../src/providers/router.js', () => ({
    chat: (...args: unknown[]) => mockChat(...args),
}));

const mockSpawnSubAgent = vi.fn();
vi.mock('../src/agent/subAgent.js', () => ({
    spawnSubAgent: (...args: unknown[]) => mockSpawnSubAgent(...args),
    SUB_AGENT_TEMPLATES: {
        researcher: {
            name: 'Researcher',
            tools: ['web_search'],
            systemPrompt: 'Research',
        },
    },
}));

vi.mock('../src/skills/builtin/deep_research.js', () => ({
    buildResearchPrompt: vi.fn().mockReturnValue('research prompt'),
    formatCitations: vi.fn().mockReturnValue('formatted citations'),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { registerResearchPipelineSkill } from '../src/skills/builtin/research_pipeline.js';
import { registerSkill } from '../src/skills/registry.js';
import { formatCitations } from '../src/skills/builtin/deep_research.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the execute function for a named tool from registerSkill calls */
function getToolExecute(toolName: string): (args: Record<string, unknown>) => Promise<string> {
    const calls = (registerSkill as ReturnType<typeof vi.fn>).mock.calls;
    for (const [, tool] of calls) {
        if ((tool as { name: string }).name === toolName) {
            return (tool as { execute: (args: Record<string, unknown>) => Promise<string> }).execute;
        }
    }
    throw new Error(`Tool "${toolName}" not found in registerSkill calls`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Research Pipeline Skill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerResearchPipelineSkill();
    });

    // ── 1. Registration ──────────────────────────────────────────────

    describe('Registration', () => {
        it('registers both deep_research_pipeline and research_pipeline_status tools', () => {
            const calls = (registerSkill as ReturnType<typeof vi.fn>).mock.calls;
            const toolNames = calls.map(([, tool]: [unknown, { name: string }]) => tool.name);
            expect(toolNames).toContain('deep_research_pipeline');
            expect(toolNames).toContain('research_pipeline_status');
        });
    });

    // ── 2. Decomposes question ───────────────────────────────────────

    describe('deep_research_pipeline', () => {
        it('decomposes question into sub-questions via LLM', async () => {
            mockChat
                .mockResolvedValueOnce({ content: '["What is X?", "How does X work?", "Why is X important?"]' })
                .mockResolvedValueOnce({ content: '## Executive Summary\nSynthesized.' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Finding' });

            const execute = getToolExecute('deep_research_pipeline');
            await execute({ question: 'What is quantum computing?' });

            // First chat call = decomposition, second = synthesis
            expect(mockChat).toHaveBeenCalledTimes(2);
            const decomposeCall = mockChat.mock.calls[0][0];
            expect(decomposeCall.model).toBe('fast-model');
            expect(decomposeCall.messages[1].content).toBe('What is quantum computing?');
        });

        // ── 3. Spawns parallel sub-agents ────────────────────────────

        it('spawns parallel sub-agents (one per sub-question)', async () => {
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?", "Q3?"]' })
                .mockResolvedValueOnce({ content: 'Synthesis' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Agent output' });

            const execute = getToolExecute('deep_research_pipeline');
            await execute({ question: 'Test question' });

            expect(mockSpawnSubAgent).toHaveBeenCalledTimes(3);
            for (let i = 0; i < 3; i++) {
                expect(mockSpawnSubAgent.mock.calls[i][0]).toMatchObject({
                    name: `Researcher-${i + 1}`,
                    task: 'research prompt',
                    tools: ['web_search'],
                });
            }
        });

        // ── 4. Synthesizes results ───────────────────────────────────

        it('synthesizes results from all sub-agents', async () => {
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?"]' })
                .mockResolvedValueOnce({ content: '## Executive Summary\nCombined.' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Findings' });

            const execute = getToolExecute('deep_research_pipeline');
            await execute({ question: 'Synthesis test', depth: 'quick' });

            // Second chat call is synthesis
            const synthCall = mockChat.mock.calls[1][0];
            expect(synthCall.messages[0].content).toContain('synthesis');
            expect(synthCall.messages[1].content).toContain('Synthesis test');
            expect(synthCall.messages[1].content).toContain('Sub-question 1');
        });

        // ── 5. Returns structured report ─────────────────────────────

        it('returns structured report with executive summary', async () => {
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?", "Q3?"]' })
                .mockResolvedValueOnce({ content: '## Executive Summary\nKey findings here.' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Result' });

            const execute = getToolExecute('deep_research_pipeline');
            const report = await execute({ question: 'Climate change impacts' });

            expect(report).toContain('# Research Pipeline Report');
            expect(report).toContain('Climate change impacts');
            expect(report).toContain('Sub-Agent Summary');
            expect(report).toContain('## Executive Summary');
            expect(report).toContain('**Status:** completed');
        });

        // ── 6. Handles sub-agent failure gracefully ──────────────────

        it('handles sub-agent failure gracefully (partial results)', async () => {
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?", "Q3?"]' })
                .mockResolvedValueOnce({ content: 'Partial synthesis' });
            mockSpawnSubAgent
                .mockResolvedValueOnce({ success: true, content: 'Good result' })
                .mockRejectedValueOnce(new Error('Agent 2 timed out'))
                .mockResolvedValueOnce({ success: true, content: 'Another good result' });

            const execute = getToolExecute('deep_research_pipeline');
            const report = await execute({ question: 'Partial failure test' });

            expect(report).toContain('# Research Pipeline Report');
            expect(report).toContain('1 of 3 sub-agents failed');
            expect(report).toContain('completed');
        });

        // ── 7. Respects depth presets ────────────────────────────────

        it('respects depth presets (quick=2 sub-questions, deep=4)', async () => {
            // Quick: 2 sub-questions, maxRounds 3
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?"]' })
                .mockResolvedValueOnce({ content: 'Quick synthesis' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Result' });

            const execute = getToolExecute('deep_research_pipeline');
            await execute({ question: 'Quick test', depth: 'quick' });

            const decomposeCall = mockChat.mock.calls[0][0];
            expect(decomposeCall.messages[0].content).toContain('2');
            expect(mockSpawnSubAgent).toHaveBeenCalledTimes(2);
            expect(mockSpawnSubAgent.mock.calls[0][0].maxRounds).toBe(3);

            // Reset for deep
            vi.clearAllMocks();
            registerResearchPipelineSkill();

            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?", "Q3?", "Q4?"]' })
                .mockResolvedValueOnce({ content: 'Deep synthesis' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Deep result' });

            await execute({ question: 'Deep test', depth: 'deep' });

            const deepCall = mockChat.mock.calls[0][0];
            expect(deepCall.messages[0].content).toContain('4');
            expect(mockSpawnSubAgent).toHaveBeenCalledTimes(4);
            expect(mockSpawnSubAgent.mock.calls[0][0].maxRounds).toBe(10);
        });

        // ── 8. Falls back on non-JSON sub-questions ──────────────────

        it('falls back when LLM returns non-JSON sub-questions', async () => {
            mockChat
                .mockResolvedValueOnce({
                    content:
                        '1. What is the current state of AI safety?\n' +
                        '2. What are key challenges around AI safety?\n' +
                        '3. What do experts predict about AI safety?',
                })
                .mockResolvedValueOnce({ content: 'Synthesized' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Result' });

            const execute = getToolExecute('deep_research_pipeline');
            const report = await execute({ question: 'AI safety' });

            expect(mockSpawnSubAgent).toHaveBeenCalledTimes(3);
            expect(report).toContain('completed');
        });

        // ── 9. Compresses intermediate results ───────────────────────

        it('compresses intermediate results when threshold exceeded', async () => {
            const longContent = 'A'.repeat(4000); // Exceeds default 3000 threshold
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?", "Q3?"]' })
                .mockResolvedValueOnce({ content: 'Synthesized from compressed' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: longContent });
            (formatCitations as ReturnType<typeof vi.fn>).mockReturnValue(longContent);

            const execute = getToolExecute('deep_research_pipeline');
            await execute({ question: 'Compression test' });

            // Synthesis call should contain truncated content
            const synthCall = mockChat.mock.calls[1][0];
            expect(synthCall.messages[1].content).toContain('truncated for synthesis');
        });

        // ── 12. Requires question parameter ──────────────────────────

        it('requires question parameter', () => {
            const calls = (registerSkill as ReturnType<typeof vi.fn>).mock.calls;
            const pipelineCall = calls.find(
                ([, tool]: [unknown, { name: string }]) => tool.name === 'deep_research_pipeline',
            );
            const params = (pipelineCall![1] as { parameters: { required: string[] } }).parameters;
            expect(params.required).toContain('question');
        });

        // ── Extra: invalid depth returns error ───────────────────────

        it('returns error for invalid depth preset', async () => {
            const execute = getToolExecute('deep_research_pipeline');
            const result = await execute({ question: 'Test', depth: 'ultra' });
            expect(result).toContain('Error: Invalid depth');
            expect(result).toContain('ultra');
        });

        // ── Extra: all sub-agents fail → pipeline fails ──────────────

        it('returns error when all sub-agents fail', async () => {
            mockChat.mockResolvedValueOnce({ content: '["Q1?", "Q2?", "Q3?"]' });
            mockSpawnSubAgent.mockRejectedValue(new Error('Agent crashed'));

            const execute = getToolExecute('deep_research_pipeline');
            const result = await execute({ question: 'Total failure' });

            expect(result).toContain('all 3 sub-agents failed');
        });
    });

    // ── 10. research_pipeline_status — no active pipelines ───────────

    describe('research_pipeline_status', () => {
        it('returns "no active pipelines" when none running', async () => {
            const execute = getToolExecute('research_pipeline_status');
            const result = await execute({ pipelineId: 'nonexistent-id' });
            expect(result).toContain('No pipeline found');
        });

        // ── 11. Returns status of active pipeline by ID ──────────────

        it('returns status of active pipeline by ID', async () => {
            // Start a pipeline to populate state
            mockChat
                .mockResolvedValueOnce({ content: '["Q1?", "Q2?"]' })
                .mockResolvedValueOnce({ content: 'Synthesis' });
            mockSpawnSubAgent.mockResolvedValue({ success: true, content: 'Done' });

            const pipelineExec = getToolExecute('deep_research_pipeline');
            await pipelineExec({ question: 'Status tracking test', depth: 'quick' });

            const statusExec = getToolExecute('research_pipeline_status');

            // List all pipelines (no ID)
            const allStatus = await statusExec({});
            expect(allStatus).toContain('Research Pipelines');

            // Extract the latest pipeline ID and query by it
            const idMatches = [...allStatus.matchAll(/\*\*(pipeline-\d+)\*\*/g)];
            expect(idMatches.length).toBeGreaterThan(0);
            const latestId = idMatches[idMatches.length - 1][1];

            const specificStatus = await statusExec({ pipelineId: latestId });
            expect(specificStatus).toContain('Status tracking test');
            expect(specificStatus).toContain('Stage');
            expect(specificStatus).toContain('completed');
        });

        it('returns not-found message for unknown pipeline ID', async () => {
            const execute = getToolExecute('research_pipeline_status');
            const result = await execute({ pipelineId: 'pipeline-does-not-exist' });
            expect(result).toContain('No pipeline found');
            expect(result).toContain('pipeline-does-not-exist');
        });
    });
});
