/**
 * TITAN — Adaptive Teaching Engine
 * Progressive skill reveal, first-run wizard, teach mode detection,
 * and correction learning. Generates additional system prompt content
 * based on the user's profile and behavior.
 */
import { loadConfig } from '../config/config.js';
import {
    loadProfile,
    getSkillLevel,
    getTopTools,
    isFirstRun,
    type UserProfile,
} from './userProfile.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Teaching';

/** Core tools surfaced to beginners */
const BEGINNER_TOOLS = [
    'shell', 'read_file', 'write_file', 'edit_file',
    'list_dir', 'web_search', 'memory',
];

/** Tool progression map — when user uses key tool enough, suggest related */
const TOOL_SUGGESTIONS: Record<string, { threshold: number; suggest: string; explanation: string }[]> = {
    shell: [
        { threshold: 10, suggest: 'code_exec', explanation: 'You\'ve been using `shell` a lot — did you know about `code_exec` for sandboxed execution? It runs code in a Docker container so you can experiment safely.' },
    ],
    web_search: [
        { threshold: 5, suggest: 'web_fetch', explanation: 'Since you search the web often, try `web_fetch` to grab full page content from URLs.' },
        { threshold: 10, suggest: 'browse_url', explanation: 'For interactive websites, `browse_url` can navigate and interact with pages using a real browser.' },
    ],
    read_file: [
        { threshold: 15, suggest: 'edit_file', explanation: 'You read files frequently — `edit_file` lets you make targeted find/replace edits without rewriting the whole file.' },
    ],
    memory: [
        { threshold: 5, suggest: 'web_search', explanation: 'Your memory is growing! Combine it with `web_search` to research and store findings.' },
    ],
    write_file: [
        { threshold: 10, suggest: 'cron', explanation: 'You create files often — `cron` can schedule automated tasks that generate reports or backups.' },
    ],
};

