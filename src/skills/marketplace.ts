/**
 * TITAN — Skills Marketplace
 * Fetches and installs skills from the official TITAN Skills repo on GitHub.
 * Falls back to direct URL install. Every skill is security-scanned before installation.
 *
 * Marketplace repo: https://github.com/Djtony707/titan-skills
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME, TITAN_VERSION } from '../utils/constants.js';
import { scanSkillCode, type ScanResult } from './scanner.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Marketplace';
const GITHUB_OWNER = 'Djtony707';
const GITHUB_REPO = 'titan-skills';
const GITHUB_BRANCH = 'main';
const CATALOG_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/catalog.json`;
const SKILL_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/skills`;
const AUTO_SKILLS_DIR = join(TITAN_HOME, 'skills', 'auto');

// Cache catalog for 10 minutes
let catalogCache: { data: MarketplaceCatalog; fetchedAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

/** Reset catalog cache (used in tests) */
export function resetCatalogCache(): void { catalogCache = null; }

// ─── Types ────────────────────────────────────────────────────────
export interface MarketplaceSkill {
    name: string;
    file: string;
    description: string;
    category: string;
    tags: string[];
    author: string;
    version: string;
    requiresApiKey: boolean;
}

export interface MarketplaceCatalog {
    version: number;
    updated: string;
    skills: MarketplaceSkill[];
}

export interface MarketplaceSearchResult {
    skills: MarketplaceSkill[];
    total: number;
}

export interface InstallResult {
    success: boolean;
    skillName: string;
    scanResult: ScanResult;
    error?: string;
    installedPath?: string;
}

// ─── Catalog ─────────────────────────────────────────────────────

