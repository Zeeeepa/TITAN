/**
 * TITAN — Recipe Store
 * Saves and loads personal recipes from ~/.titan/recipes/
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import type { Recipe } from './types.js';

const RECIPES_DIR = join(TITAN_HOME, 'recipes');

function ensureRecipesDir(): void {
    if (!existsSync(RECIPES_DIR)) mkdirSync(RECIPES_DIR, { recursive: true });
}

/** Load all saved recipes */
export function listRecipes(): Recipe[] {
    ensureRecipesDir();
    return readdirSync(RECIPES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            try {
                return JSON.parse(readFileSync(join(RECIPES_DIR, f), 'utf-8')) as Recipe;
            } catch {
                return null;
            }
        })
        .filter((r): r is Recipe => r !== null);
}

/** Get a recipe by ID or slash command */
export function getRecipe(idOrSlash: string): Recipe | null {
    const recipes = listRecipes();
    return recipes.find(
        (r) => r.id === idOrSlash || r.slashCommand === idOrSlash
    ) || null;
}

/** Save or update a recipe */
export function saveRecipe(recipe: Recipe): void {
    ensureRecipesDir();
    writeFileSync(join(RECIPES_DIR, `${recipe.id}.json`), JSON.stringify(recipe, null, 2), 'utf-8');
}

/** Delete a recipe by ID */
export function deleteRecipe(id: string): void {
    const path = join(RECIPES_DIR, `${id}.json`);
    if (existsSync(path)) unlinkSync(path);
}

/** Get a recipe by slash command (e.g. "code-review") */
export function findBySlashCommand(command: string): Recipe | null {
    return listRecipes().find((r) => r.slashCommand === command) || null;
}

/** Return built-in starter recipes */
export function getBuiltinRecipes(): Recipe[] {
    const now = new Date().toISOString();
    return [
        {
            id: 'code-review',
            name: 'Code Review',
            description: 'Review a file or snippet for bugs, issues, and improvements',
            slashCommand: 'code-review',
            parameters: {
                file: { description: 'Path to the file to review', required: false },
            },
            steps: [
                { prompt: 'Please do a thorough code review of {{file}}. Look for bugs, security issues, performance problems, and suggest improvements. Be direct and specific.' },
            ],
            author: 'Tony Elliott',
            tags: ['coding', 'review'],
            createdAt: now,
        },
        {
            id: 'daily-standup',
            name: 'Daily Standup',
            description: 'Summarise what you did yesterday and plan for today',
            slashCommand: 'standup',
            steps: [
                { prompt: 'Help me prepare my daily standup. Ask me what I worked on yesterday, what I\'m working on today, and whether I have any blockers. Then format it as a clean standup message I can copy.' },
            ],
            author: 'Tony Elliott',
            tags: ['productivity', 'work'],
            createdAt: now,
        },
        {
            id: 'explain-code',
            name: 'Explain Code',
            description: 'Explain what a piece of code does in plain English',
            slashCommand: 'explain',
            parameters: {
                file: { description: 'File or code snippet to explain', required: false },
            },
            steps: [
                { prompt: 'Please explain {{file}} in plain English. Break down what it does, how it works, and any important patterns or concepts. Assume I\'m a smart person but may not know this codebase.' },
            ],
            author: 'Tony Elliott',
            tags: ['coding', 'learning'],
            createdAt: now,
        },
        {
            id: 'brainstorm',
            name: 'Brainstorm',
            description: 'Brainstorm ideas on any topic',
            slashCommand: 'brainstorm',
            parameters: {
                topic: { description: 'Topic to brainstorm about', required: true },
            },
            steps: [
                { prompt: 'Let\'s brainstorm ideas about {{topic}}. Give me at least 10 creative, diverse ideas. Think outside the box and include some unconventional options. Then help me evaluate the best ones.' },
            ],
            author: 'Tony Elliott',
            tags: ['creativity', 'productivity'],
            createdAt: now,
        },
        {
            id: 'debug',
            name: 'Debug Issue',
            description: 'Help debug an error or unexpected behavior',
            slashCommand: 'debug',
            parameters: {
                error: { description: 'The error message or description of the problem', required: false },
            },
            steps: [
                { prompt: 'Help me debug this issue: {{error}}. Walk me through potential root causes, how to diagnose each one, and then provide a fix.' },
            ],
            author: 'Tony Elliott',
            tags: ['coding', 'debugging'],
            createdAt: now,
        },
        {
            id: 'morning-briefing',
            name: 'Morning Briefing',
            description: 'Get a personalised daily briefing — active projects, goals, monitors, and suggested tasks',
            slashCommand: 'briefing',
            steps: [
                {
                    prompt: 'Give me my morning briefing. Summarise: (1) my active projects and any recent progress, (2) my current goals and which are highest priority, (3) any active monitors that are watching for events, (4) suggested tasks I could work on today based on what I\'ve been doing, and (5) one motivational thought to start the day. Be concise and actionable.',
                },
            ],
            author: 'Tony Elliott',
            tags: ['productivity', 'daily', 'briefing'],
            createdAt: now,
        },
    ];
}

/** Seed builtin recipes if user has none */
export function seedBuiltinRecipes(): void {
    ensureRecipesDir();
    const existing = listRecipes();
    if (existing.length === 0) {
        for (const r of getBuiltinRecipes()) {
            saveRecipe(r);
        }
    }
}
