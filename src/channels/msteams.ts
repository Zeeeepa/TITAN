/**
 * TITAN — Microsoft Teams Channel Adapter
 * Connects to Microsoft Teams using incoming webhooks (Adaptive Cards).
 * Currently implements send-only functionality.
 *
 * For bidirectional communication, Teams integration requires:
 * 1. Azure Bot Framework registration
 * 2. Incoming webhook route (external)
 * 3. Bot Framework credentials
 *
 * This adapter focuses on sending messages via webhook.
 */
import { ChannelAdapter, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'MS Teams';

export class MSTeamsChannel extends ChannelAdapter {
    readonly name = 'msteams';
    readonly displayName = 'MS Teams';
    private connected = false;
    private webhookUrl: string = '';

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.msteams;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'MS Teams channel is disabled');
            return;
        }

        const webhookUrl = channelConfig.token || process.env.MSTEAMS_WEBHOOK_URL;
        if (!webhookUrl) {
            logger.warn(COMPONENT, 'MS Teams webhook URL not configured');
            return;
        }

        // Validate webhook URL format
        if (!webhookUrl.includes('webhook.office.com')) {
            logger.warn(COMPONENT, 'Webhook URL does not appear to be a valid Microsoft Teams webhook');
        }

        try {
            this.webhookUrl = webhookUrl;
            this.connected = true;
            logger.info(COMPONENT, 'Connected to MS Teams webhook');
            logger.info(COMPONENT, 'Note: Receiving messages requires external webhook endpoint and Bot Framework');
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
            // Build Adaptive Card payload
            const payload = {
                '@type': 'MessageCard',
                '@context': 'https://schema.org/extensions',
                summary: 'TITAN Agent Message',
                themeColor: '0078D4',
                sections: [
                    {
                        activityTitle: 'TITAN Agent',
                        activitySubtitle: new Date().toISOString(),
                        text: message.content,
                        markdown: true,
                    },
                ],
                potentialAction: [
                    {
                        '@type': 'OpenUri',
                        name: 'Learn More',
                        targets: [
                            {
                                os: 'default',
                                uri: 'https://github.com/Djtony707/TITAN',
                            },
                        ],
                    },
                ],
            };

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
