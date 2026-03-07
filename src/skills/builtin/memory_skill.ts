/**
 * TITAN — Memory Skill (Built-in)
 * Persistent fact/preference storage for the agent.
 */
import { registerSkill } from '../registry.js';
import { rememberFact, recallFact, searchMemories } from '../../memory/memory.js';

export function registerMemorySkill(): void {
    registerSkill(
        { name: 'memory', description: 'Persistent memory management', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'memory',
            description: 'Store and recall persistent memories. Use this to remember user preferences, important facts, project details, and anything that should persist across conversations.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['remember', 'recall', 'search', 'list'], description: 'Action' },
                    category: { type: 'string', description: 'Memory category (e.g., "preference", "fact", "project")' },
                    key: { type: 'string', description: 'Memory key/name' },
                    value: { type: 'string', description: 'Value to remember' },
                    query: { type: 'string', description: 'Search query (for search action)' },
                },
                required: ['action'],
            },
            execute: async (args) => {
                const action = args.action as string;
                const category = (args.category as string) || 'general';

                switch (action) {
                    case 'remember': {
                        const key = args.key as string;
                        const value = args.value as string;
                        if (!key || !value) return 'Error: key and value are required';
                        rememberFact(category, key, value);
                        return `Remembered: [${category}] ${key} = ${value}`;
                    }
                    case 'recall': {
                        const rKey = args.key as string;
                        if (!rKey) return 'Error: key is required';
                        const value = recallFact(category, rKey);
                        return value ? `[${category}] ${rKey} = ${value}` : `No memory found for [${category}] ${rKey}`;
                    }
                    case 'search': {
                        const query = args.query as string;
                        const results = await searchMemories(category !== 'general' ? category : undefined, query);
                        if (results.length === 0) return 'No matching memories found.';
                        return results.map((m) => `• [${m.category}] ${m.key}: ${m.value}`).join('\n');
                    }
                    case 'list': {
                        const all = await searchMemories(category !== 'general' ? category : undefined);
                        if (all.length === 0) return 'No memories stored yet.';
                        return all.map((m) => `• [${m.category}] ${m.key}: ${m.value}`).join('\n');
                    }
                    default:
                        return `Unknown action: ${action}`;
                }
            },
        },
    );
}
