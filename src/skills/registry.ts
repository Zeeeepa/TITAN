/**
 * TITAN — Skills Registry
 * Discovers, loads, and manages skills from bundled, workspace, and marketplace sources.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { TITAN_SKILLS_DIR } from '../utils/constants.js';
import { registerTool, type ToolHandler } from '../agent/toolRunner.js';
import { ensureDir } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Skills';

export interface SkillMeta {
    name: string;
    description: string;
    version: string;
    author?: string;
    source: 'bundled' | 'workspace' | 'marketplace';
    enabled: boolean;
}

const registeredSkills: Map<string, SkillMeta> = new Map();

/** Register a built-in skill (tool handler + metadata) */
export function registerSkill(meta: SkillMeta, handler: ToolHandler): void {
    registeredSkills.set(meta.name, meta);
    registerTool(handler);
    logger.debug(COMPONENT, `Registered skill: ${meta.name} (${meta.source})`);
}

/** Get all registered skills */
export function getSkills(): SkillMeta[] {
    return Array.from(registeredSkills.values());
}

/** Get a skill by name */
export function getSkill(name: string): SkillMeta | undefined {
    return registeredSkills.get(name);
}

/** Discover workspace skills from ~/.titan/workspace/skills/ */
export function discoverWorkspaceSkills(): SkillMeta[] {
    ensureDir(TITAN_SKILLS_DIR);
    const discovered: SkillMeta[] = [];

    if (!existsSync(TITAN_SKILLS_DIR)) return discovered;

    const entries = readdirSync(TITAN_SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = join(TITAN_SKILLS_DIR, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');

        if (!existsSync(skillMdPath)) continue;

        try {
            const content = readFileSync(skillMdPath, 'utf-8');
            const meta = parseSkillMd(content, entry.name);
            if (meta) {
                discovered.push({ ...meta, source: 'workspace', enabled: true });
            }
        } catch (error) {
            logger.warn(COMPONENT, `Failed to load skill ${entry.name}: ${(error as Error).message}`);
        }
    }

    logger.info(COMPONENT, `Discovered ${discovered.length} workspace skills`);
    return discovered;
}

/** Parse SKILL.md frontmatter to extract metadata */
function parseSkillMd(content: string, fallbackName: string): Omit<SkillMeta, 'source' | 'enabled'> | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
        return {
            name: fallbackName,
            description: content.split('\n')[0] || 'No description',
            version: '1.0.0',
        };
    }

    const frontmatter = frontmatterMatch[1];
    const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim() || fallbackName;
    const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim() || 'No description';
    const version = frontmatter.match(/version:\s*(.+)/)?.[1]?.trim() || '1.0.0';
    const author = frontmatter.match(/author:\s*(.+)/)?.[1]?.trim();

    return { name, description, version, author };
}

/** Initialize all built-in skills */
export async function initBuiltinSkills(): Promise<void> {
    logger.info(COMPONENT, 'Loading built-in skills...');

    // Import and register built-in skills
    const { registerShellSkill } = await import('./builtin/shell.js');
    const { registerFilesystemSkill } = await import('./builtin/filesystem.js');
    const { registerWebSearchSkill } = await import('./builtin/web_search.js');
    const { registerCronSkill } = await import('./builtin/cron.js');
    const { registerWebhookSkill } = await import('./builtin/webhook.js');
    const { registerMemorySkill } = await import('./builtin/memory_skill.js');
    const { registerBrowserSkill } = await import('./builtin/browser.js');
    const { registerSessionsSkill } = await import('./builtin/sessions.js');
    const { registerProcessSkill } = await import('./builtin/process.js');
    const { registerWebFetchSkill } = await import('./builtin/web_fetch.js');
    const { registerApplyPatchSkill } = await import('./builtin/apply_patch.js');

    registerShellSkill();
    registerFilesystemSkill();
    registerWebSearchSkill();
    registerCronSkill();
    registerWebhookSkill();
    registerMemorySkill();
    registerBrowserSkill();
    registerSessionsSkill();
    registerProcessSkill();
    registerWebFetchSkill();
    registerApplyPatchSkill();

    logger.info(COMPONENT, `Loaded ${registeredSkills.size} built-in skills`);
}
