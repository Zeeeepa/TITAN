/**
 * Tests for src/skills/builtin/goals.ts (skill handlers)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateGoal = vi.hoisted(() => vi.fn());
const mockListGoals = vi.hoisted(() => vi.fn());
const mockUpdateGoal = vi.hoisted(() => vi.fn());
const mockDeleteGoal = vi.hoisted(() => vi.fn());
const mockGetGoalsSummary = vi.hoisted(() => vi.fn());
const mockAddSubtask = vi.hoisted(() => vi.fn());

vi.mock('../src/agent/goals.js', () => ({
    createGoal: mockCreateGoal,
    listGoals: mockListGoals,
    updateGoal: mockUpdateGoal,
    deleteGoal: mockDeleteGoal,
    getGoalsSummary: mockGetGoalsSummary,
    addSubtask: mockAddSubtask,
}));

const handlers = new Map<string, any>();

vi.mock('../src/skills/registry.js', () => ({
    registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
        handlers.set(handler.name, handler);
    }),
}));

import { registerGoalsSkill } from '../src/skills/builtin/goals.js';

describe('Goals Skill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        handlers.clear();
        registerGoalsSkill();
    });

    it('registers all 4 tool handlers', () => {
        expect(handlers.has('goal_create')).toBe(true);
        expect(handlers.has('goal_list')).toBe(true);
        expect(handlers.has('goal_update')).toBe(true);
        expect(handlers.has('goal_delete')).toBe(true);
    });

    describe('goal_create', () => {
        it('creates a goal and returns confirmation', async () => {
            mockCreateGoal.mockReturnValue({
                id: 'abc123',
                title: 'Test Goal',
                status: 'active',
                priority: 1,
                subtasks: [],
            });

            const handler = handlers.get('goal_create');
            const result = await handler.execute({
                title: 'Test Goal',
                description: 'A test',
            });

            expect(result).toContain('Test Goal');
            expect(result).toContain('abc123');
            expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Test Goal',
                description: 'A test',
            }));
        });

        it('parses subtasks from JSON string', async () => {
            mockCreateGoal.mockReturnValue({
                id: 'x',
                title: 'T',
                status: 'active',
                priority: 1,
                subtasks: [{ id: 'st-1', title: 'S1' }],
            });

            const handler = handlers.get('goal_create');
            await handler.execute({
                title: 'T',
                description: 'D',
                subtasks: '[{"title":"S1","description":"Do S1"}]',
            });

            expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({
                subtasks: [{ title: 'S1', description: 'Do S1' }],
            }));
        });

        it('returns error for invalid subtasks JSON', async () => {
            const handler = handlers.get('goal_create');
            const result = await handler.execute({
                title: 'T',
                description: 'D',
                subtasks: 'not valid json',
            });

            expect(result).toContain('Error');
            expect(mockCreateGoal).not.toHaveBeenCalled();
        });
    });

    describe('goal_list', () => {
        it('returns summary when goals exist', async () => {
            mockListGoals.mockReturnValue([{ id: '1', title: 'G1' }]);
            mockGetGoalsSummary.mockReturnValue('## Goals Summary\nG1 active');

            const handler = handlers.get('goal_list');
            const result = await handler.execute({});

            expect(result).toContain('Goals Summary');
        });

        it('returns helpful message when no goals', async () => {
            mockListGoals.mockReturnValue([]);

            const handler = handlers.get('goal_list');
            const result = await handler.execute({});

            expect(result).toContain('No goals');
        });

        it('filters by status', async () => {
            mockListGoals.mockReturnValue([]);

            const handler = handlers.get('goal_list');
            await handler.execute({ status: 'completed' });

            expect(mockListGoals).toHaveBeenCalledWith('completed');
        });
    });

    describe('goal_update', () => {
        it('updates goal properties', async () => {
            mockUpdateGoal.mockReturnValue({
                title: 'Updated',
                status: 'completed',
                progress: 100,
            });

            const handler = handlers.get('goal_update');
            const result = await handler.execute({
                id: 'abc',
                status: 'completed',
            });

            expect(result).toContain('Updated');
            expect(result).toContain('completed');
        });

        it('adds subtask when addSubtask is provided', async () => {
            mockAddSubtask.mockReturnValue({ id: 'st-3', title: 'New Task' });

            const handler = handlers.get('goal_update');
            const result = await handler.execute({
                id: 'abc',
                addSubtask: '{"title":"New Task","description":"Do it"}',
            });

            expect(result).toContain('New Task');
            expect(mockAddSubtask).toHaveBeenCalledWith('abc', 'New Task', 'Do it');
        });

        it('returns error for non-existent goal', async () => {
            mockUpdateGoal.mockReturnValue(undefined);

            const handler = handlers.get('goal_update');
            const result = await handler.execute({ id: 'nope', status: 'active' });

            expect(result).toContain('not found');
        });
    });

    describe('goal_delete', () => {
        it('deletes a goal', async () => {
            mockDeleteGoal.mockReturnValue(true);

            const handler = handlers.get('goal_delete');
            const result = await handler.execute({ id: 'abc' });

            expect(result).toContain('deleted');
        });

        it('returns error for non-existent goal', async () => {
            mockDeleteGoal.mockReturnValue(false);

            const handler = handlers.get('goal_delete');
            const result = await handler.execute({ id: 'nope' });

            expect(result).toContain('not found');
        });
    });
});
