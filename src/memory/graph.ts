/**
 * TITAN — Native Temporal Knowledge Graph
 * Pure TypeScript graph memory: no Docker, no Python, no extra API keys.
 * Uses TITAN's own LLM for entity extraction.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { v4 as uuid } from 'uuid';
import { loadConfig } from '../config/config.js';
import { recordTokenUsage } from '../agent/costOptimizer.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Graph';
const TITAN_HOME = join(homedir(), '.titan');
const GRAPH_PATH = join(TITAN_HOME, 'graph.json');

// ── Data Model ────────────────────────────────────────────────────

export interface Episode {
    id: string;
    content: string;
    source: string;
    createdAt: string;
    entities: string[]; // Entity IDs referenced
}

export interface Entity {
    id: string;
    name: string;
    aliases: string[];
    type: string; // 'person' | 'topic' | 'project' | 'place' | 'fact'
    summary: string;
    firstSeen: string;
    lastSeen: string;
    facts: string[];
}

export interface Edge {
    id: string;
    from: string;
    to: string;
    relation: string;
    createdAt: string;
}

export interface TitanGraph {
    episodes: Episode[];
    entities: Entity[];
    edges: Edge[];
}

export interface GraphNode {
    id: string;
    label: string;
    type: string;
    size: number;
    facts: string[];
}

export interface GraphEdge {
    from: string;
    to: string;
    label: string;
}

// ── In-memory graph ───────────────────────────────────────────────
let graph: TitanGraph = { episodes: [], entities: [], edges: [] };
let initialized = false;

// ── Persistence ───────────────────────────────────────────────────
function loadGraph(): void {
    mkdirSync(TITAN_HOME, { recursive: true });
    if (existsSync(GRAPH_PATH)) {
        try {
            const raw = readFileSync(GRAPH_PATH, 'utf-8');
            const parsed = JSON.parse(raw) as TitanGraph;
            graph = {
                episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
                entities: Array.isArray(parsed.entities) ? parsed.entities : [],
                edges: Array.isArray(parsed.edges) ? parsed.edges : [],
            };
        } catch (e) {
            logger.warn(COMPONENT, `Failed to parse graph.json, starting fresh: ${(e as Error).message}`);
            graph = { episodes: [], entities: [], edges: [] };
        }
    }
}

function saveGraph(): void {
    try {
        writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), 'utf-8');
    } catch (e) {
        logger.error(COMPONENT, `Failed to save graph.json: ${(e as Error).message}`);
    }
}

// ── Init ─────────────────────────────────────────────────────────
export function initGraph(): void {
    if (initialized) return;
    loadGraph();
    initialized = true;
    logger.info(COMPONENT, `Graph loaded: ${graph.episodes.length} episodes, ${graph.entities.length} entities`);
}

// ── Entity extraction via any configured LLM ────────────────────
async function extractEntities(content: string): Promise<Array<{ name: string; type: string; facts: string[] }>> {
    try {
        // Dynamic import to avoid circular dependency (router → config → graph)
        const { chat: routerChat } = await import('../providers/router.js');
        const config = loadConfig();
        const model = config.agent.model.toLowerCase();

        // Skip entity extraction for very small models that can't produce valid JSON
        const SKIP_MODELS = ['llama3.2:1b', 'tinyllama', 'phi-2'];
        if (SKIP_MODELS.some(m => model.includes(m))) return [];

        logger.info(COMPONENT, `Extracting entities from ${content.length} char episode via ${config.agent.model}`);

        const prompt = `Extract entities from this text as a JSON array. Each item: {"name":"...","type":"person|topic|project|place|fact","facts":["fact1","fact2"]}. Return ONLY the JSON array, no other text.\n\nText: ${content.slice(0, 500)}`;

        const response = await routerChat({
            model: config.agent.model,
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 512,
            temperature: 0.1,
            thinking: false,
        });

        // Track LLM costs for entity extraction so cost optimizer sees them
        if (response.usage) {
            recordTokenUsage(
                'graph:extractEntities',
                config.agent.model,
                response.usage.promptTokens ?? 0,
                response.usage.completionTokens ?? 0,
            );
        }

        const text = response.content || '';
        logger.info(COMPONENT, `Extraction response: ${text.length} chars`);
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) {
            logger.warn(COMPONENT, `No JSON array found in extraction response: ${text.slice(0, 200)}`);
            return [];
        }

        // Try to repair common JSON issues from small models
        const jsonStr = match[0]
            .replace(/,\s*]/g, ']')        // trailing commas in arrays
            .replace(/,\s*}/g, '}')         // trailing commas in objects
            .replace(/'/g, '"');            // single quotes to double

        try {
            const parsed = JSON.parse(jsonStr);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((e: unknown) => e && typeof e === 'object' && 'name' in (e as object));
        } catch {
            logger.debug(COMPONENT, 'Entity extraction JSON repair failed, skipping');
            return [];
        }
    } catch (err) {
        logger.warn(COMPONENT, `Entity extraction failed: ${(err as Error).message}`);
        return [];
    }
}

// ── Find or create an entity by name ────────────────────────────
function findOrCreateEntity(name: string, type: string, facts: string[]): Entity {
    const nameLower = name.toLowerCase().trim();

    // Search by name and aliases
    const existing = graph.entities.find((e) => {
        if (e.name.toLowerCase() === nameLower) return true;
        if (e.aliases.some((a) => a.toLowerCase() === nameLower)) return true;
        return false;
    });

    if (existing) {
        // Merge new facts
        const newFacts = facts.filter((f) => !existing.facts.includes(f));
        if (newFacts.length > 0) existing.facts.push(...newFacts);
        existing.lastSeen = new Date().toISOString();
        return existing;
    }

    // Create new entity
    const entity: Entity = {
        id: uuid(),
        name,
        aliases: [],
        type,
        summary: facts[0] || '',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        facts,
    };
    graph.entities.push(entity);
    return entity;
}

// ── Add Episode ──────────────────────────────────────────────────
export async function addEpisode(content: string, source: string): Promise<Episode> {
    if (!initialized) initGraph();

    const episode: Episode = {
        id: uuid(),
        content,
        source,
        createdAt: new Date().toISOString(),
        entities: [],
    };
    graph.episodes.push(episode);
    saveGraph();

    // Background entity extraction (non-blocking)
    extractEntities(content).then((extracted) => {
        if (!extracted || extracted.length === 0) return;
        for (const e of extracted) {
            if (!e.name) continue;
            const entity = findOrCreateEntity(e.name, e.type || 'topic', e.facts || []);
            if (!episode.entities.includes(entity.id)) {
                episode.entities.push(entity.id);
            }
        }
        // Create edges between co-occurring entities in this episode
        if (episode.entities.length > 1) {
            for (let i = 0; i < episode.entities.length; i++) {
                for (let j = i + 1; j < episode.entities.length; j++) {
                    const fromId = episode.entities[i];
                    const toId = episode.entities[j];
                    const exists = graph.edges.some(
                        e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
                    );
                    if (!exists) {
                        graph.edges.push({
                            id: uuid(),
                            from: fromId,
                            to: toId,
                            relation: 'co_mentioned',
                            createdAt: new Date().toISOString(),
                        });
                    }
                }
            }
        }
        // Enforce size limits
        if (graph.episodes.length > 5000) {
            graph.episodes = graph.episodes.slice(-5000);
        }
        if (graph.entities.length > 1000) {
            graph.entities.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
            graph.entities = graph.entities.slice(0, 1000);
        }
        saveGraph();
        logger.info(COMPONENT, `Episode ${episode.id.slice(0, 8)}: extracted ${extracted.length} entities, total ${graph.entities.length} entities, ${graph.edges.length} edges`);
    }).catch((err) => logger.warn(COMPONENT, `Background entity extraction failed: ${(err as Error).message}`));

    return episode;
}

// ── Search ────────────────────────────────────────────────────────
export function searchMemory(query: string, limit = 20): Episode[] {
    if (!initialized) initGraph();
    if (!query) return getRecentEpisodes(limit);

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = graph.episodes.map((ep) => {
        const text = ep.content.toLowerCase();
        const matches = terms.filter((t) => text.includes(t)).length;
        return { ep, matches };
    });

    return scored
        .filter((s) => s.matches > 0)
        .sort((a, b) => {
            if (b.matches !== a.matches) return b.matches - a.matches;
            return b.ep.createdAt.localeCompare(a.ep.createdAt);
        })
        .slice(0, limit)
        .map((s) => s.ep);
}

// ── Entity lookups ────────────────────────────────────────────────
export function getEntity(name: string): Entity | null {
    if (!initialized) initGraph();
    const nameLower = name.toLowerCase().trim();
    return graph.entities.find((e) =>
        e.name.toLowerCase() === nameLower ||
        e.aliases.some((a) => a.toLowerCase() === nameLower)
    ) || null;
}

export function listEntities(type?: string): Entity[] {
    if (!initialized) initGraph();
    const all = type ? graph.entities.filter((e) => e.type === type) : graph.entities;
    return all.slice().sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function getEntityEpisodes(entityId: string, limit = 10): Episode[] {
    if (!initialized) initGraph();
    return graph.episodes
        .filter((ep) => ep.entities.includes(entityId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
}

export function getRecentEpisodes(limit = 20): Episode[] {
    if (!initialized) initGraph();
    return graph.episodes
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
}

// ── Graph data for Mission Control ────────────────────────────────
export function getGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (!initialized) initGraph();
    const nodes: GraphNode[] = graph.entities.map((e) => ({
        id: e.id,
        label: e.name,
        type: e.type,
        size: Math.max(12, Math.min(30, 12 + e.facts.length * 3)),
        facts: e.facts,
    }));
    const edges: GraphEdge[] = graph.edges.map((e) => ({
        from: e.from,
        to: e.to,
        label: e.relation,
    }));
    return { nodes, edges };
}

export function getGraphStats(): { episodeCount: number; entityCount: number; edgeCount: number } {
    if (!initialized) initGraph();
    return {
        episodeCount: graph.episodes.length,
        entityCount: graph.entities.length,
        edgeCount: graph.edges.length,
    };
}

/** Get relevant graph context for a user message (for system prompt injection) */
export function getGraphContext(query: string): string {
    if (!initialized) initGraph();
    if (graph.episodes.length === 0 && graph.entities.length === 0) return '';

    const parts: string[] = [];

    // Search for relevant episodes
    if (query) {
        const relevant = searchMemory(query, 5);
        if (relevant.length > 0) {
            parts.push('Relevant memories from knowledge graph:');
            for (const ep of relevant) {
                parts.push(`- [${ep.source}, ${ep.createdAt.slice(0, 10)}]: ${ep.content.slice(0, 150)}`);
            }
        }
    }

    // Include recently active entities (top 5)
    const recentEntities = graph.entities
        .slice()
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
        .slice(0, 5);

    if (recentEntities.length > 0) {
        parts.push('Known entities:');
        for (const e of recentEntities) {
            const factsStr = e.facts.length > 0 ? ` (${e.facts.slice(0, 2).join('; ')})` : '';
            parts.push(`- ${e.name} [${e.type}]${factsStr}`);
        }
    }

    return parts.length > 0 ? parts.join('\n') : '';
}

/** Clear all graph data */
export function clearGraph(): void {
    graph = { episodes: [], entities: [], edges: [] };
    saveGraph();
    logger.info(COMPONENT, 'Graph cleared');
}
