/**
 * TITAN — Relationship Memory
 * The feature that makes TITAN truly personal, like a real JARVIS.
 * 
 * TITAN remembers WHO you are — your name, preferences, projects, people
 * you mention, goals, and communication style. This isn't just chat context;
 * it's a persistent personal profile that grows every session.
 * 
 * No other AI agent platform does this at this level.
 * Every interaction makes TITAN more "yours".
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const PROFILE_PATH = join(TITAN_HOME, 'profile.json');
const COMPONENT = 'RelationshipMemory';

// ─── Types ────────────────────────────────────────────────────────
export interface PersonalProfile {
    /** User's preferred name */
    name?: string;
    /** How they like to be addressed */
    preferredGreeting?: string;
    /** Their timezone */
    timezone?: string;
    /** Occupation / role */
    occupation?: string;
    /** Active projects TITAN knows about */
    projects: { name: string; description: string; lastMentioned: string }[];
    /** People they work with */
    contacts: { name: string; role?: string; lastMentioned: string }[];
    /** Known preferences (communication style, tools, etc.) */
    preferences: Record<string, string>;
    /** Things TITAN has learned about this user */
    facts: { fact: string; learnedAt: string; confidence: 'certain' | 'likely' | 'maybe' }[];
    /** Current goals the user is working toward */
    goals: { goal: string; addedAt: string; completed: boolean }[];
    /** Style calibration: how verbose should TITAN be? */
    responseStyle: 'concise' | 'detailed' | 'conversational';
    /** Is the user technical? (affects language choices) */
    technicalLevel: 'beginner' | 'intermediate' | 'expert' | 'unknown';
    /** Date of first interaction */
    firstSeenAt: string;
    /** Date of most recent interaction */
    lastSeenAt: string;
    /** Total interactions */
    interactionCount: number;
}

// ─── Persistence ──────────────────────────────────────────────────
function ensureDir(): void {
    if (!existsSync(TITAN_HOME)) mkdirSync(TITAN_HOME, { recursive: true });
}

export function loadProfile(): PersonalProfile {
    try {
        if (existsSync(PROFILE_PATH)) {
            return JSON.parse(readFileSync(PROFILE_PATH, 'utf-8')) as PersonalProfile;
        }
    } catch { /* */ }
    return createEmptyProfile();
}

function createEmptyProfile(): PersonalProfile {
    return {
        projects: [],
        contacts: [],
        preferences: {},
        facts: [],
        goals: [],
        responseStyle: 'conversational',
        technicalLevel: 'unknown',
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        interactionCount: 0,
    };
}

export function saveProfile(profile: PersonalProfile): void {
    ensureDir();
    profile.lastSeenAt = new Date().toISOString();
    profile.interactionCount++;
    writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf-8');
}

// ─── Profile Updates ──────────────────────────────────────────────

/** Learn the user's name */
export function learnName(name: string): void {
    const p = loadProfile();
    p.name = name;
    p.preferredGreeting = `Hey ${name}`;
    saveProfile(p);
    logger.info(COMPONENT, `Learned user's name: ${name}`);
}

/** Add or update a project */
export function rememberProject(name: string, description = ''): void {
    const p = loadProfile();
    const existing = p.projects.find((proj) => proj.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        existing.description = description || existing.description;
        existing.lastMentioned = new Date().toISOString();
    } else {
        p.projects.push({ name, description, lastMentioned: new Date().toISOString() });
    }
    saveProfile(p);
}

/** Remember a contact */
export function rememberContact(name: string, role?: string): void {
    const p = loadProfile();
    const existing = p.contacts.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        if (role) existing.role = role;
        existing.lastMentioned = new Date().toISOString();
    } else {
        p.contacts.push({ name, role, lastMentioned: new Date().toISOString() });
    }
    saveProfile(p);
}

/** Learn a preference */
export function learnPreference(key: string, value: string): void {
    const p = loadProfile();
    p.preferences[key] = value;
    saveProfile(p);
}

