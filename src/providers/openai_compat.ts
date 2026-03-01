/**
 * TITAN — Generic OpenAI-Compatible Provider
 * A single provider class that works with any OpenAI-compatible API endpoint.
 * Used by: Groq, Mistral, OpenRouter, Fireworks, xAI, Together, DeepSeek,
 *          Cerebras, Cohere, Perplexity, and any custom provider.
 */
import {
    LLMProvider,
    type ChatOptions,
    type ChatResponse,
    type ChatStreamChunk,
    type ToolCall,
} from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';
import { fetchWithRetry } from '../utils/helpers.js';
import { v4 as uuid } from 'uuid';

/** Configuration for an OpenAI-compatible provider */
export interface OpenAICompatConfig {
    /** Internal provider name (e.g. 'groq') */
    name: string;
    /** Display name shown to users (e.g. 'Groq (Fast Inference)') */
    displayName: string;
    /** Default API base URL */
    defaultBaseUrl: string;
    /** Environment variable name for the API key */
    envKey: string;
    /** Config key name in titan.json providers section */
    configKey: string;
    /** Default model ID */
    defaultModel: string;
    /** Static model list (returned when health check fails) */
    knownModels: string[];
    /** Extra headers to send with every request */
    extraHeaders?: Record<string, string>;
    /** Whether to fetch models from /v1/models endpoint */
    supportsModelList?: boolean;
}

export class OpenAICompatProvider extends LLMProvider {
    readonly name: string;
    readonly displayName: string;
    private readonly config: OpenAICompatConfig;

    constructor(config: OpenAICompatConfig) {
        super();
        this.name = config.name;
        this.displayName = config.displayName;
        this.config = config;
    }

    private get apiKey(): string {
        const cfg = loadConfig();
        const providerCfg = (cfg.providers as any)[this.config.configKey];
        return providerCfg?.apiKey || process.env[this.config.envKey] || '';
    }

    private get baseUrl(): string {
        const cfg = loadConfig();
        const providerCfg = (cfg.providers as any)[this.config.configKey];
        return providerCfg?.baseUrl || this.config.defaultBaseUrl;
    }

    async chat(options: ChatOptions): Promise<ChatResponse> {
        const model = (options.model || this.config.defaultModel).replace(`${this.name}/`, '');
        const apiKey = this.apiKey;
        if (!apiKey) throw new Error(`${this.displayName} API key not configured (set ${this.config.envKey} or providers.${this.config.configKey}.apiKey)`);

        logger.debug(this.name, `Chat request: model=${model}, messages=${options.messages.length}`);

        const body: Record<string, unknown> = {
            model,
            messages: options.messages.map((m) => {
                if (m.role === 'tool') {
                    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
                }
                if (m.role === 'assistant' && m.toolCalls) {
                    return {
                        role: 'assistant',
                        content: m.content || null,
                        tool_calls: m.toolCalls.map((tc) => ({
                            id: tc.id,
                            type: 'function',
                            function: { name: tc.function.name, arguments: tc.function.arguments },
                        })),
                    };
                }
                return { role: m.role, content: m.content };
            }),
            max_tokens: options.maxTokens || 8192,
        };

        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools;
        }

        if (options.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...(this.config.extraHeaders || {}),
        };

        const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${this.displayName} API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        const choices = data.choices as Array<Record<string, unknown>> | undefined;

        if (!choices || choices.length === 0) {
            return {
                id: (data.id as string) || uuid(),
                content: '',
                usage: undefined,
                finishReason: 'stop',
                model: `${this.name}/${model}`,
            };
        }

        const choice = choices[0];
        const message = choice.message as Record<string, unknown>;

        const toolCalls: ToolCall[] = [];
        if (message.tool_calls) {
            for (const tc of message.tool_calls as Array<Record<string, unknown>>) {
                const fn = tc.function as Record<string, string>;
                toolCalls.push({
                    id: (tc.id as string) || uuid(),
                    type: 'function',
                    function: { name: fn.name, arguments: fn.arguments },
                });
            }
        }

        const usage = data.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

