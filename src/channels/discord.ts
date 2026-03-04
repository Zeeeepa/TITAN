/**
 * TITAN — Discord Channel Adapter
 * Connects to Discord using the discord.js library.
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Discord';

export class DiscordChannel extends ChannelAdapter {
    readonly name = 'discord';
    readonly displayName = 'Discord';
    private connected = false;
    private client: unknown = null;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.discord;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'Discord channel is disabled');
            return;
        }

        const token = channelConfig.token;
        if (!token) {
            logger.warn(COMPONENT, 'Discord token not configured');
            return;
        }

        try {
            // Dynamic import to avoid requiring discord.js when not used
            // @ts-expect-error — discord.js is an optional dependency
            const { Client, GatewayIntentBits, Events } = await import('discord.js');

            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.DirectMessages,
                    GatewayIntentBits.MessageContent,
                ],
            });

            client.on(Events.MessageCreate, (message: { id: string; author: { id: string; username: string; bot: boolean } | null; content: string; guild?: { id: string }; createdAt: Date }) => {
                if (!message.author || message.author.bot) return;

                const inbound: InboundMessage = {
                    id: message.id,
                    channel: 'discord',
                    userId: message.author.id,
                    userName: message.author.username,
                    content: message.content,
                    groupId: message.guild?.id,
                    timestamp: message.createdAt,
                    raw: message,
                };

                this.emit('message', inbound);
            });

            client.on(Events.ClientReady, () => {
                this.connected = true;
                logger.info(COMPONENT, `Connected as ${(client.user as unknown as Record<string, string>)?.tag}`);
            });

            await client.login(token);
            this.client = client;
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
            logger.info(COMPONENT, 'Install discord.js with: npm install discord.js');
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            (this.client as unknown as { destroy(): void }).destroy();
            this.connected = false;
            logger.info(COMPONENT, 'Disconnected');
        }
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.client || !this.connected) {
            logger.warn(COMPONENT, 'Not connected, cannot send message');
            return;
        }

        try {
            const client = this.client as unknown as { users: { fetch(id: string): Promise<{ createDM(): Promise<{ send(content: string): Promise<void> }> }> }; channels: { fetch(id: string): Promise<{ isTextBased(): boolean; send(content: string): Promise<void> } | null> } };
            if (message.userId) {
                const user = await client.users.fetch(message.userId);
                const dm = await user.createDM();
                await dm.send(message.content);
            } else if (message.groupId) {
                const channel = await client.channels.fetch(message.groupId);
                if (channel?.isTextBased()) {
                    await channel.send(message.content);
                }
            }
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
