/**
 * TITAN — Prompt Injection Shield
 * Heuristic pattern matching and intent analysis to block malicious payloads
 * before the LLM processes them. Discards jailbreaks, instruction overrides,
 * and system prompt extraction attempts.
 */
import logger from '../utils/logger.js';
import { loadConfig } from '../config/config.js';

const COMPONENT = 'Shield';

export interface ShieldResult {
    safe: boolean;
    reason?: string;
    matchedPattern?: string;
}

// Common prompt injection heuristics
const INJECTION_PATTERNS = [
    // Ignore previous instructions
    /(?:ignore|disregard|forget)(?: all)? (?:previous|prior) (?:instructions|directions|prompts|rules)/i,
    /ignore the above/i,
    // Roleplay / Jailbreak
    /(?:you are now|pretend you are|act as) (?:a|an) (?:unrestricted|unbound|developer mode|DAN|do anything now)/i,
    /system override|override authorization/i,
    // Prompt extraction
    /(?:repeat|print|output|show|tell me) (?:the|all|your) (?:instructions|system prompt|initial prompt|rules|directives)/i,
    // Base64 disguised injections
    /(?:decode|translate) (?:this|the following) base64/i,
    // Markdown link exploits
    /\[.*\]\(javascript:/i,
];

// High-risk keywords that trigger extra scrutiny in strict mode
const STRICT_KEYWORDS = [
    'system prompt',
    'ignore previous',
    'developer mode',
    'unrestricted',
    'bypass',
    'DAN',
];

/**
 * Check if text contains a prompt injection attack
 */
export function checkPromptInjection(text: string): ShieldResult {
    const config = loadConfig();
    const shieldConfig = (config as any).security?.shield || { enabled: true, mode: 'strict' };

    if (!shieldConfig.enabled) {
        return { safe: true };
    }

    const normalized = text.toLowerCase().trim();

    // 1. Heuristic Pattern Matching
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(normalized)) {
            logger.warn(COMPONENT, `🛡️ Blocked prompt injection attempt! Pattern: ${pattern}`);
            return {
                safe: false,
                reason: 'Input matches known prompt injection signatures.',
                matchedPattern: pattern.toString(),
            };
        }
    }

    // 2. Strict Mode Scrutiny (Token density / keyword density)
    if (shieldConfig.mode === 'strict') {
        let flagCount = 0;
        for (const kw of STRICT_KEYWORDS) {
            if (normalized.includes(kw)) {
                flagCount++;
            }
        }

        if (flagCount >= 2) {
            logger.warn(COMPONENT, `🛡️ Blocked suspicious request! (Strict mode keyword density)`);
            return {
                safe: false,
                reason: 'Input contains too many high-risk keywords (strict mode).',
            };
        }

        // Huge prompts often hide injections at the very end
        if (normalized.length > 5000) {
            const tail = normalized.slice(-500);
            for (const pattern of INJECTION_PATTERNS) {
                if (pattern.test(tail)) {
                    logger.warn(COMPONENT, `🛡️ Blocked prompt injection in payload tail.`);
                    return { safe: false, reason: 'Injection pattern found at end of large payload.' };
                }
            }
        }
    }

    return { safe: true };
}
