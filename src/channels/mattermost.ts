/**
 * TITAN — Mattermost Channel Adapter
 * Uses Mattermost REST API + WebSocket for real-time messaging.
 * No additional npm dependencies required — uses native fetch + WebSocket.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Mattermost';

export class MattermostChannel extends ChannelAdapter {
    readonly name = 'mattermost';
    readonly displayName = 'Mattermost';
    private connected = false;
    private ws: { on(e: string, cb: (...args: unknown[]) => void): void; send(data: string): void; close(): void } | null = null;
    private baseUrl = '';
    private botToken = '';
    private botUserId = '';

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.mattermost;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'Mattermost channel is disabled');
            return;
        }

        // token = Personal Access Token or Bot token
        // apiKey = Mattermost server URL (e.g. https://mattermost.example.com)
        const token = channelConfig.token;
        const serverUrl = channelConfig.apiKey;
        if (!token || !serverUrl) {
            logger.warn(COMPONENT, 'Mattermost token or server URL not configured (token + apiKey)');
            return;
        }

        this.botToken = token;
        this.baseUrl = serverUrl.replace(/\/+$/, '');

        try {
            // Verify token and get bot user info
            const meRes = await fetch(`${this.baseUrl}/api/v4/users/me`, {
                headers: { Authorization: `Bearer ${this.botToken}` },
            });
            if (!meRes.ok) throw new Error(`Auth failed: ${meRes.status}`);
            const me = (await meRes.json()) as { id: string };
            this.botUserId = me.id;

            // Open WebSocket for real-time events
            const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/api/v4/websocket';
            const { WebSocket: WS } = await import('ws');
            this.ws = new WS(wsUrl);

            this.ws.on('open', () => {
                // Authenticate the WebSocket connection
                this.ws?.send(JSON.stringify({
                    seq: 1,
                    action: 'authentication_challenge',
                    data: { token: this.botToken },
                }));
                this.connected = true;
                logger.info(COMPONENT, `Connected to Mattermost at ${this.baseUrl}`);
            });

            this.ws.on('message', (data: unknown) => {
                try {
                    const event = JSON.parse(String(data)) as {
                        event?: string;
                        data?: { post?: string };
                    };
                    if (event.event === 'posted' && event.data?.post) {
                        const post = JSON.parse(event.data.post) as {
                            id: string; user_id: string; channel_id: string;
                            message: string; create_at: number;
                            props?: { username?: string };
                        };
                        // Ignore own messages
                        if (post.user_id === this.botUserId) return;

                        const inbound: InboundMessage = {
                            id: post.id,
                            channel: 'mattermost',
                            userId: post.user_id,
                            userName: post.props?.username,
                            content: post.message,
                            groupId: post.channel_id,
                            timestamp: new Date(post.create_at),
                            raw: post,
                        };
                        this.emit('message', inbound);
                    }
                } catch (error) {
                    logger.error(COMPONENT, `WS message parse error: ${(error as Error).message}`);
                }
            });

            this.ws.on('close', () => {
                this.connected = false;
                logger.info(COMPONENT, 'WebSocket closed');
            });

            this.ws.on('error', (...args: unknown[]) => {
                logger.error(COMPONENT, `WebSocket error: ${(args[0] as Error).message}`);
            });
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
            logger.info(COMPONENT, 'Disconnected');
        }
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected) return;
        const channelId = message.groupId || message.userId;
        if (!channelId) {
            logger.warn(COMPONENT, 'No channel ID provided for Mattermost message');
            return;
        }
        try {
            const res = await fetch(`${this.baseUrl}/api/v4/posts`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ channel_id: channelId, message: message.content }),
            });
            if (!res.ok) throw new Error(`Post failed: ${res.status}`);
            logger.debug(COMPONENT, `Sent message to channel ${channelId}`);
        } catch (error) {
            logger.error(COMPONENT, `Send failed: ${(error as Error).message}`);
        }
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected };
    }
}
