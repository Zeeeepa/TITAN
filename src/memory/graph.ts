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

// ── Entity extraction via LLM ────────────────────────────────────
async function extractEntities(content: string): Promise<Array<{ name: string; type: string; facts: string[] }>> {
    try {
        const config = loadConfig();
        const ollamaBase = config.providers?.ollama?.baseUrl || 'http://localhost:11434';

        // Try kimi-k2.5:cloud first, fall back to any available model
        const modelsRes = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (!modelsRes.ok) return [];
        const modelsData = await modelsRes.json() as { models?: Array<{ name: string }> };
        const availableModels = (modelsData.models || []).map((m) => m.name);

        const preferred = ['kimi-k2.5:cloud', 'kimi-k2.5', 'llama3.1', 'llama3', 'mistral'];
        const model = preferred.find((m) => availableModels.some((a) => a.startsWith(m.split(':')[0])))
            || availableModels[0];

        if (!model) return [];

        const prompt = `Extract entities from this text as a JSON array. Each item: {"name":"...","type":"person|topic|project|place|fact","facts":["fact1","fact2"]}. Return ONLY the JSON array, no other text. Text: ${content.slice(0, 500)}`;

        const res = await fetch(`${ollamaBase}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                options: { num_predict: 512, temperature: 0.1 },
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) return [];
        const data = await res.json() as { message?: { content?: string } };
        const text = data.message?.content || '';

        // Extract JSON array from response
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) return [];
        const parsed = JSON.parse(match[0]);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e: unknown) => e && typeof e === 'object' && 'name' in (e as object));
    } catch {
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
        saveGraph();
        logger.debug(COMPONENT, `Episode ${episode.id.slice(0, 8)}: extracted ${extracted.length} entities`);
    }).catch(() => {});

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

/** Clear all graph data */
export function clearGraph(): void {
    graph = { episodes: [], entities: [], edges: [] };
    saveGraph();
    logger.info(COMPONENT, 'Graph cleared');
}
