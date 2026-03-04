/**
 * TITAN — Stall Detector
 * Monitors the agent loop for stalls and automatically nudges it forward.
 * 
 * Detects:
 *  1. Silence stalls — no output for N seconds
 *  2. Tool loops — same tool + same args called 3+ times in a row  
 *  3. Empty/repetitive responses — LLM generates useless content
 * 
 * When detected, injects a gentle nudge so the agent recovers gracefully
 * instead of spinning forever or going silent.
 */
import logger from '../utils/logger.js';

const COMPONENT = 'StallDetector';

// ─── Config ───────────────────────────────────────────────────────
let stallThresholdMs = 30_000; // 30 seconds (default, auto-tuned for CPU-only)
const MAX_TOOL_LOOP_REPEATS = 3;
const MAX_NUDGE_ATTEMPTS = 2;

/** Set the stall detection timeout (e.g. 120_000 for CPU-only inference) */
export function setStallThreshold(ms: number): void {
    stallThresholdMs = ms;
    logger.info(COMPONENT, `Stall threshold set to ${ms / 1000}s`);
}

// ─── Types ────────────────────────────────────────────────────────
export type StallType = 'silence' | 'tool_loop' | 'empty_response' | 'max_rounds';

export interface StallEvent {
    type: StallType;
    sessionId: string;
    detectedAt: string;
    detail: string;
    nudgeCount: number;
}

export interface ToolCallRecord {
    name: string;
    argsHash: string;
    calledAt: number;
}

// ─── Per-session state ────────────────────────────────────────────
interface SessionState {
    lastEventMs: number;
    toolHistory: ToolCallRecord[];
    nudgeCount: number;
    stallCount: number;
    timer?: ReturnType<typeof setTimeout>;
}

const sessions: Map<string, SessionState> = new Map();
let onStall: ((event: StallEvent) => Promise<string>) | null = null;

// ─── Helpers ──────────────────────────────────────────────────────
function hashArgs(args: Record<string, unknown>): string {
    try { return JSON.stringify(args, Object.keys(args).sort()); } catch { return '{}'; }
}

function getOrCreate(sessionId: string): SessionState {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { lastEventMs: Date.now(), toolHistory: [], nudgeCount: 0, stallCount: 0 });
    }
    return sessions.get(sessionId)!;
}

// ─── Public API ───────────────────────────────────────────────────

/** Set the callback invoked when a stall is detected. Should return a nudge message. */
export function setStallHandler(handler: (event: StallEvent) => Promise<string>): void {
    onStall = handler;
}

/** Call this every time the agent receives or sends any message */
export function heartbeat(sessionId: string): void {
    const state = getOrCreate(sessionId);
    state.lastEventMs = Date.now();
    clearTimeout(state.timer);

    // Start the silence watchdog
    state.timer = setTimeout(() => {
        triggerStall(sessionId, 'silence', `No agent activity for ${stallThresholdMs / 1000}s`)
            .catch((err) => logger.error(COMPONENT, `Stall trigger error: ${(err as Error).message}`));
    }, stallThresholdMs);
}

/** Call this every time a tool is invoked */
export function recordToolCall(sessionId: string, name: string, args: Record<string, unknown>): StallEvent | null {
    const state = getOrCreate(sessionId);
    const argsHash = hashArgs(args);

    state.toolHistory.push({ name, argsHash, calledAt: Date.now() });
    if (state.toolHistory.length > 10) state.toolHistory.shift();

    // Check for tool loop: last N calls all identical
    const recent = state.toolHistory.slice(-MAX_TOOL_LOOP_REPEATS);
    if (
        recent.length === MAX_TOOL_LOOP_REPEATS &&
        recent.every((r) => r.name === name && r.argsHash === argsHash)
    ) {
        const event: StallEvent = {
            type: 'tool_loop',
            sessionId,
            detectedAt: new Date().toISOString(),
            detail: `Tool "${name}" called ${MAX_TOOL_LOOP_REPEATS}x with identical arguments`,
            nudgeCount: state.nudgeCount,
        };
        state.stallCount++;
        logger.warn(COMPONENT, `Tool loop detected in session ${sessionId}: ${name}`);
        return event;
    }

    heartbeat(sessionId);
    return null;
}

