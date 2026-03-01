/**
 * TITAN — Signal Channel Adapter
 * Connects to Signal using the signal-cli-rest-api (external service).
 * Requires a running signal-cli-rest-api instance at SIGNAL_API_URL.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Signal';
const POLL_INTERVAL = 2000; // Poll every 2 seconds

export class SignalChannel extends ChannelAdapter {
    readonly name = 'signal';
    readonly displayName = 'Signal';
    private connected = false;
    private apiUrl: string = '';
    private phoneNumber: string = '';
    private pollTimer: NodeJS.Timeout | null = null;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.signal;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'Signal channel is disabled');
            return;
        }

        this.apiUrl = process.env.SIGNAL_API_URL || 'http://localhost:8080';
        this.phoneNumber = process.env.SIGNAL_NUMBER || '';

        if (!this.phoneNumber) {
            logger.warn(COMPONENT, 'Signal phone number not configured (SIGNAL_NUMBER)');
            return;
        }

        try {
            // Test connectivity to the API
            const response = await fetch(`${this.apiUrl}/v1/about`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                throw new Error(`API returned status ${response.status}`);
            }

            this.connected = true;
            logger.info(COMPONENT, `Connected to Signal API at ${this.apiUrl}`);

            // Start polling for messages
            this.startPolling();
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
            logger.info(COMPONENT, 'Ensure signal-cli-rest-api is running at SIGNAL_API_URL');
            logger.info(COMPONENT, 'See: https://github.com/AsamK/signal-cli-rest-api');
        }
    }

    private startPolling(): void {
        if (this.pollTimer) return;

        this.pollTimer = setInterval(async () => {
            try {
                const response = await fetch(`${this.apiUrl}/v1/receive/${encodeURIComponent(this.phoneNumber)}`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000),
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        // No messages, normal polling
                        return;
                    }
                    throw new Error(`API returned status ${response.status}`);
                }

                const messages = await response.json() as Array<{
                    envelope: {
                        source?: string;
                        sourceNumber?: string;
                        dataMessage?: {
                            body?: string;
                            timestamp?: number;
                        };
                        syncMessage?: unknown;
                        typingMessage?: unknown;
                    };
                }>;

                for (const msg of messages) {
                    const envelope = msg.envelope;
                    if (!envelope.dataMessage || !envelope.dataMessage.body) continue;

                    const sender = envelope.source || envelope.sourceNumber || 'unknown';
                    const timestamp = envelope.dataMessage.timestamp || Date.now();

                    const inbound: InboundMessage = {
                        id: `signal-${timestamp}-${sender}`,
                        channel: 'signal',
                        userId: sender,
                        userName: sender,
                        content: envelope.dataMessage.body,
                        timestamp: new Date(timestamp),
                        raw: msg,
                    };

                    this.emit('message', inbound);
                }
            } catch (error) {
                logger.error(COMPONENT, `Polling failed: ${(error as Error).message}`);
            }
        }, POLL_INTERVAL);
    }

    async disconnect(): Promise<void> {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.connected = false;
        logger.info(COMPONENT, 'Disconnected');
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.connected) {
            logger.warn(COMPONENT, 'Not connected, cannot send message');
            return;
        }

        try {
            const recipient = message.userId || message.groupId;
            if (!recipient) {
                logger.warn(COMPONENT, 'No userId or groupId provided for message');
                return;
            }

            const response = await fetch(`${this.apiUrl}/v2/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message.content,
                    number: this.phoneNumber,
                    recipients: [recipient],
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API returned status ${response.status}: ${text}`);
            }

            logger.info(COMPONENT, `Message sent to ${recipient}`);
        } catch (error) {
            logger.error(COMPONENT, `Send failed: ${(error as Error).message}`);
        }
    }

    getStatus(): ChannelStatus {
        return {
            name: this.displayName,
            connected: this.connected,
        };
    }
}
