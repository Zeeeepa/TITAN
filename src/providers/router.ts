/**
 * TITAN — Universal Model Router
 * Routes model requests to the correct provider with failover, alias resolution,
 * and live model discovery across all configured providers (including local Ollama).
 */
import { LLMProvider, type ChatOptions, type ChatResponse, type ChatStreamChunk } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GoogleProvider } from './google.js';
import { OllamaProvider } from './ollama.js';
import { OpenAICompatProvider, PROVIDER_PRESETS } from './openai_compat.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Router';

// ── Provider name normalization ─────────────────────────────────
const PROVIDER_ALIASES: Record<string, string> = {
    'z.ai': 'xai',
    'zai': 'xai',
    'grok': 'xai',
    'local': 'ollama',
    'vertex': 'google',
    'vertex-ai': 'google',
    'azure-openai': 'azure',
    'aws': 'bedrock',
    'amazon': 'bedrock',
    'litellm-proxy': 'litellm',
};

/** Normalize provider names for consistency (e.g. "grok" → "xai", "local" → "ollama") */
export function normalizeProvider(name: string): string {
    const lower = name.toLowerCase();
    return PROVIDER_ALIASES[lower] || lower;
}

/** Provider registry */
const providers: Map<string, LLMProvider> = new Map();
let initialized = false;

function initProviders(): void {
    if (initialized) return;
    // Core providers (custom implementations)
    providers.set('anthropic', new AnthropicProvider());
    providers.set('openai', new OpenAIProvider());
    providers.set('google', new GoogleProvider());
    providers.set('ollama', new OllamaProvider());
    // OpenAI-compatible providers (Groq, Mistral, OpenRouter, xAI, etc.)
    for (const preset of PROVIDER_PRESETS) {
        providers.set(preset.name, new OpenAICompatProvider(preset));
    }
    initialized = true;
}

/** Get a provider by name */
export function getProvider(name: string): LLMProvider | undefined {
    initProviders();
    return providers.get(name);
}

/** Get all registered providers */
export function getAllProviders(): Map<string, LLMProvider> {
    initProviders();
    return providers;
}

/** Resolve a model alias (e.g. "fast" → "openai/gpt-4o-mini") */
function resolveAlias(modelId: string): string {
    const config = loadConfig();
    const aliases = config.agent.modelAliases;
    if (aliases && aliases[modelId]) {
        const resolved = aliases[modelId];
        logger.debug(COMPONENT, `Alias "${modelId}" → "${resolved}"`);
        return resolved;
    }
    return modelId;
}

/** Resolve the provider and model from a model ID like "anthropic/claude-3" or alias like "fast" */
export function resolveModel(modelId: string): { provider: LLMProvider; model: string } {
    initProviders();
    // First resolve aliases
    const resolved = resolveAlias(modelId);
    const { provider: rawProviderName, model } = LLMProvider.parseModelId(resolved);
    // Normalize provider name (e.g. "grok" → "xai", "local" → "ollama")
    const providerName = normalizeProvider(rawProviderName);
    const provider = providers.get(providerName);
    if (!provider) {
        throw new Error(`Unknown provider: ${providerName}. Available: ${Array.from(providers.keys()).join(', ')}`);
    }
    return { provider, model };
}

/** Check if a model is allowed by the allowlist. Empty list = all allowed. */
export function isModelAllowed(modelId: string): boolean {
    const config = loadConfig();
    const allowedModels = config.agent.allowedModels;
    if (!allowedModels || allowedModels.length === 0) return true;

    // Resolve alias first
    const resolved = resolveAlias(modelId);

    for (const pattern of allowedModels) {
        if (pattern === resolved) return true;
        // Wildcard support: "openai/*" matches "openai/gpt-4o"
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -1); // "openai/"
            if (resolved.startsWith(prefix)) return true;
        }
    }
    return false;
}

/** Discovered model info */
export interface DiscoveredModel {
    id: string;          // Full ID e.g. "ollama/llama3.1"
    provider: string;    // Provider name e.g. "ollama"
    model: string;       // Model name e.g. "llama3.1"
    displayName: string; // Provider display name e.g. "Ollama (Local)"
    source: 'static' | 'live'; // Whether discovered via live API or hardcoded list
}

/** Cache for discovered models (refreshed on demand, 60s TTL) */
let modelCache: { models: DiscoveredModel[]; timestamp: number } | null = null;
const MODEL_CACHE_TTL = 60_000; // 60 seconds

/**
 * Discover all available models across all providers.
 * Queries each provider's listModels() — for Ollama this hits the local API
 * to find actually-installed models. Results are cached for 60s.
 */
