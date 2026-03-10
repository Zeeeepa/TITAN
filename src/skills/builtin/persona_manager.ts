/**
 * TITAN — Persona Manager Skill
 * Tools for listing, switching, and inspecting personas.
 */
import { registerSkill } from '../registry.js';
import { loadConfig, updateConfig } from '../../config/config.js';
import { listPersonas, getPersona, invalidatePersonaCache } from '../../personas/manager.js';

export function registerPersonaManagerSkill(): void {
    registerSkill({
        name: 'list_personas',
        description: 'List available TITAN personas',
        version: '1.0.0',
        source: 'bundled',
        enabled: true,
    }, {
        name: 'list_personas',
        description: 'List all available TITAN personas (personality profiles). Shows name, description, and division for each.',
        parameters: { type: 'object', properties: {}, required: [] },
        execute: async () => {
            const personas = listPersonas();
            if (personas.length === 0) return 'No personas found.';
            const config = loadConfig();
            const active = config.agent.persona || 'default';
            const lines = personas.map(p =>
                `${p.id === active ? '* ' : '  '}**${p.name}** (${p.id}) — ${p.description} [${p.division}]`
            );
            return `Available personas (${personas.length}):\n${lines.join('\n')}\n\nActive: ${active}`;
        },
    });

    registerSkill({
        name: 'switch_persona',
        description: 'Switch TITAN active persona',
        version: '1.0.0',
        source: 'bundled',
        enabled: true,
    }, {
        name: 'switch_persona',
        description: 'Switch TITAN to a different persona (personality profile). Changes take effect on the next message.',
        parameters: {
            type: 'object',
            properties: {
                persona: { type: 'string', description: 'Persona ID to switch to (use list_personas to see options)' },
            },
            required: ['persona'],
        },
        execute: async (args) => {
            const id = args.persona as string;
            if (id !== 'default') {
                const persona = getPersona(id);
                if (!persona) {
                    const available = listPersonas().map(p => p.id).join(', ');
                    return `Persona "${id}" not found. Available: ${available}`;
                }
            }
            const config = loadConfig();
            updateConfig({ agent: { ...config.agent, persona: id } });
            invalidatePersonaCache();
            return `Switched to persona: **${id}**. Changes take effect on the next message.`;
        },
    });

    registerSkill({
        name: 'get_persona',
        description: 'Get details of a TITAN persona',
        version: '1.0.0',
        source: 'bundled',
        enabled: true,
    }, {
        name: 'get_persona',
        description: 'Get full details of a specific persona including its personality definition.',
        parameters: {
            type: 'object',
            properties: {
                persona: { type: 'string', description: 'Persona ID to inspect' },
            },
            required: ['persona'],
        },
        execute: async (args) => {
            const id = args.persona as string;
            const persona = getPersona(id);
            if (!persona) return `Persona "${id}" not found.`;
            return `# ${persona.name}\n**ID:** ${persona.id}\n**Division:** ${persona.division}\n**Description:** ${persona.description}\n\n${persona.content}`;
        },
    });
}
