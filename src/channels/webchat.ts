/**
 * TITAN — WebChat Channel (Built-in)
 * WebSocket-based chat interface served by the gateway.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import logger from '../utils/logger.js';

const COMPONENT = 'WebChat';

/** In-memory message queue for WebSocket clients */
const outboundQueue: OutboundMessage[] = [];

export function getOutboundQueue(): OutboundMessage[] {
    return outboundQueue.splice(0, outboundQueue.length);
}

export class WebChatChannel extends ChannelAdapter {
    readonly name = 'webchat';
    readonly displayName = 'WebChat';
    private connected = false;

    async connect(): Promise<void> {
        this.connected = true;
        logger.info(COMPONENT, 'WebChat channel ready');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    /** Handle an inbound WebSocket message */
    handleWebSocketMessage(userId: string, content: string): void {
        const inbound: InboundMessage = {
            id: `wc-${Date.now()}`,
            channel: 'webchat',
            userId,
            content,
            timestamp: new Date(),
        };
        this.emit('message', inbound);
    }

    async send(message: OutboundMessage): Promise<void> {
        outboundQueue.push(message);
    }

    getStatus(): ChannelStatus {
        return { name: this.displayName, connected: this.connected };
    }
}
