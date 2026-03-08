/**
 * TITAN — Agent Reflection
 * Periodic self-assessment during the agent loop. Every N rounds, the agent
 * pauses to reflect: "What have I accomplished? What remains? Should I continue?"
 * Uses the fast model alias for cheap, quick calls.
 */
import { chat } from '../providers/router.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Reflection';

export interface ReflectionResult {
    decision: 'continue' | 'stop' | 'adjust';
    summary: string;
    reasoning: string;
}

/** Check if reflection should trigger this round */
export function shouldReflect(round: number, interval: number = 3): boolean {
    if (round === 0) return false;
    return round > 0 && round % interval === 0;
}

/** Build a concise reflection prompt */
export function buildReflectionPrompt(
    round: number,
    toolsUsed: string[],
    originalMessage: string,
    lastToolResults?: string,
): string {
    const uniqueTools = [...new Set(toolsUsed)];
    return [
        `You are reflecting on your progress after ${round} rounds of tool use.`,
        '',
        `Original user request: "${originalMessage.slice(0, 300)}"`,
        '',
        `Tools used so far: ${uniqueTools.join(', ') || 'none'}`,
        `Total tool calls: ${toolsUsed.length}`,
        lastToolResults ? `\nLatest results summary: ${lastToolResults.slice(0, 500)}` : '',
        '',
        'Assess your progress:',
        '1. What have you accomplished so far?',
        '2. What remains to be done?',
        '3. Should you CONTINUE working, STOP and respond to the user, or ADJUST your approach?',
        '',
        'Respond with EXACTLY one of these on the first line:',
        'DECISION: continue',
        'DECISION: stop',
        'DECISION: adjust',
        '',
        'Then briefly explain why (1-2 sentences max).',
    ].join('\n');
}

/** Parse the LLM's reflection response */
export function parseReflection(llmResponse: string): ReflectionResult {
    const lines = llmResponse.trim().split('\n');
    const firstLine = lines[0].toLowerCase();

    let decision: ReflectionResult['decision'] = 'continue';
    if (firstLine.includes('stop')) {
        decision = 'stop';
    } else if (firstLine.includes('adjust')) {
        decision = 'adjust';
    } else if (firstLine.includes('continue')) {
        decision = 'continue';
    }

    const reasoning = lines.slice(1).join(' ').trim() || 'No reasoning provided.';

    return {
        decision,
        summary: `Round ${lines[0].match(/\d+/)?.[0] || '?'}: ${decision}`,
        reasoning,
    };
}

/** Run a reflection check — returns whether the agent should continue */
export async function reflect(
    round: number,
    toolsUsed: string[],
    originalMessage: string,
    lastToolResults?: string,
): Promise<ReflectionResult> {
    const config = loadConfig();

    // Use the fast model alias for cheap reflection calls
    const fastModel = config.agent.modelAliases?.fast || 'openai/gpt-4o-mini';

    const prompt = buildReflectionPrompt(round, toolsUsed, originalMessage, lastToolResults);

    try {
        const response = await chat({
            model: fastModel,
            messages: [
                { role: 'system', content: 'You are a concise task progress assessor. Respond with a decision and brief reasoning.' },
                { role: 'user', content: prompt },
            ],
            maxTokens: 200,
            temperature: 0.1,
        });

        const result = parseReflection(response.content);
        logger.info(COMPONENT, `Reflection at round ${round}: ${result.decision} — ${result.reasoning.slice(0, 100)}`);
        return result;
    } catch (err) {
        logger.warn(COMPONENT, `Reflection failed: ${(err as Error).message} — defaulting to continue`);
        return {
            decision: 'continue',
            summary: 'Reflection failed, continuing',
            reasoning: `Reflection call failed: ${(err as Error).message}`,
        };
    }
}
