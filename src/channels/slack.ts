/**
 * TITAN — Slack Channel Adapter
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Slack';

export class SlackChannel extends ChannelAdapter {
    readonly name = 'slack';
    readonly displayName = 'Slack';
    private connected = false;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.slack;
        if (!channelConfig.enabled) { logger.info(COMPONENT, 'Slack channel is disabled'); return; }
        if (!channelConfig.token) { logger.warn(COMPONENT, 'Slack token not configured'); return; }

        try {
            // Dynamic import to only load Bolt when used
            const { App } = await import('@slack/bolt' as string);
            const app = new App({
                token: channelConfig.token,
                signingSecret: channelConfig.apiKey || '',
                socketMode: true,
                appToken: channelConfig.apiKey || '',
            });

            app.message(async ({ message, say }: any) => {
                if (message.subtype) return;
                const inbound: InboundMessage = {
                    id: message.ts, channel: 'slack', userId: message.user,
                    content: message.text || '', groupId: message.channel,
                    timestamp: new Date(parseFloat(message.ts) * 1000), raw: message,
                };
                this.emit('message', inbound);
            });

            await app.start();
            this.connected = true;
            logger.info(COMPONENT, 'Connected to Slack');
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
            logger.info(COMPONENT, 'Install Bolt with: npm install @slack/bolt');
        }
    }

    async disconnect(): Promise<void> { this.connected = false; }
    async send(message: OutboundMessage): Promise<void> {
        logger.debug(COMPONENT, `Would send to ${message.userId || message.groupId}: ${message.content.slice(0, 100)}`);
    }
    getStatus(): ChannelStatus { return { name: this.displayName, connected: this.connected }; }
}
