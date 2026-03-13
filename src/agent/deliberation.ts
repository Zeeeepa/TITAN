/**
 * TITAN — Deliberative Reasoning Engine
 * When TITAN detects an ambitious/complex request, it thinks deeply,
 * builds a structured plan, presents it for approval, then executes step-by-step.
 */
import { chat } from '../providers/router.js';
import { classifyComplexity } from './costOptimizer.js';
import { createPlan, getReadyTasks, startTask, completeTask, failTask, getPlanStatus, checkpointPlan, type Plan } from './planner.js';
import { processMessage } from './agent.js';
import type { TitanConfig } from '../config/schema.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Deliberation';

export type DeliberationStage = 'analyzing' | 'planning' | 'awaiting_approval' | 'executing' | 'completed' | 'cancelled' | 'failed';

export interface DeliberationState {
    sessionId: string;
    stage: DeliberationStage;
    originalMessage: string;
    analysis?: string;
    plan?: Plan;
    planMarkdown?: string;
    results: Array<{ taskId: string; result: string; success: boolean }>;
    error?: string;
    createdAt: number;
}

const activeDeliberations: Map<string, DeliberationState> = new Map();

/** Check if deliberation should be triggered for this message */
export function shouldDeliberate(message: string, config: TitanConfig): boolean {
    // Only trigger deliberation when explicitly requested with /plan prefix
    // Auto-detection requires BOTH deliberation.enabled AND deliberation.autoDetect to be true
    logger.info(COMPONENT, `shouldDeliberate check: enabled=${config.deliberation?.enabled}, autoDetect=${config.deliberation?.autoDetect}`);
    if (!config.deliberation?.enabled) return false;
    if (message.trim().toLowerCase().startsWith('/plan')) return true;
    // autoDetect defaults to false — only enable if explicitly set to true in config
    if (config.deliberation?.autoDetect !== true) return false;
    const complexity = classifyComplexity(message);
    // In autonomous mode with autoDeliberate, trigger on 'moderate' complexity too
    const autonomy = config.autonomy as Record<string, unknown> | undefined;
    const isAutonomous = autonomy?.mode === 'autonomous';
    const autoDelib = autonomy?.autoDeliberate as boolean;
    if (isAutonomous && autoDelib) {
        return complexity === 'ambitious' || complexity === 'moderate';
    }
    return complexity === 'ambitious';
}

/** Get the reasoning model to use — always falls back to the agent's configured model */
function getReasoningModel(config: TitanConfig): string {
    return config.deliberation.reasoningModel
        || config.agent.modelAliases?.reasoning
        || config.agent.modelAliases?.fast
        || config.agent.model;
}

/** Stage 1: Analyze the request from multiple angles */
export async function analyze(message: string, sessionId: string, config: TitanConfig): Promise<DeliberationState> {
    const state: DeliberationState = {
        sessionId,
        stage: 'analyzing',
        originalMessage: message,
        results: [],
        createdAt: Date.now(),
    };
    activeDeliberations.set(sessionId, state);

    const reasoningModel = getReasoningModel(config);
    logger.info(COMPONENT, `Analyzing request with ${reasoningModel}: "${message.slice(0, 80)}..."`);

    // Only enable thinking for models known to support it (e.g., o3, Claude)
    const supportsThinking = /\b(o[1-9]|claude)/i.test(reasoningModel);

    try {
        const response = await chat({
            model: reasoningModel,
            messages: [
                {
                    role: 'system',
                    content: 'You are a strategic analyst. Analyze this request from multiple angles: feasibility, prerequisites, risks, and possible approaches. Be thorough but concise. Do NOT execute anything — just analyze.',
                },
                { role: 'user', content: message },
            ],
            maxTokens: 2000,
            temperature: 0.3,
            ...(supportsThinking ? { thinking: true, thinkingLevel: 'high' as const } : {}),
        });

        state.analysis = response.content;
        state.stage = 'planning';
        logger.info(COMPONENT, `Analysis complete (${response.content.length} chars)`);
    } catch (err) {
        state.stage = 'failed';
        state.error = (err as Error).message;
        logger.error(COMPONENT, `Analysis failed: ${state.error}`);
    }

    return state;
}

