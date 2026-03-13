/**
 * TITAN — Self-Awareness Context
 * Builds a concise self-awareness block for the system prompt so the agent
 * knows its own operational state and can reason about self-healing.
 */
import type { TitanConfig } from '../config/schema.js';
import { getStallStats } from './stallDetector.js';

/**
 * Build a self-awareness context string for injection into the system prompt.
 * Keeps it short — this goes into every request.
 */
export function buildSelfAwarenessContext(config: TitanConfig): string {
    const model = config.agent.model;
    const isCloud = model.includes('-cloud') || model.includes(':cloud');
    const agentConfig = config.agent as Record<string, unknown>;

    // Collect fallback info
    const fallbackChain = (agentConfig.fallbackChain as string[]) || [];
    const aliases = (agentConfig.modelAliases as Record<string, string>) || {};
    const fallbacks = [...new Set([
        ...fallbackChain,
        aliases.fast,
        aliases.smart,
    ].filter(Boolean).filter(f => f !== model))];

    // Stall status
    const stats = getStallStats();
    const activeStalls = stats.filter(s => s.stallCount > 0).length;

    const lines = [
        '## Self-Awareness',
        `- Model: ${model}${isCloud ? ' (cloud — may have limited tool calling)' : ''}`,
    ];

    if (fallbacks.length > 0) {
        lines.push(`- Fallback: ${fallbacks[0]}${fallbacks.length > 1 ? ` (+${fallbacks.length - 1} more)` : ''}`);
    }

    if (activeStalls > 0) {
        lines.push(`- ⚠ ${activeStalls} session(s) with stalls detected`);
    }

    lines.push('- If tools are not working, use self_doctor to diagnose or switch_model to change models.');

    return lines.join('\n');
}
