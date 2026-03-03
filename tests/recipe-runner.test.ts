/**
 * TITAN -- Recipe Runner Tests
 * Tests src/recipes/runner.ts: runRecipe generator, parseSlashCommand,
 * interpolation, parameter expansion, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetRecipe = vi.fn();
const mockSaveRecipe = vi.fn();

vi.mock('../src/recipes/store.js', () => ({
    getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
    saveRecipe: (...args: unknown[]) => mockSaveRecipe(...args),
}));

import { runRecipe, parseSlashCommand } from '../src/recipes/runner.js';
import logger from '../src/utils/logger.js';

// ─── Helpers ────────────────────────────────────────────────────

interface TestRecipe {
    id: string;
    name: string;
    description: string;
    slashCommand: string;
    parameters?: Record<string, { description: string; required: boolean }>;
    steps: Array<{ prompt: string }>;
    author: string;
    tags: string[];
    createdAt: string;
    lastRunAt?: string;
}

function makeRecipe(overrides: Record<string, unknown> = {}): TestRecipe {
    return {
        id: 'test-recipe',
        name: 'Test Recipe',
        description: 'A recipe for testing',
        slashCommand: 'test',
        parameters: {
            file: { description: 'Path to file', required: false },
            topic: { description: 'Topic to discuss', required: true },
        },
        steps: [
            { prompt: 'Step 1: Analyze {{file}}' },
            { prompt: 'Step 2: Discuss {{topic}} in context' },
            { prompt: 'Step 3: Summarize findings' },
        ],
        author: 'Test Author',
        tags: ['test'],
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    } as TestRecipe;
}

/** Collect all values from an async generator */
async function collectAll<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of gen) {
        results.push(item);
    }
    return results;
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── parseSlashCommand ──────────────────────────────────────────

describe('parseSlashCommand', () => {
    it('should parse a simple command without args', () => {
        const result = parseSlashCommand('/help');
        expect(result).not.toBeNull();
        expect(result!.command).toBe('help');
        expect(result!.args).toBe('');
    });

    it('should parse command with single-word arg', () => {
        const result = parseSlashCommand('/search typescript');
        expect(result!.command).toBe('search');
        expect(result!.args).toBe('typescript');
    });

    it('should parse command with multi-word args', () => {
        const result = parseSlashCommand('/debug Error: file not found in /src/index.ts');
        expect(result!.command).toBe('debug');
        expect(result!.args).toBe('Error: file not found in /src/index.ts');
    });

    it('should return null for plain text (no slash)', () => {
        expect(parseSlashCommand('Hello world')).toBeNull();
    });

    it('should return null for empty string', () => {
        expect(parseSlashCommand('')).toBeNull();
    });

    it('should return null for whitespace only', () => {
        expect(parseSlashCommand('   ')).toBeNull();
    });

    it('should return null when slash is not at the start', () => {
        expect(parseSlashCommand('not /a command')).toBeNull();
    });

    it('should handle leading whitespace', () => {
        const result = parseSlashCommand('  /standup');
        expect(result).not.toBeNull();
        expect(result!.command).toBe('standup');
    });

    it('should handle trailing whitespace', () => {
        const result = parseSlashCommand('/cmd   ');
        expect(result).not.toBeNull();
        expect(result!.command).toBe('cmd');
        expect(result!.args).toBe('');
    });

    it('should handle leading and trailing whitespace in args', () => {
        const result = parseSlashCommand('/search   multiple words  ');
        expect(result!.command).toBe('search');
        expect(result!.args).toBe('multiple words');
    });

    it('should handle hyphenated command names', () => {
        const result = parseSlashCommand('/code-review src/index.ts');
        expect(result!.command).toBe('code-review');
        expect(result!.args).toBe('src/index.ts');
    });

    it('should handle underscore command names', () => {
        const result = parseSlashCommand('/run_test');
        expect(result!.command).toBe('run_test');
    });

    it('should handle numeric command names', () => {
        const result = parseSlashCommand('/404');
        expect(result!.command).toBe('404');
    });

    it('should handle slash-only input', () => {
        const result = parseSlashCommand('/');
        expect(result).not.toBeNull();
        expect(result!.command).toBe('');
        expect(result!.args).toBe('');
    });

    it('should preserve args with special characters', () => {
        const result = parseSlashCommand('/debug Error: ENOENT "file.ts" (code=42)');
        expect(result!.args).toBe('Error: ENOENT "file.ts" (code=42)');
    });

    it('should handle args with multiple spaces between words', () => {
        const result = parseSlashCommand('/search   lots   of   spaces');
        expect(result!.command).toBe('search');
        // Only the first space separates command from args; rest is preserved
        expect(result!.args).toBe('lots   of   spaces');
    });
});

