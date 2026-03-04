/**
 * TITAN — ClaWHub Marketplace Client
 * Fetches and installs skills from https://clawhub.ai
 * Every skill is scanned for malicious code before installation.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { TITAN_HOME, TITAN_VERSION } from '../utils/constants.js';
import { scanSkillCode, formatScanResult, type ScanResult } from './scanner.js';
import logger from '../utils/logger.js';

const COMPONENT = 'ClaWHub';
const CLAWHUB_BASE = 'https://clawhub.ai/api';
const AUTO_SKILLS_DIR = join(TITAN_HOME, 'skills', 'auto');

// ─── Types ────────────────────────────────────────────────────────
export interface ClaWHubSkill {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    tags: string[];
    downloads: number;
    rating: number;
    verified: boolean;
    url: string;
}

export interface ClaWHubSearchResult {
    skills: ClaWHubSkill[];
    total: number;
}

export interface InstallResult {
    success: boolean;
    skillName: string;
    scanResult: ScanResult;
    error?: string;
    installedPath?: string;
}

// ─── API helpers ──────────────────────────────────────────────────
async function clawhubFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${CLAWHUB_BASE}${path}`, {
        headers: { 'User-Agent': `TITAN-Agent/${TITAN_VERSION}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ClaWHub API error ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────

/** Search for skills on ClaWHub */
export async function searchSkills(query: string, limit = 20): Promise<ClaWHubSearchResult> {
    try {
        return await clawhubFetch<ClaWHubSearchResult>(
            `/skills/search?q=${encodeURIComponent(query)}&limit=${limit}`
        );
    } catch {
        // Graceful fallback: if clawhub.ai isn't reachable return empty
        logger.warn(COMPONENT, 'ClaWHub search unavailable — check your connection');
        return { skills: [], total: 0 };
    }
}

/** Get a specific skill's details */
export async function getSkillDetails(id: string): Promise<ClaWHubSkill | null> {
    try {
        return await clawhubFetch<ClaWHubSkill>(`/skills/${id}`);
    } catch {
        return null;
    }
}

/**
 * Install a skill from ClaWHub — ALWAYS scans before installing.
 * Blocks on critical/high severity findings.
 */
export async function installFromClaWHub(
    skillIdOrName: string,
    opts: { force?: boolean } = {}
): Promise<InstallResult> {
    logger.info(COMPONENT, `Fetching skill: ${skillIdOrName}`);

    let code: string;
    let skillName = skillIdOrName;

    try {
        // First try to get skill metadata
        const details = await clawhubFetch<{ name: string; code: string }>(
            `/skills/${encodeURIComponent(skillIdOrName)}/download`
        );
        code = details.code;
        skillName = details.name || skillIdOrName;
    } catch (e: unknown) {
        return {
            success: false,
            skillName,
            scanResult: { safe: false, score: 0, findings: [], recommendation: 'block' },
            error: `Could not fetch skill from ClaWHub: ${(e as Error).message}`,
        };
    }

    // ─── MANDATORY SECURITY SCAN ────────────────────────────────
    logger.info(COMPONENT, `Scanning skill: ${skillName}`);
    const scanResult = scanSkillCode(code, `${skillName}.ts`);

    console.log(formatScanResult(scanResult, skillName));

    if (scanResult.recommendation === 'block') {
        logger.error(COMPONENT, `Skill "${skillName}" blocked by security scanner`);
        return { success: false, skillName, scanResult, error: 'Blocked by security scanner — critical issues detected' };
    }

    if (scanResult.recommendation === 'warn' && !opts.force) {
        return {
            success: false,
            skillName,
            scanResult,
            error: 'High-severity findings require --force to install. Review the scan results first.',
        };
    }

    // ─── INSTALL ─────────────────────────────────────────────────
    if (!existsSync(AUTO_SKILLS_DIR)) mkdirSync(AUTO_SKILLS_DIR, { recursive: true });

    const safeFilename = skillName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = join(AUTO_SKILLS_DIR, `${safeFilename}.ts`);
    writeFileSync(filePath, code, 'utf-8');

    // Typecheck before activating
    try {
        execSync(`npx tsc --noEmit --skipLibCheck "${filePath}"`, { stdio: 'pipe' });
    } catch (e: unknown) {
        // Non-fatal: skill may still work at runtime
        logger.warn(COMPONENT, `Type errors in ${skillName}: ${((e as Error).message ?? '').slice(0, 200)}`);
    }

    logger.info(COMPONENT, `✅ Installed skill: ${skillName} → ${filePath}`);

    return { success: true, skillName, scanResult, installedPath: filePath };
}

/**
 * Install a skill from a direct URL (also scanned before install).
 */
export async function installFromUrl(url: string, opts: { force?: boolean } = {}): Promise<InstallResult> {
    const skillName = url.split('/').pop()?.replace('.ts', '') || 'unknown';

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

    const scanResult = scanSkillCode(code, `${skillName}.ts`);
    console.log(formatScanResult(scanResult, skillName));

    if (scanResult.recommendation === 'block') {
        return { success: false, skillName, scanResult, error: 'Blocked by security scanner' };
    }
    if (scanResult.recommendation === 'warn' && !opts.force) {
        return { success: false, skillName, scanResult, error: 'High-severity findings — use --force to override' };
    }

    if (!existsSync(AUTO_SKILLS_DIR)) mkdirSync(AUTO_SKILLS_DIR, { recursive: true });
    const filePath = join(AUTO_SKILLS_DIR, `${skillName}.ts`);
    writeFileSync(filePath, code, 'utf-8');

    return { success: true, skillName, scanResult, installedPath: filePath };
}