/** Call this when the LLM returns a response to check for empty/repetitive content */
export function checkResponse(sessionId: string, content: string, round: number, maxRounds: number): StallEvent | null {
    heartbeat(sessionId);

    if (!content || content.trim().length < 3) {
        const state = getOrCreate(sessionId);
        state.stallCount++;
        return {
            type: 'empty_response',
            sessionId,
            detectedAt: new Date().toISOString(),
            detail: 'LLM returned an empty or near-empty response',
            nudgeCount: state.nudgeCount,
        };
    }

    if (round >= maxRounds - 1) {
        const state = getOrCreate(sessionId);
        state.stallCount++;
        return {
            type: 'max_rounds',
            sessionId,
            detectedAt: new Date().toISOString(),
            detail: `Agent hit max tool rounds (${maxRounds}) without a final answer`,
            nudgeCount: state.nudgeCount,
        };
    }

    return null;
}

/** Get a nudge message for the given stall type */
export function getNudgeMessage(event: StallEvent): string {
    const state = sessions.get(event.sessionId);
    const nudgeNum = (state?.nudgeCount ?? 0) + 1;

    if (nudgeNum >= MAX_NUDGE_ATTEMPTS) {
        return 'I\'ve been unable to make progress on this task. Let me stop here and ask you — could you rephrase or simplify what you need? I want to make sure I help you correctly.';
    }

    const nudges: Record<StallType, string[]> = {
        silence: [
            'You seem to have paused. What\'s your next step? If you\'re stuck, say so and I\'ll help break the task down.',
            'Still working on this? Let me know what\'s blocking you and we\'ll figure it out together.',
        ],
        tool_loop: [
            'I noticed I\'ve been repeating the same action. Let me try a completely different approach.',
            'I seem to be going in circles. Let me step back and rethink this from scratch.',
        ],
        empty_response: [
            'I didn\'t generate a useful response there. Let me try again with a clearer focus.',
            'Something went wrong with my last response. Let me start over with this task.',
        ],
        max_rounds: [
            'I\'ve taken many steps on this task. Let me summarize what I\'ve done so far and ask if you\'d like me to continue.',
            'I\'ve hit my action limit. Here\'s where I stand — tell me how you\'d like to proceed.',
        ],
    };

    const options = nudges[event.type];
    return options[Math.min(nudgeNum - 1, options.length - 1)];
}

/** Trigger a stall event and invoke the handler */
async function triggerStall(sessionId: string, type: StallType, detail: string): Promise<void> {
    const state = getOrCreate(sessionId);
    state.stallCount++;
    state.nudgeCount++;

    const event: StallEvent = {
        type,
        sessionId,
        detectedAt: new Date().toISOString(),
        detail,
        nudgeCount: state.nudgeCount,
    };

    logger.warn(COMPONENT, `Stall detected [${type}] in session ${sessionId}: ${detail}`);

    if (onStall) {
        await onStall(event).catch((e) => {
            logger.error(COMPONENT, `Stall handler error: ${e.message}`);
        });
    }
}

/** Stop monitoring a session */
export function clearSession(sessionId: string): void {
    const state = sessions.get(sessionId);
    if (state?.timer) clearTimeout(state.timer);
    sessions.delete(sessionId);
}

/** Get stall stats across all sessions */
export function getStallStats(): { sessionId: string; stallCount: number; nudgeCount: number }[] {
    return Array.from(sessions.entries()).map(([id, s]) => ({
        sessionId: id,
        stallCount: s.stallCount,
        nudgeCount: s.nudgeCount,
    }));
}
