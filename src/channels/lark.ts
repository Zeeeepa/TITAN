/**
 * TITAN — Lark/Feishu Channel Adapter
 * Uses Lark Open Platform Event Subscription (webhook) + REST API.
 * No additional npm dependencies — uses native fetch.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Lark';

export class LarkChannel extends ChannelAdapter {
    readonly name = 'lark';
    readonly displayName = 'Lark/Feishu';
    private connected = false;
    private appId = '';
    private appSecret = '';
    private accessToken = '';
    private tokenExpiry = 0;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.lark;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'Lark channel is disabled');
            return;
        }

        // token = App ID, apiKey = App Secret
        const appId = channelConfig.token;
        const appSecret = channelConfig.apiKey;
        if (!appId || !appSecret) {
            logger.warn(COMPONENT, 'Lark App ID or App Secret not configured (token + apiKey)');
            return;
        }

        this.appId = appId;
        this.appSecret = appSecret;

        try {
            await this.refreshToken();
            this.connected = true;
            logger.info(COMPONENT, 'Lark channel connected (webhook events handled via gateway)');
            logger.info(COMPONENT, 'Configure Lark Event Subscription URL to: POST /api/channels/lark/webhook');
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
        }
    }

    /** Obtain or refresh the tenant access token */
    private async refreshToken(): Promise<void> {
        const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
        });
        if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
        const data = (await res.json()) as { tenant_access_token: string; expire: number };
        this.accessToken = data.tenant_access_token;
        this.tokenExpiry = Date.now() + (data.expire - 60) * 1000; // Refresh 60s early
        logger.debug(COMPONENT, 'Access token refreshed');
    }

    private async ensureToken(): Promise<void> {
        if (Date.now() >= this.tokenExpiry) {
            await this.refreshToken();
        }
    }

    /**
     * Handle an inbound webhook event from Lark.
     * Call this from a gateway route handler for POST /api/channels/lark/webhook.
     */
    handleWebhookEvent(body: Record<string, unknown>): { challenge?: string } | undefined {
        // URL verification challenge
        if (body.type === 'url_verification') {
            return { challenge: body.challenge as string };
        }

        // Event callback
        if (body.header && body.event) {
            const header = body.header as { event_type: string };
            const event = body.event as {
                sender?: { sender_id?: { open_id?: string; user_id?: string }; sender_type?: string };
                message?: {
                    message_id: string; chat_id: string; message_type: string;
                    content: string; create_time: string;
                };
            };

            if (header.event_type === 'im.message.receive_v1' && event.message) {
                try {
                    const content = event.message.message_type === 'text'
                        ? (JSON.parse(event.message.content) as { text: string }).text
                        : `[${event.message.message_type}]`;

                    const inbound: InboundMessage = {
                        id: event.message.message_id,
                        channel: 'lark',
                        userId: event.sender?.sender_id?.open_id || 'unknown',
                        content,
                        groupId: event.message.chat_id,
                        timestamp: new Date(parseInt(event.message.create_time, 10)),
                        raw: body,
                    };
                    this.emit('message', inbound);
                } catch (error) {
                    logger.error(COMPONENT, `Webhook parse error: ${(error as Error).message}`);
                }
            }
        }
        return undefined;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.accessToken = '';
        logger.info(COMPONENT, 'Disconnected');
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected) return;
        const chatId = message.groupId || message.userId;
        if (!chatId) {
            logger.warn(COMPONENT, 'No chat ID provided for Lark message');
            return;
        }
        try {
            await this.ensureToken();
            const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    receive_id: chatId,
                    msg_type: 'text',
                    content: JSON.stringify({ text: message.content }),
                }),
            });
            if (!res.ok) throw new Error(`Send failed: ${res.status}`);
            logger.debug(COMPONENT, `Sent message to ${chatId}`);
        } catch (error) {
            logger.error(COMPONENT, `Send failed: ${(error as Error).message}`);
        }
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected };
    }
}
