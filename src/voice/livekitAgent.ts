/**
 * TITAN — LiveKit Voice Agent Bridge
 *
 * Bridges LiveKit's WebRTC voice rooms to TITAN's agent brain.
 * When a user connects to a LiveKit room, this worker receives transcribed
 * text (via LiveKit's STT pipeline), routes it through TITAN's processMessage(),
 * and sends the response back through LiveKit's TTS pipeline.
 *
 * Voice interface powered by LiveKit (https://livekit.io/)
 * MIT License, Copyright (c) 2025 LiveKit, Inc.
 *
 * Requires: @livekit/agents and provider plugins (optional dependency)
 */
import { loadConfig } from '../config/config.js';
import { processMessage } from '../agent/agent.js';
import logger from '../utils/logger.js';

const COMPONENT = 'LiveKitVoice';

export interface LiveKitAgentOptions {
    /** LiveKit server URL (wss://...) */
    url: string;
    /** LiveKit API key */
    apiKey: string;
    /** LiveKit API secret */
    apiSecret: string;
    /** Agent name for job dispatch */
    agentName?: string;
}

/**
 * Resolve LiveKit config from TITAN config + environment variables.
 * Returns null if LiveKit is not configured.
 */
export function getLiveKitConfig(): LiveKitAgentOptions | null {
    const config = loadConfig();
    if (!config.voice.enabled) return null;

    const url = config.voice.livekit.url || process.env.LIVEKIT_URL || '';
    const apiKey = config.voice.livekit.apiKey || process.env.LIVEKIT_API_KEY || '';
    const apiSecret = config.voice.livekit.apiSecret || process.env.LIVEKIT_API_SECRET || '';

    if (!url || !apiKey || !apiSecret) {
        logger.warn(COMPONENT, 'Voice enabled but LiveKit credentials incomplete (url, apiKey, apiSecret)');
        return null;
    }

    return {
        url,
        apiKey,
        apiSecret,
        agentName: config.voice.livekit.agentName || 'titan-voice',
    };
}

/**
 * Start the LiveKit voice agent worker.
 * This connects to the LiveKit server and handles voice pipeline jobs.
 *
 * Requires @livekit/agents to be installed (optional dependency).
 * Falls back gracefully if not available.
 */
export async function startLiveKitAgent(): Promise<void> {
    const opts = getLiveKitConfig();
    if (!opts) {
        logger.info(COMPONENT, 'LiveKit voice not configured — skipping agent worker');
        return;
    }

    try {
        // Dynamic import — @livekit/agents is an optional dependency
        const agentsMod = '@livekit/agents';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { WorkerOptions, defineAgent, cli } = await import(agentsMod) as any;

        defineAgent({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entry: async (ctx: any) => {
                logger.info(COMPONENT, `Voice session started: room=${ctx.room.name}`);

                // Listen for transcribed user speech
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ctx.on('userTranscription', async (transcription: any) => {
                    const text = transcription.text?.trim();
                    if (!text) return;

                    logger.debug(COMPONENT, `User said: "${text}"`);

                    try {
                        const response = await processMessage(text, 'voice', ctx.room.name);
                        if (response.content) {
                            // Send response text back — LiveKit's TTS will speak it
                            await ctx.say(response.content);
                        }
                    } catch (err) {
                        logger.error(COMPONENT, `Voice response error: ${(err as Error).message}`);
                        await ctx.say('Sorry, I encountered an error processing your request.');
                    }
                });

                ctx.on('disconnected', () => {
                    logger.info(COMPONENT, `Voice session ended: room=${ctx.room.name}`);
                });
            },
        });

        const workerOpts = new WorkerOptions({
            apiKey: opts.apiKey,
            apiSecret: opts.apiSecret,
            wsUrl: opts.url,
            agentName: opts.agentName,
        });

        logger.info(COMPONENT, `LiveKit voice agent starting (server: ${opts.url})`);
        await cli.runApp(workerOpts);
    } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
            logger.warn(COMPONENT, 'LiveKit Agents SDK not installed. Install with: npm install @livekit/agents @livekit/agents-plugin-openai');
        } else {
            logger.error(COMPONENT, `LiveKit agent failed: ${msg}`);
        }
    }
}
