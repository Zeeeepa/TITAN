/**
 * TITAN — Learning Engine
 * Continuous self-improvement: learns from interactions, tracks patterns,
 * builds a knowledge base, and improves tool selection over time.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import { ensureDir } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Learning';
const KNOWLEDGE_FILE = join(TITAN_HOME, 'knowledge.json');

export interface LearningEntry {
    id: string;
    type: 'skill_usage' | 'error_pattern' | 'user_correction' | 'successful_pattern' | 'fact' | 'preference';
    category: string;
    content: string;
    context?: string;
    score: number;          // confidence/usefulness score (0-1)
    accessCount: number;    // how often this knowledge was retrieved
    createdAt: string;
    updatedAt: string;
}

interface KnowledgeBase {
    entries: LearningEntry[];
    toolSuccessRates: Record<string, { success: number; fail: number; total: number }>;
    errorPatterns: Record<string, { count: number; lastSeen: string; resolution?: string }>;
    userCorrections: Array<{ original: string; correction: string; timestamp: string }>;
    conversationInsights: Array<{ topic: string; outcome: string; toolsUsed: string[]; timestamp: string }>;
}

let kb: KnowledgeBase | null = null;

function loadKnowledgeBase(): KnowledgeBase {
    if (kb) return kb;
    ensureDir(TITAN_HOME);
    if (existsSync(KNOWLEDGE_FILE)) {
        try {
            kb = JSON.parse(readFileSync(KNOWLEDGE_FILE, 'utf-8'));
            // Ensure fields exist
            kb!.entries = kb!.entries || [];
            kb!.toolSuccessRates = kb!.toolSuccessRates || {};
            kb!.errorPatterns = kb!.errorPatterns || {};
            kb!.userCorrections = kb!.userCorrections || [];
            kb!.conversationInsights = kb!.conversationInsights || [];
        } catch {
            kb = createEmptyKB();
        }
    } else {
        kb = createEmptyKB();
    }
    return kb!;
}

function createEmptyKB(): KnowledgeBase {
    return {
        entries: [],
        toolSuccessRates: {},
        errorPatterns: {},
        userCorrections: [],
        conversationInsights: [],
    };
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (!kb) return;
        ensureDir(TITAN_HOME);
        try {
            writeFileSync(KNOWLEDGE_FILE, JSON.stringify(kb, null, 2), 'utf-8');
        } catch (err) {
            logger.error(COMPONENT, `Failed to save knowledge base: ${(err as Error).message}`);
        }
    }, 2000);
}

/** Initialize the learning engine */
export function initLearning(): void {
    loadKnowledgeBase();
    logger.info(COMPONENT, `Learning engine initialized (${kb?.entries.length ?? 0} knowledge entries)`);
}

/** Record a tool execution result for learning */
export function recordToolResult(toolName: string, success: boolean, context?: string, error?: string): void {
    const k = loadKnowledgeBase();

    // Update tool success rates
    if (!k.toolSuccessRates[toolName]) {
        k.toolSuccessRates[toolName] = { success: 0, fail: 0, total: 0 };
    }
    k.toolSuccessRates[toolName].total++;
    if (success) {
        k.toolSuccessRates[toolName].success++;
    } else {
        k.toolSuccessRates[toolName].fail++;
        // Track error patterns
        if (error) {
            const pattern = error.slice(0, 200);
            if (!k.errorPatterns[pattern]) {
                k.errorPatterns[pattern] = { count: 0, lastSeen: '' };
            }
            k.errorPatterns[pattern].count++;
            k.errorPatterns[pattern].lastSeen = new Date().toISOString();
        }
    }

    debouncedSave();
}

/** Record a successful interaction pattern */
export function recordSuccessPattern(pattern: {
    topic: string;
    toolsUsed: string[];
    outcome: string;
}): void {
    const k = loadKnowledgeBase();
    k.conversationInsights.push({
        ...pattern,
        timestamp: new Date().toISOString(),
    });
    // Keep last 500 insights
    if (k.conversationInsights.length > 500) {
        k.conversationInsights = k.conversationInsights.slice(-500);
    }
    debouncedSave();
}

