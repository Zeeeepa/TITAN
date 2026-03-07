/**
 * TITAN Brain — Embedded Small LLM for Intelligent Routing
 *
 * Runs a tiny quantized model (0.3-0.8B params) in-process via node-llama-cpp
 * to replace brittle regex heuristics with learned intelligence.
 *
 * Current capabilities:
 *   - Tool pre-filtering: select 8-12 relevant tools from 80+ to save tokens
 *
 * Design principles:
 *   - Optional: disabled by default, zero impact when off
 *   - Fallback: never replaces regex — enhances it, falls back gracefully
 *   - Non-blocking: all inference async with configurable timeout
 *   - Lazy-loaded: model only loaded on first use
 */
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig } from '../config/config.js';
import type { ToolDefinition } from '../providers/base.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Brain';

// ─── Model registry ──────────────────────────────────────────────────
interface ModelInfo {
    id: string;
    filename: string;
    url: string;
    sizeBytes: number;
}

const MODELS: Record<string, ModelInfo> = {
    'smollm2-360m': {
        id: 'smollm2-360m',
        filename: 'smollm2-360m-instruct-q8_0.gguf',
        url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
        sizeBytes: 386_000_000,
    },
    'qwen3.5-0.8b': {
        id: 'qwen3.5-0.8b',
        filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
        url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
        sizeBytes: 491_000_000,
    },
};

// ─── State ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaModule: any = null;
let llamaInstance: any = null;
let model: unknown = null;
let loaded = false;
let loading = false;
let loadError: string | null = null;
let inferenceCount = 0;
let totalLatencyMs = 0;

// ─── GBNF Grammar for category selection ─────────────────────────────
// Forces the model to output a single category letter
const CATEGORY_GRAMMAR = `root ::= [a-g]`;

// ─── Tool categories — maps simple labels to tool names ──────────────
const TOOL_CATEGORIES: Record<string, string[]> = {
    a: ['shell', 'exec'],                                           // run commands
    b: ['read_file', 'write_file', 'edit_file', 'list_dir'],       // file operations
    c: ['web_search', 'web_fetch', 'web_read', 'web_act', 'browse_url', 'browser_search', 'browser_auto_nav', 'browser'], // web/search
    d: ['memory', 'graph_remember', 'graph_search', 'graph_recall'], // memory
    e: ['email_send', 'email_search', 'email_read', 'email_list'],  // email
    f: ['cron', 'webhook'],                                         // automation
    g: ['shell', 'read_file', 'write_file', 'web_search', 'memory'], // general/unclear
};

// ─── Model directory ─────────────────────────────────────────────────
function getModelsDir(): string {
    const dir = join(homedir(), '.titan', 'models');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

function getModelPath(modelId: string): string {
    const info = MODELS[modelId];
    if (!info) throw new Error(`Unknown brain model: ${modelId}`);
    return join(getModelsDir(), info.filename);
}

// ─── Public API ──────────────────────────────────────────────────────

/** Check if brain is enabled in config and the module loaded successfully */
export function isAvailable(): boolean {
    return loaded && !loadError;
}

/** Get brain performance stats */
export function getStats(): { loaded: boolean; inferenceCount: number; avgLatencyMs: number; error: string | null } {
    return {
        loaded,
        inferenceCount,
        avgLatencyMs: inferenceCount > 0 ? Math.round(totalLatencyMs / inferenceCount) : 0,
        error: loadError,
    };
}

/** Ensure the brain model is loaded and ready. Returns true if available. */
export async function ensureLoaded(): Promise<boolean> {
    if (loaded) return true;
    if (loading) {
        // Wait for in-progress load
        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (!loading) { clearInterval(interval); resolve(); }
            }, 100);
        });
        return loaded;
    }
    if (loadError) return false;

    const config = loadConfig();
    const brainConfig = (config as Record<string, unknown>).brain as {
        enabled?: boolean;
        model?: string;
        autoDownload?: boolean;
    } | undefined;

    if (!brainConfig?.enabled) {
        return false;
    }

    loading = true;
    const modelId = brainConfig.model || 'smollm2-360m';
    const modelPath = getModelPath(modelId);

    try {
        // Dynamic import — node-llama-cpp is an optional dependency
        if (!llamaModule) {
            // Dynamic import avoids hard dependency — uses Function constructor to bypass
            // TypeScript's static module resolution for optional dependencies
            const importFn = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;
            llamaModule = await importFn('node-llama-cpp');
        }

        // Download model if needed
        if (!existsSync(modelPath)) {
            if (!brainConfig.autoDownload) {
                loadError = `Model not found at ${modelPath} and autoDownload is disabled`;
                loading = false;
                return false;
            }
            await downloadModel(modelId);
        }

        // Load model
        const startLoad = Date.now();
        llamaInstance = await (llamaModule as any).getLlama();
        model = await llamaInstance.loadModel({ modelPath });
        loaded = true;
        logger.info(COMPONENT, `Model loaded: ${modelId} (${Date.now() - startLoad}ms)`);
    } catch (err) {
        loadError = `Failed to load brain model: ${(err as Error).message}`;
        logger.error(COMPONENT, loadError);
    } finally {
        loading = false;
    }

    return loaded;
}

