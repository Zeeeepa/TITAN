/**
 * TITAN — OpenAI Provider (GPT-4, o-series)
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
import { v4 as uuid } from 'uuid';

const COMPONENT = 'OpenAI';

export class OpenAIProvider extends LLMProvider {
    readonly name = 'openai';
    readonly displayName = 'OpenAI (GPT)';

    private get apiKey(): string {
        const config = loadConfig();
        return config.providers.openai.apiKey || process.env.OPENAI_API_KEY || '';
    }

    private get baseUrl(): string {
        const config = loadConfig();
        return config.providers.openai.baseUrl || 'https://api.openai.com';
    }

    async chat(options: ChatOptions): Promise<ChatResponse> {
        const model = options.model || 'gpt-4o';
        const apiKey = this.apiKey;
        if (!apiKey) throw new Error('OpenAI API key not configured');

        logger.debug(COMPONENT, `Chat request: model=${model}, messages=${options.messages.length}`);

        const body: Record<string, unknown> = {
            model: model.replace('openai/', ''),
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

        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        const choices = data.choices as Array<Record<string, unknown>>;
        const choice = choices[0];
        const message = choice.message as Record<string, unknown>;

        const toolCalls: ToolCall[] = [];
        if (message.tool_calls) {
            for (const tc of message.tool_calls as Array<Record<string, unknown>>) {
                const fn = tc.function as Record<string, string>;
                toolCalls.push({
                    id: tc.id as string,
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
            model,
        };
    }

    async *chatStream(options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
        try {
            const response = await this.chat(options);
            if (response.content) {
                yield { type: 'text', content: response.content };
            }
            if (response.toolCalls) {
                for (const tc of response.toolCalls) {
                    yield { type: 'tool_call', toolCall: tc };
                }
            }
            yield { type: 'done' };
        } catch (error) {
            yield { type: 'error', error: (error as Error).message };
        }
    }

    async listModels(): Promise<string[]> {
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'];
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.apiKey) return false;
            const response = await fetch(`${this.baseUrl}/v1/models`, {
                headers: { Authorization: `Bearer ${this.apiKey}` },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
