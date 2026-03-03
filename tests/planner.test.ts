/**
 * TITAN — Planner Tests
 * Tests createPlan, getReadyTasks, startTask, completeTask, failTask, getPlanStatus, listPlans
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        readdirSync: vi.fn().mockReturnValue([]),
    };
});

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/utils/helpers.js', () => ({
    ensureDir: vi.fn(),
}));

vi.mock('../src/utils/constants.js', () => ({
    TITAN_HOME: '/tmp/titan-test-planner',
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        security: { deniedTools: [], allowedTools: [], commandTimeout: 30000 },
    }),
}));

import {
    createPlan,
    getReadyTasks,
    startTask,
    completeTask,
    failTask,
    getPlanStatus,
    listPlans,
    getPlan,
    loadPlans,
} from '../src/agent/planner.js';

describe('Task Planner', () => {
    describe('createPlan', () => {
        it('should create a plan with tasks', () => {
            const plan = createPlan('Build a website', [
                { title: 'Setup project', description: 'Init npm project' },
                { title: 'Write HTML', description: 'Create index.html', dependsOn: ['task-1'] },
                { title: 'Deploy', description: 'Push to hosting', dependsOn: ['task-2'] },
            ]);
            expect(plan.id).toBeTruthy();
            expect(plan.goal).toBe('Build a website');
            expect(plan.tasks.length).toBe(3);
            expect(plan.status).toBe('active');
        });

        it('should set all tasks to pending initially', () => {
            const plan = createPlan('Test', [{ title: 'A', description: 'a' }]);
            expect(plan.tasks[0].status).toBe('pending');
            expect(plan.tasks[0].retries).toBe(0);
        });
    });

    describe('getReadyTasks', () => {
        it('should return tasks with no dependencies as ready', () => {
            const plan = createPlan('Ready test', [
                { title: 'Independent', description: 'No deps' },
                { title: 'Dependent', description: 'Has deps', dependsOn: ['task-1'] },
            ]);
            const ready = getReadyTasks(plan.id);
            expect(ready.length).toBe(1);
            expect(ready[0].title).toBe('Independent');
        });

        it('should return empty for non-existent plan', () => {
            expect(getReadyTasks('nonexistent')).toEqual([]);
        });
    });

    describe('startTask', () => {
        it('should set task status to running', () => {
            const plan = createPlan('Start test', [{ title: 'Task A', description: 'Do A' }]);
            startTask(plan.id, 'task-1');
            const updated = getPlan(plan.id);
            expect(updated!.tasks[0].status).toBe('running');
            expect(updated!.tasks[0].startedAt).toBeTruthy();
        });
    });

    describe('completeTask', () => {
        it('should mark a task as done', () => {
            const plan = createPlan('Complete test', [{ title: 'Task A', description: 'Do A' }]);
            startTask(plan.id, 'task-1');
            completeTask(plan.id, 'task-1', 'All done');
            const updated = getPlan(plan.id);
            expect(updated!.tasks[0].status).toBe('done');
            expect(updated!.tasks[0].result).toBe('All done');
        });

        it('should complete the plan when all tasks are done', () => {
            const plan = createPlan('Full plan', [
                { title: 'A', description: 'a' },
                { title: 'B', description: 'b' },
            ]);
            startTask(plan.id, 'task-1');
            completeTask(plan.id, 'task-1', 'Done A');
            startTask(plan.id, 'task-2');
            completeTask(plan.id, 'task-2', 'Done B');
            expect(getPlan(plan.id)!.status).toBe('completed');
        });

        it('should unlock dependent tasks', () => {
            const plan = createPlan('Dep test', [
                { title: 'First', description: 'first' },
                { title: 'Second', description: 'second', dependsOn: ['task-1'] },
            ]);
            startTask(plan.id, 'task-1');
            completeTask(plan.id, 'task-1', 'Done');
            const ready = getReadyTasks(plan.id);
            expect(ready.length).toBe(1);
            expect(ready[0].title).toBe('Second');
        });
    });

    describe('failTask', () => {
        it('should retry task before failing (retries < 3)', () => {
            const plan = createPlan('Fail test', [{ title: 'Fragile', description: 'Might fail' }]);
            startTask(plan.id, 'task-1');
            failTask(plan.id, 'task-1', 'Network error');
            expect(getPlan(plan.id)!.tasks[0].status).toBe('pending'); // retried
            expect(getPlan(plan.id)!.tasks[0].retries).toBe(1);
        });

        it('should permanently fail after 3 retries', () => {
            const plan = createPlan('Hard fail test', [{ title: 'Doomed', description: 'Will fail' }]);
            for (let i = 0; i < 3; i++) {
                startTask(plan.id, 'task-1');
                failTask(plan.id, 'task-1', 'Error');
            }
            expect(getPlan(plan.id)!.tasks[0].status).toBe('failed');
        });
    });

    describe('getPlanStatus', () => {
        it('should return formatted status string', () => {
            const plan = createPlan('Status test', [
                { title: 'Task A', description: 'a' },
                { title: 'Task B', description: 'b' },
            ]);
            const status = getPlanStatus(plan.id);
            expect(status).toContain('Status test');
            expect(status).toContain('Task A');
            expect(status).toContain('Task B');
        });

        it('should return not found for missing plan', () => {
            expect(getPlanStatus('nope')).toContain('not found');
        });
    });

    describe('listPlans', () => {
        it('should include created plans', () => {
            const plan = createPlan('List test', [{ title: 'X', description: 'x' }]);
            const list = listPlans();
            const found = list.find(p => p.id === plan.id);
            expect(found).toBeDefined();
            expect(found!.goal).toBe('List test');
        });
    });

    describe('loadPlans', () => {
        it('should not throw when plans directory does not exist', () => {
            expect(() => loadPlans()).not.toThrow();
        });
    });
});
