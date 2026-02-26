/**
 * TITAN — Channel Base Interface
 * Abstract interface for all messaging channel adapters.
 */
import { EventEmitter } from 'events';

/** Inbound message from a channel */
export interface InboundMessage {
    id: string;
    channel: string;
    userId: string;
    userName?: string;
    content: string;
    attachments?: Array<{ type: string; url: string; name?: string }>;
    replyTo?: string;
    groupId?: string;
    timestamp: Date;
    raw?: unknown;
}

/** Outbound message to a channel */
export interface OutboundMessage {
    channel: string;
    userId?: string;
    groupId?: string;
    content: string;
    replyTo?: string;
    attachments?: Array<{ type: string; data: Buffer; name: string }>;
}

/** Channel status */
export interface ChannelStatus {
    name: string;
    connected: boolean;
    userCount?: number;
    lastActivity?: Date;
    error?: string;
}

/**
 * Abstract Channel Adapter
 * All channel integrations (Discord, Telegram, Slack, etc.) extend this.
 */
export abstract class ChannelAdapter extends EventEmitter {
    abstract readonly name: string;
    abstract readonly displayName: string;

    /** Connect to the channel service */
    abstract connect(): Promise<void>;

    /** Disconnect from the channel service */
    abstract disconnect(): Promise<void>;

    /** Send a message to the channel */
    abstract send(message: OutboundMessage): Promise<void>;

    /** Get the current connection status */
    abstract getStatus(): ChannelStatus;

    /** Type declaration for events */
    declare on: (event: 'message', listener: (msg: InboundMessage) => void) => this;
    declare emit: (event: 'message', msg: InboundMessage) => boolean;
}