/** Patterns that indicate the user is asking for help/education */
const TEACH_PATTERNS = [
    /^how\s+(do|can|would|should)\s+i\b/i,
    /^what\s+(is|are|does)\s+/i,
    /^explain\s+/i,
    /^teach\s+me\b/i,
    /^show\s+me\s+how\b/i,
    /^can\s+you\s+(explain|teach|show)\b/i,
    /^help\s+me\s+(understand|learn)\b/i,
    /^what('s| is)\s+the\s+difference\b/i,
];

/** Patterns that indicate a user correction */
const CORRECTION_PATTERNS = [
    /^no,?\s+(do|use|try|make|instead)\b/i,
    /^actually,?\s+/i,
    /^that's\s+(not|wrong)\b/i,
    /^i\s+(meant|wanted|need)\b/i,
    /^not\s+that,?\s+/i,
    /^wrong,?\s+/i,
    /^instead,?\s+/i,
];

/** Generate a first-run wizard system message */
export function getFirstRunMessage(): string {
    return [
        'Welcome to TITAN! I\'m your AI assistant. Let\'s set things up for you.',
        '',
        'What best describes your primary use case?',
        '1. **Developer** — coding, debugging, DevOps, git workflows',
        '2. **Homelab** — server management, automation, monitoring',
        '3. **Business** — research, email, scheduling, data analysis',
        '4. **Creative** — music production, content creation, media',
        '',
        'Just reply with the number or description, and I\'ll tailor my defaults for you.',
        'You can always change this later with `/config`.',
    ].join('\n');
}

/** Map a first-run use case choice to default preferences */
export function mapUseCaseDefaults(choice: string): Record<string, string> {
    const lower = choice.toLowerCase();
    if (lower.includes('1') || lower.includes('developer') || lower.includes('dev') || lower.includes('coding')) {
        return { useCase: 'developer', focus: 'code', preferredTools: 'shell,read_file,write_file,edit_file,list_dir' };
    }
    if (lower.includes('2') || lower.includes('homelab') || lower.includes('server')) {
        return { useCase: 'homelab', focus: 'infrastructure', preferredTools: 'shell,read_file,web_search,cron,memory' };
    }
    if (lower.includes('3') || lower.includes('business') || lower.includes('research')) {
        return { useCase: 'business', focus: 'productivity', preferredTools: 'web_search,memory,email,web_fetch' };
    }
    if (lower.includes('4') || lower.includes('creative') || lower.includes('music')) {
        return { useCase: 'creative', focus: 'media', preferredTools: 'shell,read_file,write_file,web_search,memory' };
    }
    return { useCase: 'general', focus: 'general', preferredTools: 'shell,read_file,write_file,web_search,memory' };
}

/** Detect if a message is a teaching/educational request */
export function isTeachRequest(message: string): boolean {
    return TEACH_PATTERNS.some(p => p.test(message.trim()));
}

/** Detect if a message is a user correction */
export function isCorrection(message: string): boolean {
    return CORRECTION_PATTERNS.some(p => p.test(message.trim()));
}

/** Get tool suggestions based on current usage patterns */
export function getToolSuggestions(profile: UserProfile, revealThreshold: number): string[] {
    const suggestions: string[] = [];

    for (const [toolName, count] of Object.entries(profile.toolUsage)) {
        const mappings = TOOL_SUGGESTIONS[toolName];
        if (!mappings) continue;

        for (const mapping of mappings) {
            const effectiveThreshold = Math.max(mapping.threshold, revealThreshold);
            if (count >= effectiveThreshold && !profile.toolUsage[mapping.suggest]) {
                suggestions.push(mapping.explanation);
            }
        }
    }

    return suggestions;
}

/** Get the list of tools to surface based on skill level */
export function getRecommendedTools(profile: UserProfile): string[] {
    const level = profile.skillLevel;
    if (level === 'beginner') return [...BEGINNER_TOOLS];

    // Intermediate: beginner tools + their most used
    const topUsed = Object.keys(profile.toolUsage).slice(0, 12);
    const merged = new Set([...BEGINNER_TOOLS, ...topUsed]);

    if (level === 'advanced') {
        // Advanced users get everything
        return [];  // empty = no filtering
    }

    return [...merged];
}

/**
 * Generate teaching context to inject into the system prompt.
 * Returns additional instructions based on the user's profile.
 */
export function getTeachingContext(_userId?: string): string {
    const config = loadConfig();
    const teaching = config.teaching;

    if (!teaching?.enabled) return '';

    const profile = loadProfile();
    const parts: string[] = [];

    // First-run wizard
    if (teaching.firstRunWizard && isFirstRun()) {
        parts.push(getFirstRunMessage());
        return parts.join('\n\n');
    }

    // Skill level context
    const level = getSkillLevel();
    if (level === 'beginner') {
        parts.push(
            'The user is new to TITAN. Provide brief explanations when using tools. ' +
            'Keep responses simple and offer to explain concepts when relevant.'
        );
    } else if (level === 'intermediate') {
        parts.push(
            'The user has moderate experience with TITAN. Be concise but still explain ' +
            'advanced features when first introducing them.'
        );
    }

    // Progressive tool suggestions
    const suggestions = getToolSuggestions(profile, teaching.revealThreshold ?? 5);
    if (suggestions.length > 0) {
        parts.push('Tool suggestions to mention when relevant:\n' + suggestions.map(s => `- ${s}`).join('\n'));
    }

    // Recent corrections context
    const recentCorrections = profile.corrections.slice(-5);
    if (recentCorrections.length > 0) {
        const correctionNotes = recentCorrections
            .map(c => `- When "${c.context.slice(0, 60)}", user prefers: ${c.correction.slice(0, 100)}`)
            .join('\n');
        parts.push('User preferences from past corrections:\n' + correctionNotes);
    }

    // Hints
    if (teaching.showHints) {
        const topTools = getTopTools(3);
        if (topTools.length > 0) {
            const topNames = topTools.map(t => t.name).join(', ');
            parts.push(`User's most-used tools: ${topNames}`);
        }
    }

    if (parts.length === 0) return '';

    logger.debug(COMPONENT, `Generated teaching context for ${level} user (${parts.length} sections)`);
    return parts.join('\n\n');
}
