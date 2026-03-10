/**
 * TITAN — Persona Manager
 * File-based persona system. Reads persona definitions from assets/personas/
 * and provides runtime persona selection.
 *
 * Persona definitions adapted from agency-agents (MIT License)
 * Copyright (c) 2025 AgentLand Contributors
 * https://github.com/msitarzewski/agency-agents
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const COMPONENT = 'Personas';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Bundled personas ship in assets/personas/ relative to project root
const PERSONAS_DIR = join(__dirname, '../../assets/personas');

export interface PersonaMeta {
    id: string;
    name: string;
    description: string;
    division: string;
    source: string;
}

export interface Persona extends PersonaMeta {
    content: string;
}

let personaCache: Map<string, Persona> | null = null;

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { meta: {}, content: raw };

    const meta: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^(\w+):\s*(.+)$/);
        if (kv) meta[kv[1]] = kv[2].trim();
    }
    return { meta, content: match[2].trim() };
}

export function loadPersonas(): Map<string, Persona> {
    if (personaCache) return personaCache;

    personaCache = new Map();

    if (!existsSync(PERSONAS_DIR)) {
        logger.warn(COMPONENT, `Personas directory not found: ${PERSONAS_DIR}`);
        return personaCache;
    }

    const files = readdirSync(PERSONAS_DIR).filter(f => f.endsWith('.md'));

    for (const file of files) {
        const id = file.replace('.md', '');
        const raw = readFileSync(join(PERSONAS_DIR, file), 'utf-8');
        const { meta, content } = parseFrontmatter(raw);

        personaCache.set(id, {
            id,
            name: meta.name || id,
            description: meta.description || '',
            division: meta.division || 'general',
            source: meta.source || 'bundled',
            content,
        });
    }

    logger.info(COMPONENT, `Loaded ${personaCache.size} personas`);
    return personaCache;
}

export function getPersona(id: string): Persona | undefined {
    return loadPersonas().get(id);
}

export function listPersonas(): PersonaMeta[] {
    return Array.from(loadPersonas().values()).map(({ content: _c, ...meta }) => meta);
}

export function getActivePersonaContent(personaId: string): string {
    if (personaId === 'default') return '';
    const persona = getPersona(personaId);
    if (!persona) {
        logger.warn(COMPONENT, `Persona "${personaId}" not found, falling back to default`);
        return '';
    }
    return persona.content;
}

export function invalidatePersonaCache(): void {
    personaCache = null;
}
