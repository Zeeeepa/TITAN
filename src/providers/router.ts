/**
 * TITAN — Provider Router
 * Routes model requests to the correct provider with failover support.
 */
import { LLMProvider, type ChatOptions, type ChatResponse, type ChatStreamChunk } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GoogleProvider } from './google.js';
import { OllamaProvider } from './ollama.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Router';

/** Provider registry */
const providers: Map<string, LLMProvider> = new Map();
let initialized = false;

function initProviders(): void {
    if (initialized) return;
    providers.set('anthropic', new AnthropicProvider());
    providers.set('openai', new OpenAIProvider());
    providers.set('google', new GoogleProvider());
    providers.set('ollama', new OllamaProvider());
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

/** Resolve the provider and model from a model ID like "anthropic/claude-3" */
export function resolveModel(modelId: string): { provider: LLMProvider; model: string } {
    initProviders();
    const { provider: providerName, model } = LLMProvider.parseModelId(modelId);
    const provider = providers.get(providerName);
    if (!provider) {
        throw new Error(`Unknown provider: ${providerName}. Available: ${Array.from(providers.keys()).join(', ')}`);
    }
    return { provider, model };
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

                logger.warn(COMPONENT, `Failing over to ${fallback.displayName} (model: ${models[0]})`);
                return await fallback.chat({ ...options, model: models[0] });
            } catch {
                continue;
            }
        }
        throw error;
    }
}

/** Send a streaming chat request */
export async function* chatStream(options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    const modelId = options.model || 'anthropic/claude-sonnet-4-20250514';
    const { provider, model } = resolveModel(modelId);
    yield* provider.chatStream({ ...options, model });
}

/** Health check all providers */
export async function healthCheckAll(): Promise<Record<string, boolean>> {
    initProviders();
    const results: Record<string, boolean> = {};
    for (const [name, provider] of providers) {
        try {
            results[name] = await provider.healthCheck();
        } catch {
            results[name] = false;
        }
    }
    return results;
}
