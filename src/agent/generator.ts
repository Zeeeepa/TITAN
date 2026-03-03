/**
 * TITAN — Skill Auto-Generation Engine
 * Allows TITAN to dynamically write, validate, and install its own TypeScript tools
 * when it encounters a task it doesn't currently have a skill for.
 */
import path from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { loadConfig } from '../config/config.js';
import { chat } from '../providers/router.js';
import type { ChatMessage } from '../providers/base.js';
import { TITAN_HOME } from '../utils/constants.js';
import { loadAutoSkills, getSkill } from '../skills/registry.js';
import logger from '../utils/logger.js';
import { execFileSync } from 'child_process';

const COMPONENT = 'SkillGenerator';
const AUTO_SKILLS_DIR = path.join(TITAN_HOME, 'skills', 'auto');

export interface GenerationResult {
    success: boolean;
    skillName?: string;
    filePath?: string;
    error?: string;
}

const GENERATOR_PROMPT = `You are the core intelligence of TITAN, an elite autonomous AI agent framework.
Your task is to generate a new, fully functional TypeScript tool (skill) based on the user's request.

CRITICAL REQUIREMENTS FOR THE CODE:
1. It MUST export a "default" object that implements the "ToolConfig" interface.
2. It MUST use ESM imports (e.g., "import { ... } from '...'").
3. It CAN ONLY use built-in Node.js modules (fs, path, crypto, child_process, os, http, https, url) unless you are absolutely certain a specific npm package is guaranteed to be installed globally. Prefer built-ins.
4. It MUST handle errors gracefully and return descriptive string messages.
5. Do NOT wrap the output in markdown code blocks. Output ONLY the raw TypeScript code.

Here is the exact ToolConfig interface you must implement:
export interface ToolConfig {
    name: string;        // lowercase, alphanumeric, underscores only (e.g. 'my_custom_tool')
    description: string; // concise explanation of what the tool does
    parameters: any;     // Zod schema converted to JSON schema format for LLM function calling
    execute: (args: any, config: any) => Promise<string>; // the async execution function
}

Example JSON schema for parameters (must follow this exact structure):
{
    "type": "object",
    "properties": {
        "filePath": {
            "type": "string",
            "description": "Absolute path to the file"
        }
    },
    "required": ["filePath"]
}

Example implementation format:
import fs from 'fs';

export default {
    name: "count_lines",
    description: "Counts the number of lines in a given text file.",
    parameters: {
        type: "object",
        properties: {
            filePath: { type: "string" }
        },
        required: ["filePath"]
    },
    execute: async (args, config) => {
        try {
            const content = fs.readFileSync(args.filePath, 'utf-8');
            return \`File has \${content.split('\\n').length} lines.\`;
        } catch (e) {
            return \`Error: \${e.message}\`;
        }
    }
};

Now, generate the TypeScript code for the following requested tool capability:
`;

/**
 * Generate, validate, and install a new skill.
 */
export async function generateAndInstallSkill(
    description: string,
    requestedName: string
): Promise<GenerationResult> {
    logger.info(COMPONENT, `Initiating auto-generation for skill: "${requestedName}"`);

    // Ensure auto directory exists
    if (!existsSync(AUTO_SKILLS_DIR)) {
        mkdirSync(AUTO_SKILLS_DIR, { recursive: true });
    }

    try {
        const config = loadConfig();
        const model = config.agent.model; // Use primary agent model to write code

        // 1. Generate the Code
        logger.debug(COMPONENT, `Prompting ${model} to generate code...`);
        const messages: ChatMessage[] = [
            { role: 'user', content: GENERATOR_PROMPT + `\nRequested Capability: ${description}\nRequested Name: ${requestedName}` }
        ];

        const response = await chat({ messages, model });
        let code = response.content;

        // Clean up markdown block if the LLM ignored instructions
        if (code.startsWith('```typescript')) {
            code = code.replace(/^```typescript\n/, '').replace(/\n```$/, '');
        } else if (code.startsWith('```')) {
            code = code.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        // 2. Static Analysis / Safety Check (Basic)
        // Prevent obvious malicious generation (e.g., trying to modify TITAN itself)
        if (code.includes('process.exit') || code.includes('rm -rf /*') || code.includes('fs.rmSync(\'/\'')) {
            return { success: false, error: "Generated code failed safety static analysis." };
        }

        // Extract the name from the generated code (fallback to requestedName)
        const nameMatch = code.match(/name:\s*['"]([a-z0-9_]+)['"]/);
        const finalName = nameMatch ? nameMatch[1] : requestedName.replace(/[^a-z0-9_]/g, '_');

        const tsFilePath = path.join(AUTO_SKILLS_DIR, `${finalName}.ts`);
        const jsFilePath = path.join(AUTO_SKILLS_DIR, `${finalName}.js`);

        // 3. Write to disk
        writeFileSync(tsFilePath, code, 'utf-8');
        logger.info(COMPONENT, `Wrote generated source to ${tsFilePath}`);

        // 4. Compile it exactly like TITAN does (tsc)
        try {
            // Use tsx or tsc to compile it to JS so Node can load it dynamically
            // We'll write a tiny compiler script or use tsc directly if available globally
            execFileSync('npx', ['tsc', tsFilePath, '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022'], { stdio: 'pipe' });
            logger.info(COMPONENT, `Compiled ${finalName}.ts successfully.`);
        } catch (compileError: unknown) {
            logger.error(COMPONENT, `Compilation failed for ${finalName}`);
            return { success: false, error: `Compilation failed: ${compileError instanceof Error ? compileError.message : 'Unknown error'}` };
        }

        if (!existsSync(jsFilePath)) {
            return { success: false, error: "Compilation did not produce a .js file." };
        }

        // 5. Reload Skills Registry
        // By calling loadAutoSkills, it will pick up the new .js file if we ensure it scans the auto dir
        await loadAutoSkills();

        // 6. Verify the skill was actually registered (B2-5)
        const registered = getSkill(finalName);
        if (!registered) {
            logger.error(COMPONENT, `Skill "${finalName}" compiled but failed to register`);
            return { success: false, error: 'Skill compiled but failed to register' };
        }

        // 7. Basic smoke test — import and call execute({}) to catch immediate errors (B2-5)
        try {
            const modulePath = `file://${jsFilePath}?t=${Date.now()}`;
            const mod = await import(modulePath);
            if (mod.default?.execute) {
                await mod.default.execute({}, config);
            }
            logger.debug(COMPONENT, `Smoke test passed for ${finalName}`);
        } catch (smokeErr: unknown) {
            const smokeMsg = smokeErr instanceof Error ? smokeErr.message : String(smokeErr);
            logger.warn(COMPONENT, `Smoke test warning for ${finalName}: ${smokeMsg} (skill still registered)`);
            // Don't fail here — the skill is registered and may work with proper args
        }

        logger.info(COMPONENT, `Successfully generated and installed new skill: ${finalName}`);

        return {
            success: true,
            skillName: finalName,
            filePath: tsFilePath
        };

    } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error(COMPONENT, `Auto-generation failed: ${errMsg}`);
        return { success: false, error: errMsg };
    }
}
