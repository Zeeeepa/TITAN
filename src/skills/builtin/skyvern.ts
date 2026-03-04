/**
 * TITAN — Skyvern Browser Automation Skills (Built-in)
 * Native REST API tools for Skyvern: task execution, data extraction, and session management.
 * Uses fetch against Skyvern's API — no @skyvern/client SDK needed.
 */
import { registerSkill } from '../registry.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'Skyvern';

function getConfig() {
    return {
        apiKey: process.env.SKYVERN_API_KEY || 'local',
        baseUrl: (process.env.SKYVERN_BASE_URL || 'http://localhost:8000').replace(/\/$/, ''),
    };
}

function headers(): Record<string, string> {
    const { apiKey } = getConfig();
    return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
    };
}

async function skyvernFetch(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const { baseUrl } = getConfig();
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, { ...options, headers: { ...headers(), ...options.headers as Record<string, string> } });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Skyvern API error (${response.status}): ${text}`);
    }
    return response.json() as Promise<Record<string, unknown>>;
}

async function pollTask(taskId: string, maxWaitMs: number = 120_000): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    const pollInterval = 3000;
    while (Date.now() - startTime < maxWaitMs) {
        const result = await skyvernFetch(`/api/v2/tasks/${taskId}`);
        const status = result.status as string;
        if (status === 'completed' || status === 'failed' || status === 'terminated') {
            return result;
        }
        await new Promise(r => setTimeout(r, pollInterval));
    }
    return { status: 'timeout', task_id: taskId, error: `Task did not complete within ${maxWaitMs / 1000}s` };
}

export function registerSkyvernSkill(): void {
    // Tool 1: skyvern_task — Run browser automation with natural language
    registerSkill(
        { name: 'skyvern_task', description: 'Run a browser automation task', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'skyvern_task',
            description: 'Run a browser automation task using natural language. Skyvern uses vision + LLMs to interact with web pages without brittle selectors.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Natural language description of the task to perform' },
                    url: { type: 'string', description: 'Starting URL (optional — Skyvern can navigate on its own)' },
                    extraction_schema: { type: 'object', description: 'JSON Schema for data to extract from the page (optional)' },
                },
                required: ['prompt'],
            },
            execute: async (args) => {
                try {
                    const body: Record<string, unknown> = {
                        navigation_goal: args.prompt as string,
                    };
                    if (args.url) body.url = args.url;
                    if (args.extraction_schema) body.data_extraction_goal = args.prompt;
                    if (args.extraction_schema) body.extracted_information_schema = args.extraction_schema;

                    const task = await skyvernFetch('/api/v2/tasks', {
                        method: 'POST',
                        body: JSON.stringify(body),
                    });

                    const taskId = task.task_id as string;
                    logger.info(COMPONENT, `Task created: ${taskId}`);

                    const result = await pollTask(taskId);
                    return JSON.stringify({
                        task_id: taskId,
                        status: result.status,
                        extracted_data: result.extracted_information ?? null,
                        screenshot_url: result.screenshot_url ?? null,
                        failure_reason: result.failure_reason ?? null,
                    }, null, 2);
                } catch (e) {
                    return `Error: ${(e as Error).message}`;
                }
            },
        },
    );

    // Tool 2: skyvern_extract — Extract structured data from a webpage
    registerSkill(
        { name: 'skyvern_extract', description: 'Extract data from a webpage', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'skyvern_extract',
            description: 'Extract structured data from a webpage using natural language. Shortcut for skyvern_task focused on data extraction.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL of the page to extract data from' },
                    prompt: { type: 'string', description: 'What data to extract (natural language)' },
                    schema: { type: 'object', description: 'JSON Schema defining the structure of extracted data (optional)' },
                },
                required: ['url', 'prompt'],
            },
            execute: async (args) => {
                try {
                    const body: Record<string, unknown> = {
                        url: args.url as string,
                        data_extraction_goal: args.prompt as string,
                    };
                    if (args.schema) body.extracted_information_schema = args.schema;

                    const task = await skyvernFetch('/api/v2/tasks', {
                        method: 'POST',
                        body: JSON.stringify(body),
                    });

                    const taskId = task.task_id as string;
                    logger.info(COMPONENT, `Extract task created: ${taskId}`);

                    const result = await pollTask(taskId);
                    return JSON.stringify({
                        task_id: taskId,
                        status: result.status,
                        extracted_data: result.extracted_information ?? null,
                        failure_reason: result.failure_reason ?? null,
                    }, null, 2);
                } catch (e) {
                    return `Error: ${(e as Error).message}`;
                }
            },
        },
    );

    // Tool 3: skyvern_sessions — Manage persistent browser sessions
    registerSkill(
        { name: 'skyvern_sessions', description: 'Manage browser sessions', version: '1.0.0', source: 'bundled', enabled: true },
        {
            name: 'skyvern_sessions',
            description: 'Create, list, or close persistent Skyvern browser sessions for multi-step workflows.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['create', 'list', 'close'], description: 'Session action to perform' },
                    session_id: { type: 'string', description: 'Session ID (required for close)' },
                },
                required: ['action'],
            },
            execute: async (args) => {
                try {
                    const action = args.action as string;
                    if (action === 'create') {
                        const session = await skyvernFetch('/api/v2/browser_sessions', {
                            method: 'POST',
                            body: JSON.stringify({}),
                        });
                        return JSON.stringify({ session_id: session.browser_session_id, status: 'created' }, null, 2);
                    } else if (action === 'list') {
                        const sessions = await skyvernFetch('/api/v2/browser_sessions');
                        return JSON.stringify(sessions, null, 2);
                    } else if (action === 'close') {
                        if (!args.session_id) return 'Error: session_id is required for close action';
                        await skyvernFetch(`/api/v2/browser_sessions/${args.session_id}`, { method: 'DELETE' });
                        return JSON.stringify({ session_id: args.session_id, status: 'closed' }, null, 2);
                    }
                    return `Error: Unknown action "${action}". Use create, list, or close.`;
                } catch (e) {
                    return `Error: ${(e as Error).message}`;
                }
            },
        },
    );

    logger.info(COMPONENT, 'Registered 3 native Skyvern tools');
}
