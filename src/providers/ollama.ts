/**
 * TITAN — Ollama Provider (Local LLMs)
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

const COMPONENT = 'Ollama';

export class OllamaProvider extends LLMProvider {
    readonly name = 'ollama';
    readonly displayName = 'Ollama (Local)';

    private get baseUrl(): string {
        const config = loadConfig();
        return config.providers.ollama.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }

    async chat(options: ChatOptions): Promise<ChatResponse> {
        const model = (options.model || 'llama3.1').replace('ollama/', '');
        logger.debug(COMPONENT, `Chat request: model=${model}, messages=${options.messages.length}`);

        const body: Record<string, unknown> = {
            model,
            messages: options.messages.map((m) => {
                const msg: Record<string, unknown> = { role: m.role, content: m.content };
                if (m.toolCalls && m.toolCalls.length > 0) {
                    msg.tool_calls = m.toolCalls.map(tc => ({
                        function: {
                            name: tc.function.name,
                            arguments: JSON.parse(tc.function.arguments || '{}')
                        }
                    }));
                }
                if (m.toolCallId) msg.tool_call_id = m.toolCallId;
                if (m.name) msg.name = m.name;
                return msg;
            }),
            stream: false,
            options: {
                num_predict: options.maxTokens || 8192,
                temperature: options.temperature ?? 0.7,
            },
        };

        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }));
        }

        const response = await fetchWithRetry(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        const message = data.message as Record<string, unknown>;
        const toolCalls: ToolCall[] = [];

        if (message.tool_calls) {
            for (const tc of message.tool_calls as Array<Record<string, unknown>>) {
                const fn = tc.function as Record<string, unknown>;
                toolCalls.push({
                    id: uuid(),
                    type: 'function',
                    function: {
                        name: fn.name as string,
                        arguments: JSON.stringify(fn.arguments),
                    },
                });
            }
        }

        return {
            id: uuid(),
            content: (message.content as string) || '',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                promptTokens: (data.prompt_eval_count as number) || 0,
                completionTokens: (data.eval_count as number) || 0,
                totalTokens: ((data.prompt_eval_count as number) || 0) + ((data.eval_count as number) || 0),
            },
            finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
            model: `ollama/${model}`,
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
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];
            const data = await response.json() as { models?: Array<{ name: string }> };
            return (data.models || []).map((m) => m.name);
        } catch {
            return [];
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }
}
