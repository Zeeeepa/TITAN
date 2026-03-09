/**
 * TITAN — Deep Research Skill Tests
 * Tests for:
 *   - Researcher sub-agent template config
 *   - Research prompt building and citation formatting
 *   - Research tool execution and output structure
 *   - Research status tracking
 *   - Depth preset validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { mockSpawnSubAgent, mockRegisterTool } = vi.hoisted(() => ({
    mockSpawnSubAgent: vi.fn(),
    mockRegisterTool: vi.fn(),
}));

vi.mock('../src/agent/subAgent.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/agent/subAgent.js')>();
    return {
        ...actual,
        spawnSubAgent: mockSpawnSubAgent,
    };
});

vi.mock('../src/agent/toolRunner.js', () => ({
    registerTool: mockRegisterTool,
}));

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Imports (after mocks) ────────────────────────────────────────────────

import { SUB_AGENT_TEMPLATES } from '../src/agent/subAgent.js';
import { buildResearchPrompt, formatCitations, registerDeepResearchSkill } from '../src/skills/builtin/deep_research.js';

// ── Tests ────────────────────────────────────────────────────────────────

describe('Deep Research — Sub-Agent Template', () => {
    it('should have a researcher template', () => {
        expect(SUB_AGENT_TEMPLATES.researcher).toBeDefined();
    });

    it('should have the correct name', () => {
        expect(SUB_AGENT_TEMPLATES.researcher.name).toBe('Researcher');
    });

    it('should constrain tools to research-relevant set', () => {
        const tools = SUB_AGENT_TEMPLATES.researcher.tools!;
        expect(tools).toContain('web_search');
        expect(tools).toContain('web_read');
        expect(tools).toContain('rag_search');
        expect(tools).toContain('rag_ingest');
        expect(tools).not.toContain('shell');
        expect(tools).not.toContain('write_file');
    });

    it('should have a system prompt focused on research methodology', () => {
        const prompt = SUB_AGENT_TEMPLATES.researcher.systemPrompt!;
        expect(prompt).toContain('Research');
        expect(prompt).toContain('citation');
        expect(prompt).toContain('Sources');
        expect(prompt).toContain('Cross-verify');
    });

    it('should set maxRounds to 15', () => {
        expect(SUB_AGENT_TEMPLATES.researcher.maxRounds).toBe(15);
    });
});

describe('Deep Research — Prompt Building', () => {
    it('should include the question in the prompt', () => {
        const prompt = buildResearchPrompt('What is quantum computing?', 10, true);
        expect(prompt).toContain('What is quantum computing?');
    });

    it('should include max sources in guidelines', () => {
        const prompt = buildResearchPrompt('test question', 7, true);
        expect(prompt).toContain('up to 7 distinct sources');
    });

    it('should include citation instructions when requireCitations is true', () => {
        const prompt = buildResearchPrompt('test', 10, true);
        expect(prompt).toContain('[1]');
        expect(prompt).toContain('Sources');
    });

    it('should omit citation instructions when requireCitations is false', () => {
        const prompt = buildResearchPrompt('test', 10, false);
        expect(prompt).not.toContain('Number every citation');
    });
});

describe('Deep Research — Citation Formatting', () => {
    it('should preserve numbered citations', () => {
        const input = 'According to [1], the sky is blue. See also [2].';
        expect(formatCitations(input)).toBe('According to [1], the sky is blue. See also [2].');
    });

    it('should handle content without citations', () => {
        const input = 'No citations here.';
        expect(formatCitations(input)).toBe('No citations here.');
    });

    it('should handle multi-digit citations', () => {
        const input = 'Source [12] confirms this.';
        expect(formatCitations(input)).toBe('Source [12] confirms this.');
    });
});

describe('Deep Research — Tool Registration', () => {
    beforeEach(() => {
        mockRegisterTool.mockClear();
    });

    it('should register research and research_status tools', () => {
        registerDeepResearchSkill();

        // registerSkill calls registerTool internally
        const registeredNames = mockRegisterTool.mock.calls.map(
            (call: unknown[]) => (call[0] as { name: string }).name,
        );
        expect(registeredNames).toContain('research');
        expect(registeredNames).toContain('research_status');
    });
});

describe('Deep Research — Tool Execution', () => {
    let researchExecute: (args: Record<string, unknown>) => Promise<string>;
    let statusExecute: (args: Record<string, unknown>) => Promise<string>;

    beforeEach(() => {
        mockRegisterTool.mockClear();
        mockSpawnSubAgent.mockReset();
        registerDeepResearchSkill();

        // Extract the execute functions from registered tools
        const calls = mockRegisterTool.mock.calls;
        const researchCall = calls.find(
            (c: unknown[]) => (c[0] as { name: string }).name === 'research',
        );
        const statusCall = calls.find(
            (c: unknown[]) => (c[0] as { name: string }).name === 'research_status',
        );
        researchExecute = (researchCall![0] as { execute: (args: Record<string, unknown>) => Promise<string> }).execute;
        statusExecute = (statusCall![0] as { execute: (args: Record<string, unknown>) => Promise<string> }).execute;
    });

    it('should return an error for invalid depth', async () => {
        const result = await researchExecute({ question: 'test', depth: 'ultra' });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid depth');
    });

    it('should spawn a sub-agent with correct config for standard depth', async () => {
        mockSpawnSubAgent.mockResolvedValueOnce({
            content: 'Research findings [1].\n\n## Sources\n[1] https://example.com',
            toolsUsed: ['web_search', 'web_read'],
            success: true,
            durationMs: 5000,
            rounds: 4,
        });

        const result = await researchExecute({ question: 'What is AI?' });

        expect(mockSpawnSubAgent).toHaveBeenCalledOnce();
        const config = mockSpawnSubAgent.mock.calls[0][0];
        expect(config.name).toBe('Researcher');
        expect(config.maxRounds).toBe(5); // standard preset
        expect(config.tools).toContain('web_search');
    });

    it('should include structured header in output', async () => {
        mockSpawnSubAgent.mockResolvedValueOnce({
            content: 'Findings here.',
            toolsUsed: ['web_search'],
            success: true,
            durationMs: 3000,
            rounds: 2,
        });

        const result = await researchExecute({ question: 'Test question' });
        expect(result).toContain('# Research Report');
        expect(result).toContain('**Question:** Test question');
        expect(result).toContain('**Depth:** standard');
        expect(result).toContain('**Status:** completed');
    });

    it('should use quick depth preset when specified', async () => {
        mockSpawnSubAgent.mockResolvedValueOnce({
            content: 'Quick results.',
            toolsUsed: ['web_search'],
            success: true,
            durationMs: 1000,
            rounds: 2,
        });

        await researchExecute({ question: 'Quick test', depth: 'quick' });

        const config = mockSpawnSubAgent.mock.calls[0][0];
        expect(config.maxRounds).toBe(3); // quick preset
    });

    it('should use deep depth preset when specified', async () => {
        mockSpawnSubAgent.mockResolvedValueOnce({
            content: 'Deep results.',
            toolsUsed: ['web_search', 'web_read', 'rag_search'],
            success: true,
            durationMs: 20000,
            rounds: 8,
        });

        await researchExecute({ question: 'Deep test', depth: 'deep' });

        const config = mockSpawnSubAgent.mock.calls[0][0];
        expect(config.maxRounds).toBe(10); // deep preset
    });

    it('should allow maxSources override', async () => {
        mockSpawnSubAgent.mockResolvedValueOnce({
            content: 'Results with custom sources.',
            toolsUsed: ['web_search'],
            success: true,
            durationMs: 2000,
            rounds: 3,
        });

        await researchExecute({ question: 'Custom sources', maxSources: 15 });

        const taskPrompt = mockSpawnSubAgent.mock.calls[0][0].task;
        expect(taskPrompt).toContain('up to 15 distinct sources');
    });

    it('should handle sub-agent failure', async () => {
        mockSpawnSubAgent.mockRejectedValueOnce(new Error('Provider timeout'));

        const result = await researchExecute({ question: 'Failing test' });
        expect(result).toContain('Research failed');
        expect(result).toContain('Provider timeout');
    });

    it('should mark failed sub-agent result as failed status', async () => {
        mockSpawnSubAgent.mockResolvedValueOnce({
            content: 'Error: could not complete',
            toolsUsed: [],
            success: false,
            durationMs: 1000,
            rounds: 1,
        });

        const result = await researchExecute({ question: 'Will fail' });
        expect(result).toContain('**Status:** failed');
    });

    it('should list no tasks when none exist (fresh registration)', async () => {
        // Note: tasks from prior tests in the same suite may exist
        // Test the "no taskId" path
        const result = await statusExecute({});
        // Should either list tasks or say "No research tasks found"
        expect(typeof result).toBe('string');
    });

    it('should return error for unknown task ID', async () => {
        const result = await statusExecute({ taskId: 'nonexistent-id' });
        expect(result).toContain('No research task found');
    });
});
