/**
 * TITAN — Skill Scaffolding (Plugin SDK)
 * Generates skill project templates for third-party developers.
 * Supports JavaScript and TypeScript skill creation with proper structure.
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const COMPONENT = 'SkillScaffold';

export interface ScaffoldOptions {
    name: string;
    description: string;
    author: string;
    format: 'js' | 'ts' | 'yaml';
    category?: string;
    parameters?: Array<{ name: string; type: string; description: string; required?: boolean }>;
}

export interface ScaffoldResult {
    success: boolean;
    skillDir: string;
    files: string[];
    error?: string;
}

/** Sanitize a skill name to a valid identifier */
function sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/** Generate a JavaScript skill file */
function generateJsSkill(opts: ScaffoldOptions): string {
    const params = opts.parameters || [{ name: 'input', type: 'string', description: 'The input to process', required: true }];
    const propsObj = params.map(p =>
        `            ${p.name}: { type: '${p.type}', description: '${p.description}' }`
    ).join(',\n');
    const requiredArr = params.filter(p => p.required !== false).map(p => `'${p.name}'`).join(', ');

    return `/**
 * TITAN Skill: ${opts.name}
 * ${opts.description}
 *
 * Author: ${opts.author}
 * Install: Drop this file in ~/.titan/skills/ and restart TITAN.
 */

export default {
    name: '${opts.name}',
    description: '${opts.description}',
    parameters: {
        type: 'object',
        properties: {
${propsObj}
        },
        required: [${requiredArr}],
    },
    execute: async (args) => {
        // Your skill logic here
        const { ${params.map(p => p.name).join(', ')} } = args;

        // Example: return a result string
        return \`${opts.name} executed with: \${JSON.stringify(args)}\`;
    },
};
`;
}

/** Generate a TypeScript skill file */
function generateTsSkill(opts: ScaffoldOptions): string {
    const params = opts.parameters || [{ name: 'input', type: 'string', description: 'The input to process', required: true }];
    const propsObj = params.map(p =>
        `            ${p.name}: { type: '${p.type}', description: '${p.description}' }`
    ).join(',\n');
    const requiredArr = params.filter(p => p.required !== false).map(p => `'${p.name}'`).join(', ');

    return `/**
 * TITAN Skill: ${opts.name}
 * ${opts.description}
 *
 * Author: ${opts.author}
 *
 * To build: tsc ${opts.name}.ts --outDir . --module esnext --moduleResolution bundler
 * To install: Drop the compiled .js in ~/.titan/skills/ and restart TITAN.
 */

interface ToolHandler {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}

const skill: ToolHandler = {
    name: '${opts.name}',
    description: '${opts.description}',
    parameters: {
        type: 'object',
        properties: {
${propsObj}
        },
        required: [${requiredArr}],
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
        const { ${params.map(p => p.name).join(', ')} } = args as { ${params.map(p => `${p.name}: ${p.type}`).join('; ')} };

        // Your skill logic here
        return \`${opts.name} executed with: \${JSON.stringify(args)}\`;
    },
};

export default skill;
`;
}

/** Generate a YAML skill file */
function generateYamlSkill(opts: ScaffoldOptions): string {
    const params = opts.parameters || [{ name: 'input', type: 'string', description: 'The input to process', required: true }];
    const paramsYaml = params.map(p =>
        `  ${p.name}:\n    type: ${p.type}\n    description: "${p.description}"`
    ).join('\n');

    return `# TITAN Skill: ${opts.name}
# ${opts.description}
# Author: ${opts.author}
# Install: Drop this file in ~/.titan/skills/ and restart TITAN.

name: ${opts.name}
description: "${opts.description}"
parameters:
${paramsYaml}
script: |
  // args object contains all parameters
  const { ${params.map(p => p.name).join(', ')} } = args;

  // Your logic here (runs in a sandboxed VM)
  // Available modules: fs, path, os, crypto, child_process, http, https, url, util
  return \`${opts.name} executed with: \${JSON.stringify(args)}\`;
`;
}

/** Generate SKILL.md metadata file */
function generateSkillMd(opts: ScaffoldOptions): string {
    return `---
name: ${opts.name}
description: ${opts.description}
version: 1.0.0
author: ${opts.author}
category: ${opts.category || 'custom'}
---

# ${opts.name}

${opts.description}

## Usage

This skill is automatically available to TITAN when placed in \`~/.titan/skills/\`.

## Parameters

${(opts.parameters || [{ name: 'input', type: 'string', description: 'The input to process' }])
    .map(p => `- **${p.name}** (\`${p.type}\`) — ${p.description}`)
    .join('\n')}

## Development

\`\`\`bash
# Test this skill
titan skills --test ${opts.name}

# View skill info
titan skills --list
\`\`\`
`;
}