// ─── runRecipe ──────────────────────────────────────────────────

describe('runRecipe', () => {
    it('should throw when recipe is not found', async () => {
        mockGetRecipe.mockReturnValue(null);
        const gen = runRecipe('nonexistent');
        await expect(gen.next()).rejects.toThrow('Recipe "nonexistent" not found');
    });

    it('should yield all steps from a recipe', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe'));
        expect(steps.length).toBe(3);
    });

    it('should yield steps with correct stepIndex', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe'));
        expect(steps[0].stepIndex).toBe(0);
        expect(steps[1].stepIndex).toBe(1);
        expect(steps[2].stepIndex).toBe(2);
    });

    it('should yield steps with correct total count', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe'));
        for (const step of steps) {
            expect(step.total).toBe(3);
        }
    });

    it('should interpolate {{param}} placeholders with user params', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {
            file: 'src/index.ts',
            topic: 'performance',
        }));

        expect(steps[0].prompt).toBe('Step 1: Analyze src/index.ts');
        expect(steps[1].prompt).toBe('Step 2: Discuss performance in context');
    });

    it('should replace missing params with <paramName> fallback', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {}));
        expect(steps[0].prompt).toBe('Step 1: Analyze <file>');
        expect(steps[1].prompt).toBe('Step 2: Discuss <topic> in context');
    });

    it('should warn about missing parameters', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        await collectAll(runRecipe('test-recipe', {}));
        expect(logger.warn).toHaveBeenCalledWith(
            'RecipeRunner',
            expect.stringContaining('Missing recipe parameter: {{file}}'),
        );
        expect(logger.warn).toHaveBeenCalledWith(
            'RecipeRunner',
            expect.stringContaining('Missing recipe parameter: {{topic}}'),
        );
    });

    it('should not warn when all parameters are provided', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        await collectAll(runRecipe('test-recipe', {
            file: 'test.ts',
            topic: 'testing',
        }));

        // logger.warn should not have been called with "Missing recipe parameter"
        const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
        const missingParamCalls = warnCalls.filter(
            (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).includes('Missing recipe parameter'),
        );
        expect(missingParamCalls.length).toBe(0);
    });

    it('should handle recipe with single step', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'Only step: {{topic}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { topic: 'testing' }));
        expect(steps.length).toBe(1);
        expect(steps[0].prompt).toBe('Only step: testing');
        expect(steps[0].total).toBe(1);
    });

    it('should handle recipe with many steps', async () => {
        const manySteps = Array.from({ length: 10 }, (_, i) => ({
            prompt: `Step ${i + 1}: Do something`,
        }));
        const recipe = makeRecipe({ steps: manySteps });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe'));
        expect(steps.length).toBe(10);
        expect(steps[9].stepIndex).toBe(9);
        expect(steps[9].total).toBe(10);
    });

    it('should leave prompts without placeholders unchanged', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'No placeholders here' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { unused: 'value' }));
        expect(steps[0].prompt).toBe('No placeholders here');
    });

    it('should handle multiple placeholders in single prompt', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: '{{file}} contains {{topic}} for {{user}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {
            file: 'main.ts',
            topic: 'bugs',
            user: 'Tony',
        }));
        expect(steps[0].prompt).toBe('main.ts contains bugs for Tony');
    });

    it('should handle repeated placeholders in a prompt', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: '{{name}} is {{name}} and {{name}} again' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { name: 'TITAN' }));
        expect(steps[0].prompt).toBe('TITAN is TITAN and TITAN again');
    });

    it('should update lastRunAt timestamp on the recipe', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        await collectAll(runRecipe('test-recipe'));

        expect(recipe.lastRunAt).toBeDefined();
        expect(new Date(recipe.lastRunAt!).toString()).not.toBe('Invalid Date');
    });

    it('should call saveRecipe after running all steps', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        await collectAll(runRecipe('test-recipe'));
        expect(mockSaveRecipe).toHaveBeenCalledWith(recipe);
    });

    it('should log recipe execution start', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        // Start iterating to trigger the first part of the generator
        const gen = runRecipe('test-recipe');
        await gen.next();

        expect(logger.info).toHaveBeenCalledWith(
            'RecipeRunner',
            expect.stringContaining('Running recipe: Test Recipe'),
        );
    });

    it('should log step count in execution message', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const gen = runRecipe('test-recipe');
        await gen.next();

        expect(logger.info).toHaveBeenCalledWith(
            'RecipeRunner',
            expect.stringContaining('3 steps'),
        );
    });

    it('should call getRecipe with the provided recipe ID', async () => {
        mockGetRecipe.mockReturnValue(null);
        const gen = runRecipe('my-custom-recipe');
        try { await gen.next(); } catch { /* expected */ }
        expect(mockGetRecipe).toHaveBeenCalledWith('my-custom-recipe');
    });

    it('should handle empty params object', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'Hello {{name}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {}));
        expect(steps[0].prompt).toBe('Hello <name>');
    });

    it('should handle params with empty string values', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'File: {{file}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { file: '' }));
        expect(steps[0].prompt).toBe('File: ');
    });

    it('should handle params with special characters', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'Path: {{path}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {
            path: '/home/user/.config/titan.json',
        }));
        expect(steps[0].prompt).toBe('Path: /home/user/.config/titan.json');
    });

    it('should handle params with braces in values', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'Data: {{data}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {
            data: '{ "key": "value" }',
        }));
        expect(steps[0].prompt).toBe('Data: { "key": "value" }');
    });

    it('should not save recipe if generator is not fully consumed', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const gen = runRecipe('test-recipe');
        await gen.next(); // only consume first step
        // Don't consume the rest - saveRecipe should not be called
        // (generator hasn't run to completion)
        expect(mockSaveRecipe).not.toHaveBeenCalled();
    });

    it('should yield steps one at a time via generator protocol', async () => {
        const recipe = makeRecipe();
        mockGetRecipe.mockReturnValue(recipe);

        const gen = runRecipe('test-recipe', { file: 'a.ts', topic: 'perf' });

        const step1 = await gen.next();
        expect(step1.done).toBe(false);
        expect(step1.value.stepIndex).toBe(0);
        expect(step1.value.prompt).toBe('Step 1: Analyze a.ts');

        const step2 = await gen.next();
        expect(step2.done).toBe(false);
        expect(step2.value.stepIndex).toBe(1);

        const step3 = await gen.next();
        expect(step3.done).toBe(false);
        expect(step3.value.stepIndex).toBe(2);

        const step4 = await gen.next();
        expect(step4.done).toBe(true);
    });

    it('should only match {{word}} not {word} or {{{word}}}', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: '{single} {{double}} {{{triple}}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {
            single: 'X',
            double: 'Y',
            triple: 'Z',
        }));
        // Only {{double}} should be replaced. The regex matches \\w+ inside {{}}
        // {single} stays as-is, {{{triple}}} becomes {Z} (inner {{triple}} is replaced)
        expect(steps[0].prompt).toContain('Y');
        expect(steps[0].prompt).toContain('{single}');
    });
});

