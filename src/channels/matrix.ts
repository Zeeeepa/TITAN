/**
 * TITAN — Matrix Channel Adapter
 * Connects to Matrix/Element homeservers using the matrix-js-sdk library.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Matrix';

export class MatrixChannel extends ChannelAdapter {
    readonly name = 'matrix';
    readonly displayName = 'Matrix';
    private connected = false;
    private client: unknown = null;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.matrix;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'Matrix channel is disabled');
            return;
        }

        const token = channelConfig.token;
        if (!token) {
            logger.warn(COMPONENT, 'Matrix token not configured');
            return;
        }

        try {
            // Dynamic import to avoid requiring matrix-js-sdk when not used
            const sdk = await import('matrix-js-sdk');

            const homeserver = process.env.MATRIX_HOMESERVER || 'https://matrix.org';
            const userId = process.env.MATRIX_USER_ID || '';

            const client = sdk.createClient({
                baseUrl: homeserver,
                accessToken: token,
                userId: userId,
            });

            // @ts-expect-error — matrix-js-sdk event name typing issue
            client.on('Room.timeline' as string, (event: { getType(): string; getSender(): string; getContent(): Record<string, unknown>; getId(): string; getTs(): number }, room: { roomId: string }) => {
                if (event.getType() !== 'm.room.message') return;
                if (event.getSender() === client.getUserId()) return;

                const content = event.getContent();
                if (!content.body) return;

                const inbound: InboundMessage = {
                    id: event.getId(),
                    channel: 'matrix',
                    userId: event.getSender(),
                    userName: event.getSender(),
                    content: content.body as string,
                    groupId: room.roomId,
                    timestamp: new Date(event.getTs()),
                    raw: event,
                };

                this.emit('message', inbound);
            });

            await client.startClient({ initialSyncLimit: 0 });
            this.client = client;
            this.connected = true;
            logger.info(COMPONENT, `Connected to Matrix homeserver: ${homeserver}`);
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
            logger.info(COMPONENT, 'Install matrix-js-sdk with: npm install matrix-js-sdk');
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                (this.client as unknown as { stopClient(): void }).stopClient();
                this.connected = false;
                logger.info(COMPONENT, 'Disconnected');
            } catch (error) {
                logger.error(COMPONENT, `Disconnect failed: ${(error as Error).message}`);
            }
        }
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.client || !this.connected) {
            logger.warn(COMPONENT, 'Not connected, cannot send message');
            return;
        }

        try {
            const client = this.client as unknown as { sendTextMessage(roomId: string, content: string): Promise<void> };
            const roomId = message.groupId || message.userId;

            if (!roomId) {
                logger.warn(COMPONENT, 'No roomId or userId provided for message');
                return;
            }

            await client.sendTextMessage(roomId, message.content);
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
