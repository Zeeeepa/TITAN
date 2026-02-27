/**
 * TITAN — Model Switch Tool
 * Lets TITAN (or the user) swap the active LLM mid-session.
 * Like telling JARVIS to "switch to a faster mode" or "use the smarter model for this".
 */
import { z } from 'zod';
import { registerTool } from '../../agent/toolRunner.js';
import { loadConfig, updateConfig } from '../../config/config.js';

const SwitchModelSchema = z.object({
    model: z.string().describe('The model identifier to switch to, e.g. openai/gpt-4o or anthropic/claude-sonnet-4-20250514'),
    reason: z.string().optional().describe('Why you are switching models'),
});

export function initModelSwitchTool(): void {
    registerTool({
        name: 'switch_model',
        description: 'Switch the active AI model mid-session. Use this when a task requires a different model — e.g. switch to a faster model for quick tasks or a smarter model for complex reasoning.',
        parameters: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: 'Model identifier to switch to (e.g. openai/gpt-4o, anthropic/claude-opus-4-0, ollama/llama3.1)',
                },
                reason: {
                    type: 'string',
                    description: 'Why you are switching models (optional)',
                },
            },
            required: ['model'],
        },
        execute: async (args) => {
            const { model, reason } = SwitchModelSchema.parse(args);
            updateConfig({ agent: { ...loadConfig().agent, model } });
            return `✅ Switched to model: **${model}**${reason ? `\nReason: ${reason}` : ''}`;
        },
    });
}
