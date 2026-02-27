/**
 * TITAN — Response Cache (LRU)
 * Caches LLM responses for identical prompts within a time window.
 * Saves tokens and reduces latency for repeated queries.
 * No other OpenClaw clone has this.
 */
import logger from '../utils/logger.js';

const COMPONENT = 'Cache';

interface CacheEntry {
    key: string;
    response: string;
    model: string;
    createdAt: number;
    hits: number;
}

const cache: Map<string, CacheEntry> = new Map();
const MAX_CACHE_SIZE = 100;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

let totalHits = 0;
let totalMisses = 0;

/** Generate a cache key from the prompt + model */
function makeCacheKey(messages: Array<{ role: string; content?: string }>, model: string): string {
    if (!Array.isArray(messages)) return '';
    // Hash the last user message + model (most common cache scenario)
    const lastUser = messages.filter((m) => m.role === 'user').pop();
    if (!lastUser?.content) return '';

    let hash = 0;
    const str = model + ':' + lastUser.content;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}

/** Check cache for an existing response */
export function getCachedResponse(
    messages: Array<{ role: string; content?: string }>,
    model: string,
): string | null {
    const key = makeCacheKey(messages, model);
    if (!key) return null;

    const entry = cache.get(key);
    if (!entry) {
        totalMisses++;
        return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > DEFAULT_TTL_MS) {
        cache.delete(key);
        totalMisses++;
        return null;
    }

    entry.hits++;
    totalHits++;
    logger.debug(COMPONENT, `Cache HIT for ${model} (${entry.hits} hits)`);
    return entry.response;
}

/** Store a response in the cache */
export function setCachedResponse(
    messages: Array<{ role: string; content?: string }>,
    model: string,
    response: string,
): void {
    const key = makeCacheKey(messages, model);
    if (!key) return;

    // Don't cache short or error responses
    if (response.length < 10) return;
    if (response.toLowerCase().startsWith('error')) return;

    // Evict oldest if at capacity
    if (cache.size >= MAX_CACHE_SIZE) {
        const oldest = Array.from(cache.entries())
            .sort(([, a], [, b]) => a.createdAt - b.createdAt)[0];
        if (oldest) cache.delete(oldest[0]);
    }

    cache.set(key, {
        key,
        response,
        model,
        createdAt: Date.now(),
        hits: 0,
    });
}

/** Get cache statistics */
export function getCacheStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: string;
    ttlMinutes: number;
} {
    const total = totalHits + totalMisses;
    return {
        size: cache.size,
        maxSize: MAX_CACHE_SIZE,
        hits: totalHits,
        misses: totalMisses,
        hitRate: total > 0 ? `${((totalHits / total) * 100).toFixed(1)}%` : '0%',
        ttlMinutes: DEFAULT_TTL_MS / 60000,
    };
}

/** Clear all cached responses */
export function clearCache(): void {
    cache.clear();
    totalHits = 0;
    totalMisses = 0;
    logger.info(COMPONENT, 'Cache cleared');
}