/** Record a user correction to learn from mistakes */
export function recordUserCorrection(original: string, correction: string): void {
    const k = loadKnowledgeBase();
    k.userCorrections.push({
        original,
        correction,
        timestamp: new Date().toISOString(),
    });
    if (k.userCorrections.length > 200) {
        k.userCorrections = k.userCorrections.slice(-200);
    }
    debouncedSave();
}

/** Learn a new fact or update an existing one */
export function learnFact(category: string, content: string, context?: string): void {
    const k = loadKnowledgeBase();
    const id = `${category}:${content.slice(0, 50)}`;
    const existing = k.entries.findIndex((e) => e.id === id);

    if (existing >= 0) {
        k.entries[existing].score = Math.min(k.entries[existing].score + 0.1, 1.0);
        k.entries[existing].accessCount++;
        k.entries[existing].updatedAt = new Date().toISOString();
    } else {
        k.entries.push({
            id,
            type: 'fact',
            category,
            content,
            context,
            score: 0.5,
            accessCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }
    // Keep entries under 2000
    if (k.entries.length > 2000) {
        // Remove lowest-scored entries
        k.entries.sort((a, b) => b.score - a.score);
        k.entries = k.entries.slice(0, 1500);
    }
    debouncedSave();
}

/** Query the knowledge base for relevant information */
export function queryKnowledge(query: string, category?: string, limit: number = 10): LearningEntry[] {
    const k = loadKnowledgeBase();
    const q = query.toLowerCase();

    let results = k.entries.filter((e) => {
        const matchesQuery = e.content.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q) ||
            (e.context && e.context.toLowerCase().includes(q));
        const matchesCategory = !category || e.category === category;
        return matchesQuery && matchesCategory;
    });

    // Sort by score (most useful first), then by recency
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.updatedAt.localeCompare(a.updatedAt);
    });

    // Boost access count for retrieved entries
    for (const entry of results.slice(0, limit)) {
        entry.accessCount++;
        entry.score = Math.min(entry.score + 0.01, 1.0);
    }

    debouncedSave();
    return results.slice(0, limit);
}

/** Get tool recommendations based on historical success rates */
export function getToolRecommendations(): Record<string, number> {
    const k = loadKnowledgeBase();
    const recommendations: Record<string, number> = {};

    for (const [tool, stats] of Object.entries(k.toolSuccessRates)) {
        if (stats.total > 0) {
            recommendations[tool] = stats.success / stats.total;
        }
    }

    return recommendations;
}

/** Get learning summary for the system prompt */
export function getLearningContext(): string {
    const k = loadKnowledgeBase();
    const parts: string[] = [];

    // Recent high-score knowledge
    const topEntries = k.entries
        .filter((e) => e.score > 0.6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    if (topEntries.length > 0) {
        parts.push('Key learned facts:');
        for (const e of topEntries) {
            parts.push(`- [${e.category}] ${e.content}`);
        }
    }

    // Tool recommendations
    const toolRecs = getToolRecommendations();
    const bestTools = Object.entries(toolRecs)
        .filter(([_, rate]) => rate > 0.8)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (bestTools.length > 0) {
        parts.push('\nMost reliable tools:');
        for (const [tool, rate] of bestTools) {
            parts.push(`- ${tool}: ${Math.round(rate * 100)}% success rate`);
        }
    }

    // Common error patterns to avoid
    const frequentErrors = Object.entries(k.errorPatterns)
        .filter(([_, info]) => info.count > 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

    if (frequentErrors.length > 0) {
        parts.push('\nCommon errors to avoid:');
        for (const [pattern, info] of frequentErrors) {
            parts.push(`- ${pattern.slice(0, 100)} (seen ${info.count}x)${info.resolution ? ` → Fix: ${info.resolution}` : ''}`);
        }
    }

    return parts.join('\n');
}

/** Get stats about the learning system */
export function getLearningStats(): {
    knowledgeEntries: number;
    toolsTracked: number;
    errorPatterns: number;
    corrections: number;
    insights: number;
} {
    const k = loadKnowledgeBase();
    return {
        knowledgeEntries: k.entries.length,
        toolsTracked: Object.keys(k.toolSuccessRates).length,
        errorPatterns: Object.keys(k.errorPatterns).length,
        corrections: k.userCorrections.length,
        insights: k.conversationInsights.length,
    };
}
