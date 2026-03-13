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

/** Max system prompt length for cloud models with tool calling.
 *  Cloud models routed via Ollama have limited context for tool-calling;
 *  massive system prompts cause them to generate text instead of tool_calls.
 */
const CLOUD_MAX_SYSTEM_PROMPT = 2000;

/** Compress a system prompt for cloud models with tool calling.
 *  Keeps core identity + behavior, strips verbose sections.
 */
function compressSystemPrompt(content: string): string {
    if (content.length <= CLOUD_MAX_SYSTEM_PROMPT) return content;

    // Extract just the critical sections
    const sections: string[] = [];

    // Keep identity section (## CRITICAL: Your Identity)
    const identityMatch = content.match(/## CRITICAL: Your Identity[\s\S]*?(?=\n## )/);
    if (identityMatch) sections.push(identityMatch[0].trim());

    // Keep core capabilities (abbreviated)
    sections.push('## Core Capabilities\nYou have tools for: shell commands, file operations, web search/fetch, memory, weather, and more. ALWAYS use your tools — never describe what could be done.');

    // Keep behavior guidelines (abbreviated)
    sections.push('## Behavior\n- Lead with the answer, be concise\n- Use tools to complete tasks, do not just describe\n- If web_search results lack detail, follow up with web_fetch\n- Remember important user info for future conversations');

    const compressed = sections.join('\n\n');
    logger.info(COMPONENT, `Compressed system prompt for cloud model: ${content.length} → ${compressed.length} chars`);
    return compressed;
}

/** Simplify tool parameter schemas for cloud models.
 *  Strips Zod artifacts ($schema, additionalProperties, etc.) that can
 *  confuse cloud model tool-calling.
 */
function simplifySchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!schema) return { type: 'object', properties: {} };
    const clean: Record<string, unknown> = { type: schema.type || 'object' };
    if (schema.properties) {
        const props: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
            // Flatten each property to just type + description
            const prop: Record<string, unknown> = { type: val.type || 'string' };
            if (val.description) prop.description = val.description;
            if (val.enum) prop.enum = val.enum;
            if (val.default !== undefined) prop.default = val.default;
            props[key] = prop;
        }
        clean.properties = props;
    }
    if (schema.required) clean.required = schema.required;
    return clean;
}

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

        // Cloud models (Ollama Pro): detect via -cloud suffix or :cloud tag
        const isCloudModel = model.includes('-cloud') || model.includes(':cloud');
        const hasTools = options.tools && options.tools.length > 0;

        const body: Record<string, unknown> = {
            model,
            messages: options.messages.map((m) => {
                const msg: Record<string, unknown> = { role: m.role };
                // Compress system prompts for cloud models with tools to improve tool-calling compliance
                if (m.role === 'system' && isCloudModel && hasTools) {
                    msg.content = compressSystemPrompt(m.content);
                } else {
                    msg.content = m.content;
                }
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
                ...(isCloudModel ? {} : { num_ctx: 65536 }),
                temperature: options.temperature ?? 0.7,
            },
        };

        // Explicit thinking mode for Ollama models
        // For cloud models with tools, explicitly disable thinking to prevent interference
        if (options.thinking === false || (isCloudModel && options.tools && options.tools.length > 0)) {
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
                    parameters: isCloudModel ? simplifySchema(t.function.parameters) : t.function.parameters,
                },
            }));
            // Lower temperature for better tool-calling compliance
            (body.options as Record<string, unknown>).temperature = options.temperature ?? 0.3;
        }

        // Cloud models: trim conversation history to keep context manageable
        // Keep system message + last N user/assistant exchanges
        if (isCloudModel && hasTools) {
            const msgs = body.messages as Array<Record<string, unknown>>;
            if (msgs.length > 10) {
                const systemMsgs = msgs.filter(m => m.role === 'system');
                const nonSystemMsgs = msgs.filter(m => m.role !== 'system');
                // Keep last 8 non-system messages (4 exchanges)
                const trimmed = [...systemMsgs, ...nonSystemMsgs.slice(-8)];
                logger.info(COMPONENT, `Cloud model context trim: ${msgs.length} → ${trimmed.length} messages`);
                body.messages = trimmed;
            }
        }

        // Nemotron and some OSS models ignore standalone system messages for tool calling.
        // Merge system content into the first user message (CrewAI fix pattern).
        if (isCloudModel && hasTools) {
            const msgs = body.messages as Array<Record<string, unknown>>;
            const sysIdx = msgs.findIndex(m => m.role === 'system');
            const firstUserIdx = msgs.findIndex(m => m.role === 'user');
            if (sysIdx >= 0 && firstUserIdx >= 0 && msgs[sysIdx].content) {
                const sysContent = msgs[sysIdx].content as string;
                msgs[firstUserIdx].content = `[System Instructions]\n${sysContent}\n\n[User Message]\n${msgs[firstUserIdx].content}`;
                msgs.splice(sysIdx, 1); // Remove the standalone system message
                logger.info(COMPONENT, `Merged system prompt into first user message for cloud model compatibility`);
            }
        }

        const sentMessages = body.messages as Array<{role: string; content: string}>;
        const toolNames = body.tools ? (body.tools as Array<{function: {name: string}}>).map(t => t.function.name) : [];
        logger.info(COMPONENT, `Chat request: model=${model}, cloud=${isCloudModel}, tools=[${toolNames.join(',')}], think=${body.think}, messages=${sentMessages.length}`);
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
        logger.info(COMPONENT, `Response from ${model}: tool_calls=${JSON.stringify(message.tool_calls)}, content_length=${((message.content as string) || '').length}`);
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

        // Cloud models (Ollama Pro): detect via -cloud suffix or :cloud tag
        const isCloudModel = model.includes('-cloud') || model.includes(':cloud');
        const hasTools = options.tools && options.tools.length > 0;

        const body: Record<string, unknown> = {
            model,
            messages: options.messages.map((m) => {
                const msg: Record<string, unknown> = { role: m.role };
                // Compress system prompts for cloud models with tools
                if (m.role === 'system' && isCloudModel && hasTools) {
                    msg.content = compressSystemPrompt(m.content);
                } else {
                    msg.content = m.content;
                }
                if (m.toolCalls && m.toolCalls.length > 0) {
                    msg.tool_calls = m.toolCalls.map(tc => ({ function: { name: tc.function.name, arguments: JSON.parse(tc.function.arguments || '{}') } }));
                }
                if (m.toolCallId) msg.tool_call_id = m.toolCallId;
                if (m.name) msg.name = m.name;
                return msg;
            }),
            stream: true,
            options: { num_predict: options.maxTokens || 16384, ...(isCloudModel ? {} : { num_ctx: 65536 }), temperature: options.temperature ?? 0.7 },
        };

        // Explicit thinking mode — disable for cloud models with tools
        if (options.thinking === false || (isCloudModel && hasTools)) {
            body.think = false;
        } else if (options.thinking === true) {
            body.think = true;
        }

        if (hasTools) {
            body.tools = options.tools!.map((t) => ({
                type: 'function',
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: isCloudModel ? simplifySchema(t.function.parameters) : t.function.parameters,
                },
            }));
            // Lower temperature for better tool-calling compliance
            (body.options as Record<string, unknown>).temperature = options.temperature ?? 0.3;
        }

        // Cloud model optimizations: trim history + merge system into user message
        if (isCloudModel && hasTools) {
            const msgs = body.messages as Array<Record<string, unknown>>;
            // Trim to last 8 non-system messages
            if (msgs.length > 10) {
                const systemMsgs = msgs.filter(m => m.role === 'system');
                const nonSystemMsgs = msgs.filter(m => m.role !== 'system');
                const trimmed = [...systemMsgs, ...nonSystemMsgs.slice(-8)];
                logger.info(COMPONENT, `[Stream] Cloud model context trim: ${msgs.length} → ${trimmed.length} messages`);
                body.messages = trimmed;
            }
            // Merge system into first user message
            const msgs2 = body.messages as Array<Record<string, unknown>>;
            const sysIdx = msgs2.findIndex(m => m.role === 'system');
            const firstUserIdx = msgs2.findIndex(m => m.role === 'user');
            if (sysIdx >= 0 && firstUserIdx >= 0 && msgs2[sysIdx].content) {
                const sysContent = msgs2[sysIdx].content as string;
                msgs2[firstUserIdx].content = `[System Instructions]\n${sysContent}\n\n[User Message]\n${msgs2[firstUserIdx].content}`;
                msgs2.splice(sysIdx, 1);
            }
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