/**
 * Select relevant tools for a user message.
 * Returns a filtered subset of tools, or the full list if brain fails.
 */
export async function selectTools(
    message: string,
    allTools: ToolDefinition[],
): Promise<ToolDefinition[]> {
    const config = loadConfig();
    const brainConfig = (config as Record<string, unknown>).brain as {
        maxToolsPerRequest?: number;
        timeoutMs?: number;
    } | undefined;

    const maxTools = brainConfig?.maxToolsPerRequest ?? 12;
    const timeoutMs = brainConfig?.timeoutMs ?? 2000;

    if (!isAvailable() || allTools.length <= maxTools) {
        return allTools;
    }

    const prompt = `Classify this message into ONE category:
a=run a command, b=read/write files, c=web search or browse, d=remember something, e=send email, f=schedule/automate, g=other

Message: "${message.slice(0, 150)}"
Category:`;

    try {
        const result = await Promise.race([
            runInference(prompt),
            new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Brain inference timeout')), timeoutMs)
            ),
        ]);

        if (!result) return allTools;

        // Extract category letter
        const category = (result as string).trim().toLowerCase().charAt(0);
        const toolNames = TOOL_CATEGORIES[category];
        if (!toolNames) {
            logger.warn(COMPONENT, `Unknown category: "${category}" (raw: "${result}"), using all tools`);
            return allTools;
        }

        const selectedSet = new Set(toolNames);
        const filtered = allTools.filter(t => selectedSet.has(t.function.name));

        // Sanity check: don't return empty
        if (filtered.length === 0) return allTools;

        inferenceCount++;
        logger.info(COMPONENT, `Category: ${category} → [${filtered.map(t => t.function.name).join(', ')}]`);
        return filtered;
    } catch (err) {
        logger.warn(COMPONENT, `Tool selection failed, using all tools: ${(err as Error).message}`);
        return allTools;
    }
}

// ─── Internal helpers ────────────────────────────────────────────────

/** Run inference on the loaded model */
async function runInference(prompt: string): Promise<string> {
    if (!model || !llamaModule || !llamaInstance) throw new Error('Brain model not loaded');

    const startTime = Date.now();

    try {
        // Create a fresh context for each inference to avoid "no sequences left"
        const ctx = await (model as any).createContext({ contextSize: 512 });
        const session = new (llamaModule as any).LlamaChatSession({
            contextSequence: ctx.getSequence(),
        });

        // Use GBNF grammar to constrain output to a single category letter
        // Must use the same llama instance that loaded the model
        const grammar = new (llamaModule as any).LlamaGrammar(llamaInstance, {
            grammar: CATEGORY_GRAMMAR,
        });

        const response = await session.prompt(prompt, {
            maxTokens: 4,
            grammar,
        });

        // Clean up context after inference
        await ctx.dispose();

        const elapsed = Date.now() - startTime;
        totalLatencyMs += elapsed;
        logger.info(COMPONENT, `Inference completed in ${elapsed}ms`);

        return response;
    } catch (err) {
        logger.error(COMPONENT, `Inference error: ${(err as Error).message}`);
        throw err;
    }
}

/** Download a model file from HuggingFace */
async function downloadModel(modelId: string): Promise<void> {
    const info = MODELS[modelId];
    if (!info) throw new Error(`Unknown model: ${modelId}`);

    const destPath = join(getModelsDir(), info.filename);
    logger.info(COMPONENT, `Downloading brain model: ${info.id} (~${Math.round(info.sizeBytes / 1_000_000)}MB)...`);

    const response = await fetch(info.url, { redirect: 'follow' });
    if (!response.ok || !response.body) {
        throw new Error(`Failed to download model: HTTP ${response.status}`);
    }

    const fileStream = createWriteStream(destPath);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();

    let downloaded = 0;
    let lastLogPct = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        downloaded += value.length;

        const pct = Math.round((downloaded / info.sizeBytes) * 100);
        if (pct >= lastLogPct + 20) {
            logger.info(COMPONENT, `Download progress: ${pct}%`);
            lastLogPct = pct;
        }
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
    });

    logger.info(COMPONENT, `Model downloaded: ${destPath}`);
}

/** Unload the model and free memory */
export async function unload(): Promise<void> {
    if (model && typeof (model as any).dispose === 'function') {
        await (model as any).dispose();
    }
    model = null;
    llamaInstance = null;
    loaded = false;
    loading = false;
    loadError = null;
    inferenceCount = 0;
    totalLatencyMs = 0;
    logger.info(COMPONENT, 'Brain model unloaded');
}
