/**
 * TITAN — Google Chat Channel Adapter
 * Sends messages to Google Chat spaces via incoming webhooks.
 * Send-only (same pattern as MS Teams adapter).
 *
 * Setup: Create a webhook in Google Chat space → Configure token as the webhook URL.
 * URL format: https://chat.googleapis.com/v1/spaces/...
 */
import { ChannelAdapter, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'GoogleChat';

export class GoogleChatChannel extends ChannelAdapter {
    readonly name = 'googlechat';
    readonly displayName = 'Google Chat';
    private connected = false;
    private webhookUrl: string = '';

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.googlechat;

        if (!channelConfig?.enabled) {
            logger.info(COMPONENT, 'Google Chat channel is disabled');
            return;
        }

        const webhookUrl = channelConfig.token || process.env.GOOGLE_CHAT_WEBHOOK_URL;
        if (!webhookUrl) {
            logger.warn(COMPONENT, 'Google Chat webhook URL not configured');
            return;
        }

        // Validate webhook URL format
        if (!webhookUrl.startsWith('https://chat.googleapis.com/')) {
            logger.warn(COMPONENT, 'Webhook URL does not appear to be a valid Google Chat webhook');
        }

        try {
            this.webhookUrl = webhookUrl;
            this.connected = true;
            logger.info(COMPONENT, 'Connected to Google Chat webhook');
            logger.info(COMPONENT, 'Note: Receiving messages requires a Google Chat bot app');
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.webhookUrl = '';
        logger.info(COMPONENT, 'Disconnected');
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected || !this.webhookUrl) {
            logger.warn(COMPONENT, 'Not connected, cannot send message');
            return;
        }

        try {
            // Build Google Chat card payload
            const payload = {
                cardsV2: [
                    {
                        cardId: 'titanMessage',
                        card: {
                            header: {
                                title: 'TITAN Agent',
                                subtitle: new Date().toISOString(),
                                imageUrl: 'https://raw.githubusercontent.com/Djtony707/TITAN/main/assets/icon.png',
                                imageType: 'CIRCLE',
                            },
                            sections: [
                                {
                                    widgets: [
                                        {
                                            textParagraph: {
                                                text: message.content,
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                ],
            };

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Webhook returned status ${response.status}: ${text}`);
            }

            logger.info(COMPONENT, 'Message sent successfully');
        } catch (error) {
            logger.error(COMPONENT, `Send failed: ${(error as Error).message}`);
        }
    }

    getStatus(): ChannelStatus {
        return {
            name: this.displayName,
            connected: this.connected,
            error: !this.connected ? 'Webhook URL not configured' : undefined,
        };
    }
}