/** Stage 2: Generate a structured plan from the analysis */
export async function generatePlan(state: DeliberationState, config: TitanConfig): Promise<DeliberationState> {
    if (state.stage !== 'planning') return state;

    const reasoningModel = getReasoningModel(config);
    const maxSteps = config.deliberation.maxPlanSteps;

    logger.info(COMPONENT, `Generating plan with max ${maxSteps} steps`);

    const planPrompt = `Based on the following analysis, create a structured execution plan as JSON.

ANALYSIS:
${state.analysis}

ORIGINAL REQUEST:
${state.originalMessage}

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "goal": "concise goal statement",
  "tasks": [
    {
      "title": "short task title",
      "description": "what to do in this step",
      "dependsOn": []
    }
  ]
}

Rules:
- Maximum ${maxSteps} tasks
- Tasks can reference earlier task IDs (task-1, task-2, etc.) in dependsOn
- Each task should be independently executable by an AI agent with tools
- Be specific and actionable, not vague`;

    let parsed: { goal: string; tasks: Array<{ title: string; description: string; dependsOn?: string[] }> } | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await chat({
                model: reasoningModel,
                messages: [
                    { role: 'system', content: 'You are a precise planner. Return ONLY valid JSON. No markdown, no commentary.' },
                    { role: 'user', content: planPrompt },
                ],
                maxTokens: 2000,
                temperature: 0.2,
            });

            // Strip markdown fences if present
            let jsonStr = response.content.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            parsed = JSON.parse(jsonStr);
            break;
        } catch (err) {
            logger.warn(COMPONENT, `Plan JSON parse failed (attempt ${attempt + 1}): ${(err as Error).message}`);
        }
    }

    if (!parsed || !parsed.tasks || parsed.tasks.length === 0) {
        state.stage = 'failed';
        state.error = 'Failed to generate a valid plan from the analysis.';
        return state;
    }

    // Create plan via planner
    const plan = createPlan(parsed.goal, parsed.tasks.slice(0, maxSteps));
    state.plan = plan;
    // In autonomous mode with autoDeliberate, skip the approval gate
    const autonomyConfig = config.autonomy as Record<string, unknown> | undefined;
    const isAutonomousMode = autonomyConfig?.mode === 'autonomous';
    const autoDelibEnabled = autonomyConfig?.autoDeliberate as boolean;
    const needsApproval = config.deliberation.approvalRequired && !(isAutonomousMode && autoDelibEnabled);
    state.stage = needsApproval ? 'awaiting_approval' : 'executing';
    state.planMarkdown = formatPlanForApproval(state);

    logger.info(COMPONENT, `Plan created: "${parsed.goal}" with ${plan.tasks.length} tasks`);
    return state;
}

/** Format the plan as markdown for user approval */
export function formatPlanForApproval(state: DeliberationState): string {
    if (!state.plan) return 'No plan generated.';

    const lines: string[] = [
        `## Deliberation Plan`,
        `**Goal:** ${state.plan.goal}`,
        '',
        `### Steps (${state.plan.tasks.length})`,
    ];

    for (const task of state.plan.tasks) {
        const deps = task.dependsOn.length > 0 ? ` _(depends on: ${task.dependsOn.join(', ')})_` : '';
        lines.push(`${task.id}. **${task.title}**${deps}`);
        lines.push(`   ${task.description}`);
    }

    lines.push('');
    lines.push("Reply **'yes'** to execute, **'no'** to cancel, or suggest changes.");

    return lines.join('\n');
}

