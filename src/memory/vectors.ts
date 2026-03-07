/**
 * TITAN — Local Vector Search
 * Semantic memory search using Ollama embeddings. Zero external dependencies.
 * Stores vectors in ~/.titan/vectors.json. Searches by cosine similarity.
 *
 * This is Tier 2 of the 3-tier memory architecture:
 *   Tier 1: Working memory (SOUL.md, profile, session history)
 *   Tier 2: Semantic vector search (this module) — long-term recall
 *   Tier 3: Deterministic storage (JSON key-value / structured data)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Vectors';
const TITAN_HOME = join(homedir(), '.titan');
const VECTORS_PATH = join(TITAN_HOME, 'vectors.json');
const MAX_VECTORS = 10000;
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

// ── Data Model ──────────────────────────────────────────────────────

interface VectorEntry {
    id: string;
    text: string;
    vector: number[];
    source: string;         // 'memory' | 'graph' | 'learning' | 'conversation'
    metadata?: string;       // JSON-encoded metadata
    createdAt: string;
}

interface VectorStore {
    entries: VectorEntry[];
    model: string;           // Embedding model used (if model changes, re-embed)
    dimensions: number;
}

interface SearchResult {
    id: string;
    text: string;
    source: string;
    score: number;           // Cosine similarity (0-1)
    metadata?: string;
}

// ── State ───────────────────────────────────────────────────────────

let store: VectorStore | null = null;
let available = false;
let embeddingBaseUrl = '';
let embeddingModel = DEFAULT_EMBEDDING_MODEL;

// ── Persistence ─────────────────────────────────────────────────────

function loadVectorStore(): VectorStore {
    if (store) return store;
    mkdirSync(TITAN_HOME, { recursive: true });

    if (existsSync(VECTORS_PATH)) {
        try {
            const raw = readFileSync(VECTORS_PATH, 'utf-8');
            store = JSON.parse(raw) as VectorStore;
            store.entries = store.entries || [];
        } catch {
            logger.warn(COMPONENT, 'Could not load vector store, creating fresh');
            store = { entries: [], model: embeddingModel, dimensions: 0 };
        }
    } else {
        store = { entries: [], model: embeddingModel, dimensions: 0 };
    }
    return store;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (!store) return;
        try {
            writeFileSync(VECTORS_PATH, JSON.stringify(store), 'utf-8');
        } catch (e) {
            logger.error(COMPONENT, `Failed to save vectors: ${(e as Error).message}`);
        }
    }, 2000);
}

// ── Ollama Embedding API ────────────────────────────────────────────

/** Generate embeddings via Ollama's /api/embed endpoint */
async function embed(text: string): Promise<number[] | null> {
    if (!available) return null;

    try {
        const response = await fetch(`${embeddingBaseUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: embeddingModel,
                input: text.slice(0, 8000), // Limit input size
            }),
        });

        if (!response.ok) {
            logger.warn(COMPONENT, `Embedding API returned ${response.status}`);
            return null;
        }

        const data = await response.json() as { embeddings?: number[][] };
        if (data.embeddings && data.embeddings[0]) {
            return data.embeddings[0];
        }
        return null;
    } catch (e) {
        logger.debug(COMPONENT, `Embedding failed: ${(e as Error).message}`);
        return null;
    }
}

// ── Cosine Similarity ───────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

// ── Public API ──────────────────────────────────────────────────────

/** Initialize the vector search system. Checks Ollama availability. */
export async function initVectors(): Promise<boolean> {
    const config = loadConfig();
    const memConfig = config.memory as { vectorSearchEnabled?: boolean; embeddingModel?: string };

    if (!memConfig.vectorSearchEnabled) {
        logger.info(COMPONENT, 'Vector search disabled in config');
        return false;
    }

    // Use Ollama provider's baseUrl
    embeddingBaseUrl = config.providers.ollama?.baseUrl || 'http://localhost:11434';
    embeddingModel = memConfig.embeddingModel || DEFAULT_EMBEDDING_MODEL;

    // Test connectivity
    try {
        const resp = await fetch(`${embeddingBaseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        // Check if embedding model is available
        const data = await resp.json() as { models?: Array<{ name: string }> };
        const models = data.models || [];
        const hasModel = models.some(m => m.name.startsWith(embeddingModel));

        if (!hasModel) {
            logger.warn(COMPONENT, `Embedding model "${embeddingModel}" not found on Ollama. Run: ollama pull ${embeddingModel}`);
            // Try to pull it
            logger.info(COMPONENT, `Attempting to pull ${embeddingModel}...`);
            try {
                await fetch(`${embeddingBaseUrl}/api/pull`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: embeddingModel, stream: false }),
                    signal: AbortSignal.timeout(120000),
                });
                logger.info(COMPONENT, `Pulled ${embeddingModel} successfully`);
            } catch {
                logger.warn(COMPONENT, `Could not auto-pull ${embeddingModel}. Vector search unavailable.`);
                return false;
            }
        }

        // Test embedding
        const testVec = await embed('test');
        if (!testVec) {
            logger.warn(COMPONENT, 'Embedding test failed');
            return false;
        }

        available = true;
        loadVectorStore();

        // Check if model changed (need to re-embed)
        if (store && store.model !== embeddingModel && store.entries.length > 0) {
            logger.warn(COMPONENT, `Embedding model changed (${store.model} → ${embeddingModel}). Vector store will be rebuilt.`);
            store.entries = [];
            store.model = embeddingModel;
        }
        if (store) {
            store.model = embeddingModel;
            store.dimensions = testVec.length;
        }

        logger.info(COMPONENT, `Vector search ready: ${store?.entries.length || 0} vectors, ${testVec.length}d, model=${embeddingModel}`);
        return true;
    } catch (e) {
        logger.info(COMPONENT, `Ollama not available for vector search: ${(e as Error).message}`);
        return false;
    }
}

