/**
 * TITAN — LINE Messaging Channel Adapter
 * Uses LINE Messaging API via webhook + REST.
 * No additional npm dependencies — uses native fetch.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'LINE';
const LINE_API_BASE = 'https://api.line.me/v2/bot';

export class LineChannel extends ChannelAdapter {
    readonly name = 'line';
    readonly displayName = 'LINE';
    private connected = false;
    private channelAccessToken = '';

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.line;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'LINE channel is disabled');
            return;
        }

        // token = Channel Access Token, apiKey = Channel Secret (for webhook signature verification)
        const token = channelConfig.token;
        if (!token) {
            logger.warn(COMPONENT, 'LINE Channel Access Token not configured');
            return;
        }

        this.channelAccessToken = token;

        try {
            // Verify token by fetching bot info
            const res = await fetch(`${LINE_API_BASE}/info`, {
                headers: { Authorization: `Bearer ${this.channelAccessToken}` },
            });
            if (!res.ok) throw new Error(`LINE API auth failed: ${res.status}`);
            const botInfo = (await res.json()) as { displayName?: string; userId?: string };
            this.connected = true;
            logger.info(COMPONENT, `Connected as LINE bot: ${botInfo.displayName || 'unknown'}`);
            logger.info(COMPONENT, 'Configure LINE webhook URL to: POST /api/channels/line/webhook');
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
        }
    }

    /**
     * Handle an inbound webhook event from LINE.
     * Call this from a gateway route handler for POST /api/channels/line/webhook.
     */
    handleWebhookEvent(body: Record<string, unknown>): void {
        const events = body.events as Array<{
            type: string;
            message?: { id: string; type: string; text?: string };
            source?: { type: string; userId?: string; groupId?: string; roomId?: string };
            replyToken?: string;
            timestamp?: number;
        }> | undefined;

        if (!events) return;

        for (const event of events) {
            if (event.type === 'message' && event.message?.type === 'text' && event.message.text) {
                try {
                    const inbound: InboundMessage = {
                        id: event.message.id,
                        channel: 'line',
                        userId: event.source?.userId || 'unknown',
                        content: event.message.text,
                        groupId: event.source?.groupId || event.source?.roomId,
                        timestamp: new Date(event.timestamp || Date.now()),
                        replyTo: event.replyToken,
                        raw: event,
                    };
                    this.emit('message', inbound);
                } catch (error) {
                    logger.error(COMPONENT, `Webhook parse error: ${(error as Error).message}`);
                }
            }
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.channelAccessToken = '';
        logger.info(COMPONENT, 'Disconnected');
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected) return;
        const userId = message.userId;
        if (!userId) {
            logger.warn(COMPONENT, 'No userId provided for LINE push message');
            return;
        }
        try {
            // If we have a replyToken, use reply API; otherwise use push API
            if (message.replyTo) {
                const res = await fetch(`${LINE_API_BASE}/message/reply`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.channelAccessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        replyToken: message.replyTo,
                        messages: [{ type: 'text', text: message.content }],
                    }),
                });
                if (!res.ok) throw new Error(`Reply failed: ${res.status}`);
            } else {
                const res = await fetch(`${LINE_API_BASE}/message/push`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.channelAccessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        to: userId,
                        messages: [{ type: 'text', text: message.content }],
                    }),
                });
                if (!res.ok) throw new Error(`Push failed: ${res.status}`);
            }
            logger.debug(COMPONENT, `Sent message to ${userId}`);
        } catch (error) {
            logger.error(COMPONENT, `Send failed: ${(error as Error).message}`);
        }
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected };
    }
}
