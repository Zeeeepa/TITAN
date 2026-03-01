/**
 * TITAN — Google Gemini Provider
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

const COMPONENT = 'Google';

export class GoogleProvider extends LLMProvider {
    readonly name = 'google';
    readonly displayName = 'Google (Gemini)';

    private get apiKey(): string {
        const config = loadConfig();
        return config.providers.google.apiKey || process.env.GOOGLE_API_KEY || '';
    }

    async chat(options: ChatOptions): Promise<ChatResponse> {
        const model = (options.model || 'gemini-2.0-flash').replace('google/', '');
        const apiKey = this.apiKey;
        if (!apiKey) throw new Error('Google API key not configured');

        logger.debug(COMPONENT, `Chat request: model=${model}, messages=${options.messages.length}`);

        const systemInstruction = options.messages.find((m) => m.role === 'system')?.content;
        const contents = options.messages
            .filter((m) => m.role !== 'system')
            .map((m) => {
                if (m.role === 'tool') {
                    return {
                        role: 'function' as const,
                        parts: [{ functionResponse: { name: m.name || 'tool', response: { result: m.content } } }],
                    };
                }
                return {
                    role: (m.role === 'assistant' ? 'model' : 'user') as string,
                    parts: [{ text: m.content }],
                };
            });

        const body: Record<string, unknown> = {
            contents,
            generationConfig: {
                maxOutputTokens: options.maxTokens || 8192,
                temperature: options.temperature ?? 0.7,
            },
        };

        if (systemInstruction) {
            body.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        if (options.tools && options.tools.length > 0) {
            body.tools = [{
                functionDeclarations: options.tools.map((t) => ({
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                })),
            }];
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        const candidates = data.candidates as Array<Record<string, unknown>>;

        let textContent = '';
        const toolCalls: ToolCall[] = [];

        if (candidates && candidates.length > 0) {
            const parts = (candidates[0].content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> || [];
            for (const part of parts) {
                if (part.text) {
                    textContent += part.text as string;
                }
                if (part.functionCall) {
                    const fc = part.functionCall as Record<string, unknown>;
                    toolCalls.push({
                        id: uuid(),
                        type: 'function',
                        function: {
                            name: fc.name as string,
                            arguments: JSON.stringify(fc.args),
                        },
                    });
                }
            }
        }

        const usageMeta = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;

        return {
            id: uuid(),
            content: textContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: usageMeta
                ? {
                    promptTokens: usageMeta.promptTokenCount || 0,
                    completionTokens: usageMeta.candidatesTokenCount || 0,
                    totalTokens: usageMeta.totalTokenCount || 0,
                }
                : undefined,
            finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
            model: `google/${model}`,
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
        return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.apiKey) return false;
            const url = `https://generativelanguage.googleapis.com/v1beta/models`;
            const response = await fetch(url, {
                headers: { 'x-goog-api-key': this.apiKey },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
