/**
 * TITAN — Google Chat Channel Adapter
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'GoogleChat';

export class GoogleChatChannel extends ChannelAdapter {
    readonly name = 'googlechat';
    readonly displayName = 'Google Chat';
    private connected = false;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.googlechat;

        if (!channelConfig?.enabled) {
            logger.info(COMPONENT, 'Google Chat channel is disabled');
            return;
        }

        // Google Chat uses the Google Chat API with service account credentials
        // This is a placeholder that can be expanded with the @google-cloud/chat library
        logger.info(COMPONENT, 'Google Chat adapter ready (webhook mode)');
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected) return;
        // Google Chat sends responses via the webhook/API
        logger.debug(COMPONENT, `Would send to ${message.userId || message.groupId}: ${message.content.slice(0, 100)}`);
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected };
    }
}