export async function discoverAllModels(forceRefresh = false): Promise<DiscoveredModel[]> {
    initProviders();

    if (!forceRefresh && modelCache && (Date.now() - modelCache.timestamp) < MODEL_CACHE_TTL) {
        return modelCache.models;
    }

    const discovered: DiscoveredModel[] = [];
    const health = await healthCheckAll();

    const tasks = Array.from(providers.entries()).map(async ([name, provider]) => {
        try {
            const models = await provider.listModels();
            const isLive = health[name] === true;
            for (const model of models) {
                discovered.push({
                    id: `${name}/${model}`,
                    provider: name,
                    model,
                    displayName: provider.displayName,
                    source: (name === 'ollama' && isLive) ? 'live' : 'static',
                });
            }
        } catch (err) {
            logger.debug(COMPONENT, `Failed to list models for ${name}: ${(err as Error).message}`);
        }
    });

    await Promise.all(tasks);

    modelCache = { models: discovered, timestamp: Date.now() };
    logger.info(COMPONENT, `Discovered ${discovered.length} models across ${providers.size} providers`);
    return discovered;
}

/** Get current model aliases from config */
export function getModelAliases(): Record<string, string> {
    const config = loadConfig();
    return config.agent.modelAliases || {};
}

/** Send a chat request, automatically routing to the correct provider */
export async function chat(options: ChatOptions): Promise<ChatResponse> {
    const modelId = options.model || 'anthropic/claude-sonnet-4-20250514';
    const { provider, model } = resolveModel(modelId);

    logger.info(COMPONENT, `Routing to ${provider.displayName} (model: ${model})`);

    try {
        return await provider.chat({ ...options, model });
    } catch (error) {
        logger.error(COMPONENT, `Provider ${provider.name} failed: ${(error as Error).message}`);
        // Attempt failover to other providers
        const failoverOrder = ['anthropic', 'openai', 'google', 'ollama'];
        for (const fallbackName of failoverOrder) {
            if (fallbackName === provider.name) continue;
            const fallback = providers.get(fallbackName);
            if (!fallback) continue;

            try {
                const healthy = await fallback.healthCheck();
                if (!healthy) continue;

                const models = await fallback.listModels();
                if (models.length === 0) continue;

                // Prefer a model with a similar name prefix (e.g. claude-* → claude-*)
                const originalPrefix = model.split('-')[0];
                const preferred = models.find(m => m.startsWith(originalPrefix)) || models[0];

                logger.warn(COMPONENT, `Failing over from ${provider.name}/${model} → ${fallback.name}/${preferred}`);
                return await fallback.chat({ ...options, model: preferred });
            } catch (fallbackErr) {
                logger.warn(COMPONENT, `Fallback ${fallbackName} also failed: ${fallbackErr}`);
                continue;
            }
        }
        throw error;
    }
}

/** Send a streaming chat request with failover */
export async function* chatStream(options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    const modelId = options.model || 'anthropic/claude-sonnet-4-20250514';
    const { provider, model } = resolveModel(modelId);

    logger.info(COMPONENT, `Streaming via ${provider.displayName} (model: ${model})`);

    try {
        yield* provider.chatStream({ ...options, model });
    } catch (error) {
        logger.error(COMPONENT, `Stream provider ${provider.name} failed: ${(error as Error).message}`);

        // Notify consumer that a failover is happening
        yield {
            type: 'failover' as const,
            originalProvider: provider.name,
            originalModel: model,
            error: (error as Error).message,
        };

        // Attempt failover to other providers
        const failoverOrder = ['anthropic', 'openai', 'google', 'ollama'];
        let failedOver = false;
        for (const fallbackName of failoverOrder) {
            if (fallbackName === provider.name) continue;
            const fallback = providers.get(fallbackName);
            if (!fallback) continue;

            try {
                const healthy = await fallback.healthCheck();
                if (!healthy) continue;

                const models = await fallback.listModels();
                if (models.length === 0) continue;

                // Prefer a model with a similar name prefix (e.g. claude-* → claude-*)
                const originalPrefix = model.split('-')[0];
                const preferred = models.find(m => m.startsWith(originalPrefix)) || models[0];

                logger.warn(COMPONENT, `Stream failing over from ${provider.name}/${model} → ${fallback.name}/${preferred}`);
                yield* fallback.chatStream({ ...options, model: preferred });
                failedOver = true;
                break;
            } catch (fallbackErr) {
                logger.warn(COMPONENT, `Fallback ${fallbackName} also failed: ${fallbackErr}`);
                continue;
            }
        }
        if (!failedOver) {
            yield { type: 'error', error: (error as Error).message };
        }
    }
}

/** Health check all providers */
export async function healthCheckAll(): Promise<Record<string, boolean>> {
    initProviders();
    const entries = Array.from(providers.entries());
    const settled = await Promise.allSettled(
        entries.map(([, provider]) => provider.healthCheck())
    );
    const results: Record<string, boolean> = {};
    for (let i = 0; i < entries.length; i++) {
        const [name] = entries[i];
        const outcome = settled[i];
        results[name] = outcome.status === 'fulfilled' ? outcome.value : false;
    }
    return results;
}