/** Fetch the skills catalog from GitHub (cached 10 min) */
export async function getCatalog(): Promise<MarketplaceCatalog> {
    if (catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL) {
        return catalogCache.data;
    }

    try {
        const res = await fetch(CATALOG_URL, {
            headers: { 'User-Agent': `TITAN-Agent/${TITAN_VERSION}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as MarketplaceCatalog;
        catalogCache = { data, fetchedAt: Date.now() };
        return data;
    } catch (e: unknown) {
        logger.warn(COMPONENT, `Could not fetch catalog: ${(e as Error).message}`);
        return { version: 0, updated: '', skills: [] };
    }
}

/** Search skills by query (matches name, description, tags, category) */
export async function searchSkills(query: string, limit = 20): Promise<MarketplaceSearchResult> {
    const catalog = await getCatalog();
    const q = query.toLowerCase();

    const matched = q
        ? catalog.skills.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            s.tags.some(t => t.toLowerCase().includes(q))
        )
        : catalog.skills;

    return { skills: matched.slice(0, limit), total: matched.length };
}

/** Get details for a specific skill by name */
export async function getSkillDetails(name: string): Promise<MarketplaceSkill | null> {
    const catalog = await getCatalog();
    return catalog.skills.find(s => s.name === name || s.file.replace('.js', '') === name) || null;
}

/** List all available skills */
export async function listSkills(): Promise<MarketplaceSkill[]> {
    const catalog = await getCatalog();
    return catalog.skills;
}

/** List installed marketplace skills */
export function listInstalled(): string[] {
    if (!existsSync(AUTO_SKILLS_DIR)) return [];
    return readdirSync(AUTO_SKILLS_DIR)
        .filter(f => f.endsWith('.js'))
        .map(f => f.replace('.js', ''));
}

// ─── Install ─────────────────────────────────────────────────────

/**
 * Install a skill from the TITAN marketplace.
 * Downloads from GitHub, scans for security, writes to ~/.titan/skills/auto/.
 */
export async function installSkill(
    skillName: string,
    opts: { force?: boolean } = {}
): Promise<InstallResult> {
    // Look up in catalog
    const skill = await getSkillDetails(skillName);
    if (!skill) {
        return {
            success: false,
            skillName,
            scanResult: { safe: false, score: 0, findings: [], recommendation: 'block' },
            error: `Skill "${skillName}" not found in the TITAN marketplace. Use "searchSkills" to browse available skills.`,
        };
    }

    logger.info(COMPONENT, `Fetching skill: ${skill.name} (${skill.file})`);

    // Download from GitHub
    let code: string;
    try {
        const url = `${SKILL_BASE_URL}/${skill.file}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': `TITAN-Agent/${TITAN_VERSION}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        code = await res.text();
    } catch (e: unknown) {
        return {
            success: false,
            skillName: skill.name,
            scanResult: { safe: false, score: 0, findings: [], recommendation: 'block' },
            error: `Failed to download skill: ${(e as Error).message}`,
        };
    }

    // ─── MANDATORY SECURITY SCAN ────────────────────────────────
    logger.info(COMPONENT, `Scanning skill: ${skill.name}`);
    const scanResult = scanSkillCode(code, skill.file);

    if (scanResult.recommendation === 'block') {
        logger.error(COMPONENT, `Skill "${skill.name}" blocked by security scanner`);
        return { success: false, skillName: skill.name, scanResult, error: 'Blocked by security scanner — critical issues detected' };
    }

    if (scanResult.recommendation === 'warn' && !opts.force) {
        return {
            success: false,
            skillName: skill.name,
            scanResult,
            error: 'High-severity findings require force flag to install. Review the scan results first.',
        };
    }

    // ─── INSTALL ─────────────────────────────────────────────────
    if (!existsSync(AUTO_SKILLS_DIR)) mkdirSync(AUTO_SKILLS_DIR, { recursive: true });

    const filePath = join(AUTO_SKILLS_DIR, skill.file);
    writeFileSync(filePath, code, 'utf-8');

    logger.info(COMPONENT, `Installed skill: ${skill.name} → ${filePath}`);

    return { success: true, skillName: skill.name, scanResult, installedPath: filePath };
}

/** Uninstall a marketplace skill */
export function uninstallSkill(skillName: string): { success: boolean; error?: string } {
    if (!existsSync(AUTO_SKILLS_DIR)) return { success: false, error: 'No marketplace skills installed' };

    // Find the file — try exact name, then with .js
    const files = readdirSync(AUTO_SKILLS_DIR);
    const match = files.find(f => f === `${skillName}.js` || f.replace('.js', '') === skillName);

    if (!match) return { success: false, error: `Skill "${skillName}" is not installed` };

    unlinkSync(join(AUTO_SKILLS_DIR, match));
    logger.info(COMPONENT, `Uninstalled skill: ${skillName}`);
    return { success: true };
}

/**
 * Install a skill from a direct URL (also scanned before install).
 */
export async function installFromUrl(url: string, opts: { force?: boolean } = {}): Promise<InstallResult> {
    const skillName = url.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'unknown';

    let code: string;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        code = await res.text();
    } catch (e: unknown) {
        return {
            success: false,
            skillName,
            scanResult: { safe: false, score: 0, findings: [], recommendation: 'block' },
            error: `Failed to fetch skill: ${(e as Error).message}`,
        };
    }

    const scanResult = scanSkillCode(code, `${skillName}.js`);

    if (scanResult.recommendation === 'block') {
        return { success: false, skillName, scanResult, error: 'Blocked by security scanner' };
    }
    if (scanResult.recommendation === 'warn' && !opts.force) {
        return { success: false, skillName, scanResult, error: 'High-severity findings — use force to override' };
    }

    if (!existsSync(AUTO_SKILLS_DIR)) mkdirSync(AUTO_SKILLS_DIR, { recursive: true });
    const filePath = join(AUTO_SKILLS_DIR, `${skillName}.js`);
    writeFileSync(filePath, code, 'utf-8');

    return { success: true, skillName, scanResult, installedPath: filePath };
}