/** Check if vector search is available */
export function isVectorSearchAvailable(): boolean {
    return available;
}

/** Add text to the vector store */
export async function addVector(
    id: string,
    text: string,
    source: string,
    metadata?: Record<string, unknown>,
): Promise<boolean> {
    if (!available) return false;
    const s = loadVectorStore();

    // Skip if already exists with same text
    const existing = s.entries.find(e => e.id === id);
    if (existing && existing.text === text) return true;

    const vector = await embed(text);
    if (!vector) return false;

    // Update or insert
    if (existing) {
        existing.text = text;
        existing.vector = vector;
        existing.metadata = metadata ? JSON.stringify(metadata) : undefined;
    } else {
        s.entries.push({
            id,
            text,
            vector,
            source,
            metadata: metadata ? JSON.stringify(metadata) : undefined,
            createdAt: new Date().toISOString(),
        });
    }

    // Cap size
    if (s.entries.length > MAX_VECTORS) {
        s.entries = s.entries.slice(-MAX_VECTORS);
    }

    debouncedSave();
    return true;
}

/** Search vectors by semantic similarity */
export async function searchVectors(
    query: string,
    limit: number = 10,
    source?: string,
    minScore: number = 0.3,
): Promise<SearchResult[]> {
    if (!available) return [];
    const s = loadVectorStore();
    if (s.entries.length === 0) return [];

    const queryVec = await embed(query);
    if (!queryVec) return [];

    let candidates = s.entries;
    if (source) {
        candidates = candidates.filter(e => e.source === source);
    }

    const scored = candidates
        .map(entry => ({
            id: entry.id,
            text: entry.text,
            source: entry.source,
            score: cosineSimilarity(queryVec, entry.vector),
            metadata: entry.metadata,
        }))
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scored;
}

/** Remove a vector by ID */
export function removeVector(id: string): boolean {
    if (!store) return false;
    const before = store.entries.length;
    store.entries = store.entries.filter(e => e.id !== id);
    if (store.entries.length < before) {
        debouncedSave();
        return true;
    }
    return false;
}

/** Get vector store stats */
export function getVectorStats(): {
    available: boolean;
    model: string;
    dimensions: number;
    vectorCount: number;
    bySource: Record<string, number>;
} {
    const s = store || { entries: [], model: embeddingModel, dimensions: 0 };
    const bySource: Record<string, number> = {};
    for (const e of s.entries) {
        bySource[e.source] = (bySource[e.source] || 0) + 1;
    }
    return {
        available,
        model: s.model,
        dimensions: s.dimensions,
        vectorCount: s.entries.length,
        bySource,
    };
}

/** Flush and save immediately */
export function flushVectors(): void {
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
    if (store) {
        try {
            writeFileSync(VECTORS_PATH, JSON.stringify(store), 'utf-8');
        } catch { /* ignore */ }
    }
}
