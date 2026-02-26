/**
 * TITAN — Cron Skill (Built-in)
 * Schedule and manage automated tasks.
 */
import { registerSkill } from '../registry.js';
import { getDb } from '../../memory/memory.js';
import { v4 as uuid } from 'uuid';
import logger from '../../utils/logger.js';

const COMPONENT = 'Cron';

export function registerCronSkill(): void {
    registerSkill(
        { name: 'cron', description: 'Manage scheduled tasks', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'cron',
            description: 'Create, list, enable/disable, or delete scheduled cron jobs. Jobs run automatically at specified intervals.',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['create', 'list', 'delete', 'enable', 'disable'],
                        description: 'Action to perform',
                    },
                    name: { type: 'string', description: 'Name for the cron job' },
                    schedule: { type: 'string', description: 'Cron schedule expression (e.g., "0 9 * * *" for daily at 9am)' },
                    command: { type: 'string', description: 'Command to execute when the job runs' },
                    jobId: { type: 'string', description: 'Job ID (for delete/enable/disable)' },
                },
                required: ['action'],
            },
            execute: async (args) => {
                const action = args.action as string;
                const store = getDb();

                switch (action) {
                    case 'create': {
                        const name = args.name as string;
                        const schedule = args.schedule as string;
                        const command = args.command as string;
                        if (!name || !schedule || !command) return 'Error: name, schedule, and command are required';
                        const id = uuid();
                        store.cronJobs.push({
                            id, name, schedule, command,
                            enabled: true,
                            created_at: new Date().toISOString(),
                        });
                        logger.info(COMPONENT, `Created cron job: ${name} (${schedule})`);
                        return `Created cron job "${name}" (ID: ${id})\nSchedule: ${schedule}\nCommand: ${command}`;
                    }
                    case 'list': {
                        if (store.cronJobs.length === 0) return 'No cron jobs configured.';
                        return store.cronJobs.map((j) =>
                            `• ${j.name} [${j.enabled ? '✅ enabled' : '❌ disabled'}]\n  ID: ${j.id}\n  Schedule: ${j.schedule}\n  Command: ${j.command}`
                        ).join('\n\n');
                    }
                    case 'delete': {
                        const jobId = args.jobId as string;
                        if (!jobId) return 'Error: jobId is required';
                        store.cronJobs = store.cronJobs.filter((j) => j.id !== jobId);
                        return `Deleted cron job: ${jobId}`;
                    }
                    case 'enable': {
                        const eId = args.jobId as string;
                        if (!eId) return 'Error: jobId is required';
                        const job = store.cronJobs.find((j) => j.id === eId);
                        if (job) job.enabled = true;
                        return `Enabled cron job: ${eId}`;
                    }
                    case 'disable': {
                        const dId = args.jobId as string;
                        if (!dId) return 'Error: jobId is required';
                        const job = store.cronJobs.find((j) => j.id === dId);
                        if (job) job.enabled = false;
                        return `Disabled cron job: ${dId}`;
                    }
                    default:
                        return `Unknown action: ${action}`;
                }
            },
        },
    );
}
