/**
 * TITAN — Zulip Channel Adapter
 * Uses Zulip REST API with long-polling for real-time events.
 * No additional npm dependencies — uses native fetch.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Zulip';

export class ZulipChannel extends ChannelAdapter {
    readonly name = 'zulip';
    readonly displayName = 'Zulip';
    private connected = false;
    private baseUrl = '';
    private authHeader = '';
    private queueId = '';
    private lastEventId = -1;
    private polling = false;
    private botUserId = -1;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.zulip;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'Zulip channel is disabled');
            return;
        }

        // token = bot email, apiKey = API key
        // allowFrom[0] = server URL (e.g. https://yourorg.zulipchat.com)
        const botEmail = channelConfig.token;
        const apiKey = channelConfig.apiKey;
        const serverUrl = channelConfig.allowFrom[0];

        if (!botEmail || !apiKey || !serverUrl) {
            logger.warn(COMPONENT, 'Zulip not configured (token=bot_email, apiKey=api_key, allowFrom[0]=server_url)');
            return;
        }

        this.baseUrl = serverUrl.replace(/\/+$/, '');
        this.authHeader = 'Basic ' + Buffer.from(`${botEmail}:${apiKey}`).toString('base64');

        try {
            // Get bot user info
            const meRes = await this.apiGet('/api/v1/users/me');
            this.botUserId = (meRes as { user_id: number }).user_id;

            // Register an event queue for message events
            const regRes = await this.apiPost('/api/v1/register', {
                event_types: JSON.stringify(['message']),
            });
            const reg = regRes as { queue_id: string; last_event_id: number };
            this.queueId = reg.queue_id;
            this.lastEventId = reg.last_event_id;

            this.connected = true;
            this.polling = true;
            logger.info(COMPONENT, `Connected to Zulip at ${this.baseUrl}`);

            // Start long-polling in the background
            this.pollEvents().catch((e) =>
                logger.error(COMPONENT, `Polling failed: ${(e as Error).message}`)
            );
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
        }
    }

    private async apiGet(path: string): Promise<unknown> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            headers: { Authorization: this.authHeader },
        });
        if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
        return res.json();
    }

    private async apiPost(path: string, params: Record<string, string>): Promise<unknown> {
        const body = new URLSearchParams(params);
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                Authorization: this.authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });
        if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
        return res.json();
    }

    private async pollEvents(): Promise<void> {
        while (this.polling) {
            try {
                const res = await this.apiGet(
                    `/api/v1/events?queue_id=${encodeURIComponent(this.queueId)}&last_event_id=${this.lastEventId}`
                );
                const data = res as {
                    events: Array<{
                        id: number;
                        type: string;
                        message?: {
                            id: number; sender_id: number; sender_full_name: string;
                            content: string; stream_id?: number; subject?: string;
                            display_recipient: string | Array<{ id: number; email: string }>;
                            timestamp: number;
                            type: string;
                        };
                    }>;
                };

                for (const event of data.events) {
                    this.lastEventId = event.id;
                    if (event.type === 'message' && event.message) {
                        const msg = event.message;
                        if (msg.sender_id === this.botUserId) continue;

                        const groupId = msg.type === 'stream'
                            ? `${msg.display_recipient as string}/${msg.subject || ''}`
                            : undefined;

                        const inbound: InboundMessage = {
                            id: String(msg.id),
                            channel: 'zulip',
                            userId: String(msg.sender_id),
                            userName: msg.sender_full_name,
                            content: msg.content,
                            groupId,
                            timestamp: new Date(msg.timestamp * 1000),
                            raw: msg,
                        };
                        this.emit('message', inbound);
                    }
                }
            } catch (error) {
                if (this.polling) {
                    logger.error(COMPONENT, `Poll error: ${(error as Error).message}`);
                    // Wait before retrying
                    await new Promise((r) => setTimeout(r, 5000));
                }
            }
        }
    }

    async disconnect(): Promise<void> {
        this.polling = false;
        if (this.queueId) {
            try {
                await this.apiPost(`/api/v1/events`, { queue_id: this.queueId });
            } catch { /* ignore cleanup errors */ }
        }
        this.connected = false;
        this.queueId = '';
        logger.info(COMPONENT, 'Disconnected');
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected) return;
        try {
            if (message.groupId) {
                // Stream message: groupId format is "stream_name/topic"
                const [stream, topic] = message.groupId.split('/');
                await this.apiPost('/api/v1/messages', {
                    type: 'stream',
                    to: stream,
                    topic: topic || 'TITAN',
                    content: message.content,
                });
            } else if (message.userId) {
                // Direct message
                await this.apiPost('/api/v1/messages', {
                    type: 'direct',
                    to: JSON.stringify([message.userId]),
                    content: message.content,
                });
            } else {
                logger.warn(COMPONENT, 'No target provided for Zulip message');
                return;
            }
            logger.debug(COMPONENT, `Sent message`);
        } catch (error) {
            logger.error(COMPONENT, `Send failed: ${(error as Error).message}`);
        }
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected };
    }
}
