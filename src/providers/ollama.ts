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
                num_predict: options.maxTokens || 16384,
                num_ctx: 65536,
                temperature: options.temperature ?? 0.7,
            },
        };

        // Explicit thinking mode for Ollama models
        if (options.thinking === false) {
            body.think = false;
        } else if (options.thinking === true) {
            body.think = true;
        }

        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }));
            // Lower temperature for better tool-calling compliance
            (body.options as Record<string, unknown>).temperature = options.temperature ?? 0.3;
        }

        let response = await fetchWithRetry(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Fallback: if model doesn't support native tool calling, retry without tools
            if (response.status === 400 && errorText.includes('does not support tools') && body.tools) {
                logger.warn(COMPONENT, `Model ${model} does not support native tool calling — running in chat-only mode`);
                delete body.tools;
                response = await fetchWithRetry(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!response.ok) {
                    const retryText = await response.text();
                    throw new Error(`Ollama error (${response.status}): ${retryText}`);
                }
            } else {
                throw new Error(`Ollama error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json() as Record<string, unknown>;
        const message = data.message as Record<string, unknown>;
        logger.debug(COMPONENT, `Raw response: tool_calls=${JSON.stringify(message.tool_calls)}, content_length=${((message.content as string) || '').length}`);
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

        // Strip leaked thinking tags from Qwen/DeepSeek models
        let content = (message.content as string) || '';
        content = content.replace(/^[\s\S]*?<\/think>\s*/m, '').trim();

        return {
            id: uuid(),
            content,
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
        const model = (options.model || 'llama3.1').replace('ollama/', '');

        const body: Record<string, unknown> = {
            model,
            messages: options.messages.map((m) => {
                const msg: Record<string, unknown> = { role: m.role, content: m.content };
                if (m.toolCalls && m.toolCalls.length > 0) {
                    msg.tool_calls = m.toolCalls.map(tc => ({ function: { name: tc.function.name, arguments: JSON.parse(tc.function.arguments || '{}') } }));
                }
                if (m.toolCallId) msg.tool_call_id = m.toolCallId;
                if (m.name) msg.name = m.name;
                return msg;
            }),
            stream: true,
            options: { num_predict: options.maxTokens || 16384, num_ctx: 65536, temperature: options.temperature ?? 0.7 },
        };

        // Explicit thinking mode for Ollama models
        if (options.thinking === false) {
            body.think = false;
        } else if (options.thinking === true) {
            body.think = true;
        }

        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools.map((t) => ({ type: 'function', function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters } }));
            // Lower temperature for better tool-calling compliance
            (body.options as Record<string, unknown>).temperature = options.temperature ?? 0.3;
        }

        try {
            let response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok || !response.body) {
                const errorText = await response.text();
                // Fallback: if model doesn't support native tool calling, retry without tools
                if (response.status === 400 && errorText.includes('does not support tools') && body.tools) {
                    logger.warn(COMPONENT, `Model ${model} does not support native tool calling — running in chat-only mode`);
                    delete body.tools;
                    response = await fetch(`${this.baseUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    if (!response.ok || !response.body) {
                        const retryText = await response.text();
                        yield { type: 'error', error: `Ollama error (${response.status}): ${retryText}` };
                        return;
                    }
                } else {
                    yield { type: 'error', error: `Ollama error (${response.status}): ${errorText}` };
                    return;
                }
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let insideThink = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.message?.content) {
                            let text = chunk.message.content;
                            // Strip leaked <think>...</think> blocks from Qwen/DeepSeek
                            if (text.includes('<think>')) insideThink = true;
                            if (insideThink) {
                                if (text.includes('</think>')) {
                                    text = text.split('</think>').pop()?.trim() || '';
                                    insideThink = false;
                                } else {
                                    continue; // suppress thinking content
                                }
                            }
                            if (text) yield { type: 'text', content: text };
                        }
                        if (chunk.message?.tool_calls) {
                            for (const tc of chunk.message.tool_calls) {
                                const fn = tc.function as Record<string, unknown>;
                                yield {
                                    type: 'tool_call',
                                    toolCall: { id: uuid(), type: 'function', function: { name: fn.name as string, arguments: JSON.stringify(fn.arguments) } },
                                };
                            }
                        }
                        if (chunk.done) break;
                    } catch { /* skip malformed NDJSON lines */ }
                }
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
