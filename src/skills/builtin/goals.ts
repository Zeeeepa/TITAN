/**
 * TITAN — Goals Skill (Built-in)
 * LLM-invocable tools for creating, listing, updating, and deleting goals.
 * Wired to the goal management system in agent/goals.ts.
 */
import { registerSkill } from '../registry.js';
import {
    createGoal,
    listGoals,
    updateGoal,
    deleteGoal,
    getGoalsSummary,
    addSubtask,
    type GoalStatus,
} from '../../agent/goals.js';

export function registerGoalsSkill(): void {
    // Tool 1: goal_create
    registerSkill(
        {
            name: 'goals',
            description: 'Goal management — create, track, and complete long-running objectives',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'goal_create',
            description: 'Create a new goal with optional subtasks and schedule. Goals persist across sessions and drive autopilot cycles.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Short goal title (e.g., "Publish 2 articles/week")',
                    },
                    description: {
                        type: 'string',
                        description: 'Detailed description of the goal',
                    },
                    priority: {
                        type: 'number',
                        description: 'Priority (1 = highest, default: auto)',
                    },
                    schedule: {
                        type: 'string',
                        description: 'Cron expression for recurring execution (e.g., "0 9 * * 1,4" for Mon+Thu 9am)',
                    },
                    budgetLimit: {
                        type: 'number',
                        description: 'Maximum USD to spend on this goal',
                    },
                    subtasks: {
                        type: 'string',
                        description: 'JSON array of subtasks: [{"title": "...", "description": "..."}]',
                    },
                },
                required: ['title', 'description'],
            },
            execute: async (args) => {
                try {
                    let subtasks: Array<{ title: string; description: string }> = [];
                    if (args.subtasks) {
                        try {
                            subtasks = JSON.parse(args.subtasks as string);
                        } catch {
                            return 'Error: subtasks must be valid JSON array of {title, description} objects';
                        }
                    }

                    const goal = createGoal({
                        title: args.title as string,
                        description: args.description as string,
                        priority: args.priority as number | undefined,
                        schedule: args.schedule as string | undefined,
                        budgetLimit: args.budgetLimit as number | undefined,
                        subtasks,
                    });

                    const lines = [
                        `Goal created: "${goal.title}" (ID: ${goal.id})`,
                        `Status: ${goal.status}`,
                        `Priority: ${goal.priority}`,
                        `Subtasks: ${goal.subtasks.length}`,
                    ];
                    if (goal.schedule) lines.push(`Schedule: ${goal.schedule}`);
                    if (goal.budgetLimit) lines.push(`Budget limit: $${goal.budgetLimit}`);

                    return lines.join('\n');
                } catch (e) {
                    return `Error creating goal: ${(e as Error).message}`;
                }
            },
        },
    );

    // Tool 2: goal_list
    registerSkill(
        {
            name: 'goals',
            description: 'Goal management — create, track, and complete long-running objectives',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'goal_list',
            description: 'List all goals with their progress and status. Optionally filter by status.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        description: 'Filter by status: "active", "paused", "completed", "failed" (default: all)',
                    },
                },
            },
            execute: async (args) => {
                try {
                    const status = args.status as GoalStatus | undefined;
                    const goals = listGoals(status);

                    if (goals.length === 0) {
                        return status
                            ? `No goals with status "${status}".`
                            : 'No goals defined. Use goal_create to create one.';
                    }

                    return getGoalsSummary();
                } catch (e) {
                    return `Error listing goals: ${(e as Error).message}`;
                }
            },
        },
    );

    // Tool 3: goal_update
    registerSkill(
        {
            name: 'goals',
            description: 'Goal management — create, track, and complete long-running objectives',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'goal_update',
            description: 'Update a goal\'s status, progress, priority, or other properties.',
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Goal ID to update',
                    },
                    status: {
                        type: 'string',
                        description: 'New status: "active", "paused", "completed", "failed"',
                    },
                    progress: {
                        type: 'number',
                        description: 'Progress percentage (0-100)',
                    },
                    priority: {
                        type: 'number',
                        description: 'New priority (1 = highest)',
                    },
                    addSubtask: {
                        type: 'string',
                        description: 'JSON object to add a subtask: {"title": "...", "description": "..."}',
                    },
                },
                required: ['id'],
            },
            execute: async (args) => {
                try {
                    const goalId = args.id as string;

                    // Handle adding a subtask
                    if (args.addSubtask) {
                        try {
                            const st = JSON.parse(args.addSubtask as string);
                            const subtask = addSubtask(goalId, st.title, st.description);
                            if (!subtask) return `Error: Goal "${goalId}" not found.`;
                            return `Subtask added: "${subtask.title}" (${subtask.id})`;
                        } catch {
                            return 'Error: addSubtask must be valid JSON {"title": "...", "description": "..."}';
                        }
                    }

                    const updates: Record<string, unknown> = {};
                    if (args.status) updates.status = args.status;
                    if (args.progress !== undefined) updates.progress = args.progress;
                    if (args.priority !== undefined) updates.priority = args.priority;

                    const goal = updateGoal(goalId, updates as Parameters<typeof updateGoal>[1]);
                    if (!goal) return `Error: Goal "${goalId}" not found.`;

                    return `Goal updated: "${goal.title}" — status: ${goal.status}, progress: ${goal.progress}%`;
                } catch (e) {
                    return `Error updating goal: ${(e as Error).message}`;
                }
            },
        },
    );

    // Tool 4: goal_delete
    registerSkill(
        {
            name: 'goals',
            description: 'Goal management — create, track, and complete long-running objectives',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'goal_delete',
            description: 'Delete a goal and all its subtasks.',
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Goal ID to delete',
                    },
                },
                required: ['id'],
            },
            execute: async (args) => {
                try {
                    const goalId = args.id as string;
                    const deleted = deleteGoal(goalId);
                    if (!deleted) return `Error: Goal "${goalId}" not found.`;
                    return `Goal deleted: ${goalId}`;
                } catch (e) {
                    return `Error deleting goal: ${(e as Error).message}`;
                }
            },
        },
    );
}