/** Execute the plan step by step */
export async function executePlan(
    state: DeliberationState,
    config: TitanConfig,
    onProgress?: (event: { type: string; taskId?: string; status?: string; result?: string; planId?: string }) => void,
): Promise<DeliberationState> {
    if (!state.plan) {
        state.stage = 'failed';
        state.error = 'No plan to execute';
        return state;
    }

    state.stage = 'executing';
    const plan = state.plan;

    onProgress?.({ type: 'deliberation:started', planId: plan.id });

    // Collect prior results for context injection
    const priorResults: string[] = [];

    let ready = getReadyTasks(plan.id);
    while (ready.length > 0) {

        for (const task of ready) {
            startTask(plan.id, task.id);
            onProgress?.({ type: 'deliberation:progress', taskId: task.id, status: 'running', planId: plan.id });

            const taskPrompt = [
                `You are executing step ${task.id} of a plan.`,
                ``,
                `**Overall Goal:** ${plan.goal}`,
                `**This Step:** ${task.title}`,
                `**Instructions:** ${task.description}`,
                priorResults.length > 0 ? `\n**Results from previous steps:**\n${priorResults.join('\n')}` : '',
                ``,
                `Execute this step now using your available tools. You MUST use tool calls (web_search, web_fetch, shell, read_file, write_file, memory, etc.) to accomplish real work — do NOT hallucinate or fabricate results. If a step requires searching the web, call web_search. If it requires reading a URL, call web_fetch. Be thorough and report your actual results.`,
            ].join('\n');

            try {
                const result = await processMessage(taskPrompt, 'deliberation', 'system');
                completeTask(plan.id, task.id, result.content.slice(0, 500));
                checkpointPlan(plan.id);
                state.results.push({ taskId: task.id, result: result.content, success: true });
                priorResults.push(`[${task.id}: ${task.title}] ${result.content.slice(0, 200)}`);
                onProgress?.({ type: 'deliberation:progress', taskId: task.id, status: 'done', result: result.content.slice(0, 200), planId: plan.id });
            } catch (err) {
                const errMsg = (err as Error).message;
                failTask(plan.id, task.id, errMsg);
                state.results.push({ taskId: task.id, result: errMsg, success: false });
                onProgress?.({ type: 'deliberation:progress', taskId: task.id, status: 'failed', result: errMsg, planId: plan.id });
            }
        }

        // Check if plan completed or failed
        if (plan.status === 'completed' || plan.status === 'failed') break;

        ready = getReadyTasks(plan.id);
    }

    state.stage = plan.status === 'completed' ? 'completed' : 'failed';
    onProgress?.({ type: 'deliberation:complete', planId: plan.id, status: state.stage });

    logger.info(COMPONENT, `Plan execution ${state.stage}: ${state.results.filter(r => r.success).length}/${state.results.length} tasks succeeded`);
    return state;
}

/** Handle approval response for a pending plan */
export function handleApproval(sessionId: string, approved: boolean): DeliberationState | null {
    const state = activeDeliberations.get(sessionId);
    if (!state || state.stage !== 'awaiting_approval') return null;

    if (approved) {
        state.stage = 'executing';
    } else {
        state.stage = 'cancelled';
    }

    return state;
}

/** Cancel an active deliberation */
export function cancelDeliberation(sessionId: string): boolean {
    const state = activeDeliberations.get(sessionId);
    if (!state) return false;
    state.stage = 'cancelled';
    activeDeliberations.delete(sessionId);
    return true;
}

/** Get active deliberation for a session */
export function getDeliberation(sessionId: string): DeliberationState | undefined {
    return activeDeliberations.get(sessionId);
}

/** Build a summary of completed plan results */
export function formatPlanResults(state: DeliberationState): string {
    if (!state.plan) return 'No plan results.';

    const lines: string[] = [
        `## Plan ${state.stage === 'completed' ? 'Completed' : 'Results'}`,
        `**Goal:** ${state.plan.goal}`,
        '',
    ];

    lines.push(getPlanStatus(state.plan.id));

    if (state.results.length > 0) {
        lines.push('');
        lines.push('### Detailed Results');
        for (const r of state.results) {
            const icon = r.success ? '✅' : '❌';
            lines.push(`${icon} **${r.taskId}**: ${r.result.slice(0, 300)}`);
        }
    }

    return lines.join('\n');
}