/** Learn a fact about the user */
export function learnFact(fact: string, confidence: 'certain' | 'likely' | 'maybe' = 'likely'): void {
    const p = loadProfile();
    if (!p.facts.some((f) => f.fact === fact)) {
        p.facts.push({ fact, learnedAt: new Date().toISOString(), confidence });
        saveProfile(p);
        logger.info(COMPONENT, `Learned fact: ${fact}`);
    }
}

/** Add a goal */
export function addGoal(goal: string): void {
    const p = loadProfile();
    if (!p.goals.some((g) => g.goal === goal)) {
        p.goals.push({ goal, addedAt: new Date().toISOString(), completed: false });
        saveProfile(p);
    }
}

/** Set technical level based on conversation analysis */
export function calibrateTechnicalLevel(level: PersonalProfile['technicalLevel']): void {
    const p = loadProfile();
    p.technicalLevel = level;
    saveProfile(p);
}

/** Build the personal context string to inject into every system prompt */
export function buildPersonalContext(): string {
    const p = loadProfile();
    const lines: string[] = [];

    if (p.name) lines.push(`The user's name is ${p.name}. Address them by name occasionally.`);
    if (p.occupation) lines.push(`They work as: ${p.occupation}.`);
    if (p.technicalLevel !== 'unknown') {
        const levelDesc = {
            beginner: 'Explain things simply, avoid jargon, be patient and encouraging.',
            intermediate: 'Use some technical terms but explain complex concepts clearly.',
            expert: 'Be direct and technical. Skip basic explanations.',
            unknown: '',
        }[p.technicalLevel];
        if (levelDesc) lines.push(levelDesc);
    }
    if (p.responseStyle === 'concise') lines.push('Keep responses short and to the point.');
    else if (p.responseStyle === 'detailed') lines.push('Be thorough and detailed in explanations.');

    if (p.projects.length > 0) {
        const recent = p.projects.slice(0, 5).map((pr) => pr.name).join(', ');
        lines.push(`Known projects: ${recent}.`);
    }
    if (p.contacts.length > 0) {
        const contacts = p.contacts.slice(0, 5).map((c) => c.role ? `${c.name} (${c.role})` : c.name).join(', ');
        lines.push(`People they work with: ${contacts}.`);
    }
    if (p.facts.length > 0) {
        const certain = p.facts.filter((f) => f.confidence === 'certain').map((f) => f.fact);
        if (certain.length > 0) lines.push(`Known facts: ${certain.join('; ')}.`);
    }
    if (p.goals.length > 0) {
        const active = p.goals.filter((g) => !g.completed).map((g) => g.goal);
        if (active.length > 0) lines.push(`Current goals: ${active.join('; ')}.`);
    }
    if (p.interactionCount > 0) lines.push(`You have had ${p.interactionCount} conversations with this user.`);

    if (lines.length === 0) return '';

    return `\n## Personal Context About This User\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

/** Get a summary of what TITAN knows about the user */
export function getProfileSummary(): string {
    const p = loadProfile();
    const lines: string[] = ['📋 **What TITAN knows about you:**\n'];
    if (p.name) lines.push(`👤 Name: ${p.name}`);
    if (p.occupation) lines.push(`💼 Role: ${p.occupation}`);
    lines.push(`🧠 Technical level: ${p.technicalLevel}`);
    lines.push(`💬 Response style: ${p.responseStyle}`);
    if (p.projects.length > 0) lines.push(`📁 Projects: ${p.projects.map((pr) => pr.name).join(', ')}`);
    if (p.contacts.length > 0) lines.push(`👥 Contacts: ${p.contacts.map((c) => c.name).join(', ')}`);
    if (p.goals.length > 0) lines.push(`🎯 Goals: ${p.goals.filter((g) => !g.completed).map((g) => g.goal).join(', ')}`);
    lines.push(`📅 First interaction: ${new Date(p.firstSeenAt).toLocaleDateString()}`);
    lines.push(`🔢 Total conversations: ${p.interactionCount}`);
    return lines.join('\n');
}