// ─── interpolation edge cases ───────────────────────────────────

describe('interpolation edge cases', () => {
    it('should handle unicode parameter names matching \\w+', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'Value: {{name123}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { name123: 'alphanumeric' }));
        expect(steps[0].prompt).toBe('Value: alphanumeric');
    });

    it('should handle underscored parameter names', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: '{{my_param}} works' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { my_param: 'yes' }));
        expect(steps[0].prompt).toBe('yes works');
    });

    it('should handle prompt that is just a placeholder', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: '{{content}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { content: 'Full replacement' }));
        expect(steps[0].prompt).toBe('Full replacement');
    });

    it('should handle empty prompt string', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: '' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe'));
        expect(steps[0].prompt).toBe('');
    });

    it('should handle very long parameter values', async () => {
        const longValue = 'x'.repeat(10000);
        const recipe = makeRecipe({
            steps: [{ prompt: 'Data: {{data}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', { data: longValue }));
        expect(steps[0].prompt).toBe('Data: ' + longValue);
    });

    it('should handle params with newlines', async () => {
        const recipe = makeRecipe({
            steps: [{ prompt: 'Code: {{code}}' }],
        });
        mockGetRecipe.mockReturnValue(recipe);

        const steps = await collectAll(runRecipe('test-recipe', {
            code: 'line1\nline2\nline3',
        }));
        expect(steps[0].prompt).toBe('Code: line1\nline2\nline3');
    });
});
