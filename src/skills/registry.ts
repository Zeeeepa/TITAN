/**
 * TITAN — Skills Registry
 * Discovers, loads, and manages skills from bundled, workspace, and marketplace sources.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME, TITAN_SKILLS_DIR } from '../utils/constants.js';
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
    const { registerAutoGenerateSkill } = await import('./builtin/auto_generate.js');
    const { registerVisionSkill } = await import('./builtin/vision.js');
    const { registerVoiceSkills } = await import('./builtin/voice.js');
    const { registerMemoryGraphSkill } = await import('./builtin/memory_graph.js');
    const { initWebBrowserTool } = await import('./builtin/web_browser.js');

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
    registerAutoGenerateSkill();
    registerVisionSkill();
    registerVoiceSkills();
    registerMemoryGraphSkill();
    initWebBrowserTool();

    // Register planner as an LLM-invocable tool
    const { registerPlannerTool } = await import('../agent/planner.js');
    registerPlannerTool();

    logger.info(COMPONENT, `Loaded ${registeredSkills.size} built-in skills`);
}

/**
 * Discover and load user skills from ~/.titan/skills/ (all subdirs).
 * Supports:
 *  1. JavaScript files (.js) that export default { name, description, parameters, execute }
 *  2. YAML skill definitions (.yaml/.yml) with inline scripts
 *  3. Auto-generated skills from ~/.titan/skills/auto/
 */
export async function loadAutoSkills(): Promise<void> {
    const skillsRoot = join(TITAN_HOME, 'skills');
    if (!existsSync(skillsRoot)) return;

    logger.info(COMPONENT, 'Scanning for user skills...');
    let loadedCount = 0;

    // Scan both root and all subdirectories
    const dirsToScan = [skillsRoot];
    const entries = readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) dirsToScan.push(join(skillsRoot, entry.name));
    }

    for (const dir of dirsToScan) {
        const files = readdirSync(dir).filter(f =>
            f.endsWith('.js') || f.endsWith('.yaml') || f.endsWith('.yml')
        );

        for (const file of files) {
            const filePath = join(dir, file);
            try {
                if (file.endsWith('.js')) {
                    // JavaScript skill — export default { name, description, parameters, execute }
                    const modulePath = `file://${filePath}?t=${Date.now()}`;
                    const mod = await import(modulePath);
                    if (mod.default && mod.default.name && mod.default.execute) {
                        const handler = mod.default as ToolHandler;
                        if (registeredSkills.has(handler.name)) continue; // Skip duplicates
                        registerSkill({
                            name: handler.name,
                            description: handler.description || 'User skill',
                            version: '1.0.0',
                            source: 'workspace',
                            enabled: true,
                        }, handler);
                        loadedCount++;
                    }
                } else {
                    // YAML skill definition
                    const loaded = loadYamlSkill(filePath);
                    if (loaded && !registeredSkills.has(loaded.name)) {
                        registerSkill({
                            name: loaded.name,
                            description: loaded.description,
                            version: '1.0.0',
                            source: 'workspace',
                            enabled: true,
                        }, loaded);
                        loadedCount++;
                    }
                }
            } catch (e: any) {
                logger.warn(COMPONENT, `Failed to load skill ${file}: ${e.message}`);
            }
        }
    }

    if (loadedCount > 0) {
        logger.info(COMPONENT, `Loaded ${loadedCount} user skill(s) from ~/.titan/skills/`);
    }
}

/**
 * Load a YAML skill definition.
 * Format:
 *   name: my_tool
 *   description: What it does
 *   parameters:
 *     myParam:
 *       type: string
 *       description: A parameter
 *       required: true
 *   script: |
 *     // JavaScript code. Use `args.myParam` for inputs.
 *     // Return a string result.
 *     return "Hello " + args.myParam;
 */
function loadYamlSkill(filePath: string): ToolHandler | null {
    const content = readFileSync(filePath, 'utf-8');

    // Simple YAML parser (no dependency needed for this basic format)
    const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = content.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    const scriptMatch = content.match(/^script:\s*\|\n([\s\S]+?)(?=\n\w|\n$|$)/m);
    const script = scriptMatch?.[1]?.replace(/^ {2}/gm, ''); // Remove YAML indent

    if (!name || !description || !script) {
        logger.debug(COMPONENT, `Skipping ${filePath}: missing name, description, or script`);
        return null;
    }

    // Parse parameters section
    const paramsSection = content.match(/^parameters:\n((?:\s{2}\w[\s\S]*?)(?=\nscript:|\n\w|\n$))/m);
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (paramsSection) {
        const paramLines = paramsSection[1].split('\n');
        let currentParam = '';
        for (const line of paramLines) {
            const paramMatch = line.match(/^\s{2}(\w+):\s*$/);
            if (paramMatch) {
                currentParam = paramMatch[1];
                properties[currentParam] = {};
                continue;
            }
            if (currentParam) {
                const typeMatch = line.match(/^\s{4}type:\s*(.+)$/);
                const descMatch = line.match(/^\s{4}description:\s*(.+)$/);
                const reqMatch = line.match(/^\s{4}required:\s*true$/);
                const defMatch = line.match(/^\s{4}default:\s*(.+)$/);
                if (typeMatch) properties[currentParam].type = typeMatch[1].trim();
                if (descMatch) properties[currentParam].description = descMatch[1].trim();
                if (reqMatch) required.push(currentParam);
                if (defMatch) properties[currentParam].default = defMatch[1].trim();
            }
        }
    }

    // Create the execute function from the script
    const handler: ToolHandler = {
        name,
        description,
        parameters: {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
        },
        execute: async (args: Record<string, unknown>) => {
            try {
                // Create a sandboxed function from the script
                const fn = new Function('args', 'require', script);
                const result = await fn(args, (mod: string) => {
                    // Only allow built-in modules
                    const allowed = ['fs', 'path', 'os', 'crypto', 'child_process', 'http', 'https', 'url', 'util'];
                    if (!allowed.includes(mod)) throw new Error(`Module "${mod}" not allowed in YAML skills`);
                    return require(mod);
                });
                return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            } catch (err) {
                return `Error: ${(err as Error).message}`;
            }
        },
    };

    logger.debug(COMPONENT, `Loaded YAML skill: ${name} from ${filePath}`);
    return handler;
}