        return {
            id: (data.id as string) || uuid(),
            content: (message.content as string) || '',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: usage
                ? {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens,
                    totalTokens: usage.total_tokens,
                }
                : undefined,
            finishReason: toolCalls.length > 0 ? 'tool_calls' : (choice.finish_reason as 'stop' | 'length') || 'stop',
            model: `${this.name}/${model}`,
        };
    }

    async *chatStream(options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
        try {
            const response = await this.chat(options);
            if (response.content) yield { type: 'text', content: response.content };
            if (response.toolCalls) {
                for (const tc of response.toolCalls) yield { type: 'tool_call', toolCall: tc };
            }
            yield { type: 'done' };
        } catch (error) {
            yield { type: 'error', error: (error as Error).message };
        }
    }

    async listModels(): Promise<string[]> {
        if (!this.config.supportsModelList || !this.apiKey) {
            return this.config.knownModels;
        }
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...(this.config.extraHeaders || {}),
                },
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) return this.config.knownModels;
            const data = await response.json() as { data?: Array<{ id: string }> };
            return (data.data || []).map((m) => m.id);
        } catch {
            return this.config.knownModels;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.apiKey) return false;
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...(this.config.extraHeaders || {}),
                },
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// ── Provider Presets ──────────────────────────────────────────────

export const PROVIDER_PRESETS: OpenAICompatConfig[] = [
    {
        name: 'groq',
        displayName: 'Groq (Fast Inference)',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
        envKey: 'GROQ_API_KEY',
        configKey: 'groq',
        defaultModel: 'llama-3.3-70b-versatile',
        knownModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b'],
        supportsModelList: true,
    },
    {
        name: 'mistral',
        displayName: 'Mistral AI',
        defaultBaseUrl: 'https://api.mistral.ai/v1',
        envKey: 'MISTRAL_API_KEY',
        configKey: 'mistral',
        defaultModel: 'mistral-small-latest',
        knownModels: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest', 'mistral-nemo'],
        supportsModelList: true,
    },
    {
        name: 'openrouter',
        displayName: 'OpenRouter (290+ Models)',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        envKey: 'OPENROUTER_API_KEY',
        configKey: 'openrouter',
        defaultModel: 'anthropic/claude-sonnet-4-20250514',
        knownModels: ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b', 'deepseek/deepseek-r1'],
        supportsModelList: true,
    },
    {
        name: 'fireworks',
        displayName: 'Fireworks AI',
        defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
        envKey: 'FIREWORKS_API_KEY',
        configKey: 'fireworks',
        defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        knownModels: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/mixtral-8x7b-instruct', 'accounts/fireworks/models/qwen3-8b'],
        supportsModelList: true,
    },
    {
        name: 'xai',
        displayName: 'xAI (Grok)',
        defaultBaseUrl: 'https://api.x.ai/v1',
        envKey: 'XAI_API_KEY',
        configKey: 'xai',
        defaultModel: 'grok-3-fast',
        knownModels: ['grok-3', 'grok-3-fast', 'grok-3-mini', 'grok-3-mini-fast'],
        supportsModelList: true,
    },
    {
        name: 'together',
        displayName: 'Together AI',
        defaultBaseUrl: 'https://api.together.xyz/v1',
        envKey: 'TOGETHER_API_KEY',
        configKey: 'together',
        defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        knownModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
        supportsModelList: true,
    },
    {
        name: 'deepseek',
        displayName: 'DeepSeek',
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        envKey: 'DEEPSEEK_API_KEY',
        configKey: 'deepseek',
        defaultModel: 'deepseek-chat',
        knownModels: ['deepseek-chat', 'deepseek-reasoner'],
        supportsModelList: false,
    },
    {
        name: 'cerebras',
        displayName: 'Cerebras (Ultra-Fast)',
        defaultBaseUrl: 'https://api.cerebras.ai/v1',
        envKey: 'CEREBRAS_API_KEY',
        configKey: 'cerebras',
        defaultModel: 'llama-3.3-70b',
        knownModels: ['llama-3.3-70b', 'llama-3.1-8b', 'qwen-3-32b'],
        supportsModelList: true,
    },
    {
        name: 'cohere',
        displayName: 'Cohere',
        defaultBaseUrl: 'https://api.cohere.com/compatibility/v1',
        envKey: 'COHERE_API_KEY',
        configKey: 'cohere',
        defaultModel: 'command-r-plus',
        knownModels: ['command-r-plus', 'command-r', 'command-r7b'],
        supportsModelList: false,
    },
    {
        name: 'perplexity',
        displayName: 'Perplexity (Search-Augmented)',
        defaultBaseUrl: 'https://api.perplexity.ai',
        envKey: 'PERPLEXITY_API_KEY',
        configKey: 'perplexity',
        defaultModel: 'sonar',
        knownModels: ['sonar', 'sonar-pro', 'sonar-reasoning'],
        supportsModelList: false,
    },
];