/** Generate a basic test file */
function generateTestFile(opts: ScaffoldOptions): string {
    const params = opts.parameters || [{ name: 'input', type: 'string', description: 'The input to process' }];
    const testArgs = params.reduce((acc, p) => {
        acc[p.name] = p.type === 'number' ? '42' : `'test-${p.name}'`;
        return acc;
    }, {} as Record<string, string>);
    const argsStr = Object.entries(testArgs).map(([k, v]) => `${k}: ${v}`).join(', ');

    return `/**
 * Tests for ${opts.name} skill
 * Run: npx vitest run ${opts.name}.test.ts
 */
import { describe, it, expect } from 'vitest';

// Import the skill — adjust path if needed
// import skill from './${opts.name}.js';

describe('${opts.name}', () => {
    it('should export correct metadata', async () => {
        // const skill = (await import('./${opts.name}.js')).default;
        // expect(skill.name).toBe('${opts.name}');
        // expect(typeof skill.execute).toBe('function');
        expect(true).toBe(true); // Placeholder — uncomment above when ready
    });

    it('should execute successfully', async () => {
        // const skill = (await import('./${opts.name}.js')).default;
        // const result = await skill.execute({ ${argsStr} });
        // expect(typeof result).toBe('string');
        expect(true).toBe(true); // Placeholder — uncomment above when ready
    });
});
`;
}

/**
 * Scaffold a new TITAN skill project.
 * Creates a directory in ~/.titan/skills/ with the skill file, metadata, and optional test.
 */
export function scaffoldSkill(opts: ScaffoldOptions): ScaffoldResult {
    const name = sanitizeName(opts.name);
    const skillsRoot = join(TITAN_HOME, 'skills');
    const skillDir = join(skillsRoot, name);
    const files: string[] = [];

    try {
        // Ensure directories exist
        if (!existsSync(skillsRoot)) mkdirSync(skillsRoot, { recursive: true });
        if (existsSync(skillDir)) {
            return { success: false, skillDir, files: [], error: `Skill directory already exists: ${skillDir}` };
        }
        mkdirSync(skillDir, { recursive: true });

        // Generate skill file based on format
        let skillContent: string;
        let skillExt: string;
        switch (opts.format) {
            case 'ts':
                skillContent = generateTsSkill({ ...opts, name });
                skillExt = '.ts';
                break;
            case 'yaml':
                skillContent = generateYamlSkill({ ...opts, name });
                skillExt = '.yaml';
                break;
            case 'js':
            default:
                skillContent = generateJsSkill({ ...opts, name });
                skillExt = '.js';
                break;
        }

        const skillFile = join(skillDir, `${name}${skillExt}`);
        writeFileSync(skillFile, skillContent, 'utf-8');
        files.push(skillFile);

        // Generate SKILL.md
        const mdFile = join(skillDir, 'SKILL.md');
        writeFileSync(mdFile, generateSkillMd({ ...opts, name }), 'utf-8');
        files.push(mdFile);

        // Generate test file
        const testFile = join(skillDir, `${name}.test.ts`);
        writeFileSync(testFile, generateTestFile({ ...opts, name }), 'utf-8');
        files.push(testFile);

        logger.info(COMPONENT, `Scaffolded skill "${name}" at ${skillDir}`);
        return { success: true, skillDir, files };
    } catch (err) {
        return { success: false, skillDir, files, error: (err as Error).message };
    }
}

/**
 * Test a skill by loading and executing it with sample arguments.
 */
export async function testSkill(name: string): Promise<{ success: boolean; output?: string; error?: string; durationMs: number }> {
    const skillsRoot = join(TITAN_HOME, 'skills');
    const startTime = Date.now();

    // Search for the skill file in all possible locations
    const searchPaths = [
        join(skillsRoot, name, `${name}.js`),
        join(skillsRoot, `${name}.js`),
        join(skillsRoot, 'auto', `${name}.js`),
        join(skillsRoot, name, `${name}.yaml`),
        join(skillsRoot, `${name}.yaml`),
    ];

    let skillPath: string | null = null;
    for (const p of searchPaths) {
        if (existsSync(p)) { skillPath = p; break; }
    }

    if (!skillPath) {
        return { success: false, error: `Skill "${name}" not found in ~/.titan/skills/`, durationMs: Date.now() - startTime };
    }

    try {
        if (skillPath.endsWith('.js')) {
            const mod = await import(`file://${skillPath}?t=${Date.now()}`);
            const handler = mod.default;
            if (!handler || !handler.execute) {
                return { success: false, error: 'Skill does not export default { name, execute }', durationMs: Date.now() - startTime };
            }

            // Build sample args from parameter schema
            const sampleArgs: Record<string, unknown> = {};
            const props = handler.parameters?.properties || {};
            for (const [key, schema] of Object.entries(props)) {
                const s = schema as Record<string, unknown>;
                if (s.type === 'number') sampleArgs[key] = 0;
                else if (s.type === 'boolean') sampleArgs[key] = true;
                else sampleArgs[key] = `test-${key}`;
            }

            logger.info(COMPONENT, `Testing skill "${name}" with args: ${JSON.stringify(sampleArgs)}`);
            const result = await handler.execute(sampleArgs);
            return { success: true, output: result, durationMs: Date.now() - startTime };
        } else {
            return { success: false, error: 'YAML skill testing not yet supported — convert to JS first', durationMs: Date.now() - startTime };
        }
    } catch (err) {
        return { success: false, error: (err as Error).message, durationMs: Date.now() - startTime };
    }
}
