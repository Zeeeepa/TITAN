/**
 * TITAN — Webhook Skill (Built-in)
 * Create and manage HTTP webhook endpoints.
 */
import { registerSkill } from '../registry.js';
import { getDb } from '../../memory/memory.js';
import { v4 as uuid } from 'uuid';
import logger from '../../utils/logger.js';

const COMPONENT = 'Webhook';

/** In-memory webhook registry */
const activeWebhooks: Map<string, {
    id: string;
    path: string;
    name: string;
    method: string;
    handler: string;
}> = new Map();

export function getActiveWebhooks() {
    return activeWebhooks;
}

export function registerWebhookSkill(): void {
    registerSkill(
        { name: 'webhook', description: 'Manage webhook endpoints', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'webhook',
            description: 'Create, list, or delete HTTP webhook endpoints that trigger actions when called.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['create', 'list', 'delete'], description: 'Action' },
                    name: { type: 'string', description: 'Webhook name' },
                    path: { type: 'string', description: 'URL path (e.g., /my-hook)' },
                    method: { type: 'string', description: 'HTTP method (GET/POST, default: POST)' },
                    handler: { type: 'string', description: 'Command to run when webhook is triggered' },
                    webhookId: { type: 'string', description: 'Webhook ID (for delete)' },
                },
                required: ['action'],
            },
            execute: async (args) => {
                const action = args.action as string;

                switch (action) {
                    case 'create': {
                        const id = uuid();
                        const name = (args.name as string) || `webhook-${id.slice(0, 8)}`;
                        const path = (args.path as string) || `/webhook/${id.slice(0, 8)}`;
                        const method = (args.method as string) || 'POST';
                        const handler = (args.handler as string) || '';
                        activeWebhooks.set(id, { id, path, name, method, handler });
                        logger.info(COMPONENT, `Created webhook: ${name} at ${path}`);
                        return `Created webhook "${name}"\n  ID: ${id}\n  Path: ${path}\n  Method: ${method}\n  Handler: ${handler}`;
                    }
                    case 'list': {
                        if (activeWebhooks.size === 0) return 'No active webhooks.';
                        return Array.from(activeWebhooks.values())
                            .map((w) => `• ${w.name}\n  ID: ${w.id}\n  ${w.method} ${w.path}\n  Handler: ${w.handler}`)
                            .join('\n\n');
                    }
                    case 'delete': {
                        const wId = args.webhookId as string;
                        if (!wId) return 'Error: webhookId is required';
                        activeWebhooks.delete(wId);
                        return `Deleted webhook: ${wId}`;
                    }
                    default:
                        return `Unknown action: ${action}`;
                }
            },
        },
    );
}
