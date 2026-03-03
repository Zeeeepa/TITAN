/**
 * TITAN — Google Chat Channel Adapter
 */
import { ChannelAdapter, type OutboundMessage, type ChannelStatus } from './base.js';
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

        logger.warn(COMPONENT, 'Google Chat adapter is not yet implemented');
        this.connected = false;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async send(_message: OutboundMessage): Promise<void> {
        throw new Error('Google Chat adapter is not yet implemented');
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected, error: 'Google Chat adapter is not yet implemented (stub)' };
    }
}
