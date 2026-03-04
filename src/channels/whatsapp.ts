/**
 * TITAN — WhatsApp Channel Adapter
 * Connects to WhatsApp using Baileys (WhatsApp Web API).
 */
import { ChannelAdapter, type InboundMessage, type OutboundMessage, type ChannelStatus } from './base.js';
import { loadConfig } from '../config/config.js';
import logger from '../utils/logger.js';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';

const COMPONENT = 'WhatsApp';

export class WhatsAppChannel extends ChannelAdapter {
    readonly name = 'whatsapp';
    readonly displayName = 'WhatsApp';
    private connected = false;
    private socket: unknown = null;
    private reconnectAttempts = 0;
    private reconnecting = false;

    async connect(): Promise<void> {
        const config = loadConfig();
        const channelConfig = config.channels.whatsapp;

        if (!channelConfig.enabled) {
            logger.info(COMPONENT, 'WhatsApp channel is disabled');
            return;
        }

        try {
            // Dynamic import to avoid requiring Baileys when not used
            const baileys = await import(
                /* @vite-ignore */ '@whiskeysockets/baileys' as string
            /* eslint-disable @typescript-eslint/no-explicit-any */
            ) as unknown as {
                default: (...args: any[]) => {
                    ev: { on: (event: string, cb: (data: any) => void) => void };
                    [key: string]: any;
                };
                useMultiFileAuthState: (path: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
                DisconnectReason: Record<string, number>;
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
            const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

            const authDir = join(TITAN_HOME, 'whatsapp-auth');
            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: true, // Show QR in terminal for pairing
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', (update: Record<string, unknown>) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    logger.info(COMPONENT, 'QR code displayed in terminal — scan with WhatsApp to pair');
                }

                if (connection === 'close') {
                    this.connected = false;
                    const disconnectOutput = ((lastDisconnect as Record<string, unknown>)?.error as Record<string, unknown>)?.output as Record<string, unknown> | undefined;
                    const reason = disconnectOutput?.statusCode;
                    if (reason !== DisconnectReason.loggedOut) {
                        const MAX_RETRIES = 10;
                        if (this.reconnecting) return;
                        if (this.reconnectAttempts >= MAX_RETRIES) {
                            logger.error(COMPONENT, `Max reconnect attempts (${MAX_RETRIES}) reached, giving up`);
                            return;
                        }
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
                        this.reconnectAttempts++;
                        this.reconnecting = true;
                        logger.info(COMPONENT, `Disconnected, reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RETRIES})...`);
                        setTimeout(() => {
                            this.reconnecting = false;
                            // Clean up old socket before reconnecting
                            if (this.socket) {
                                try { (this.socket as Record<string, unknown> & { end?: () => void }).end?.(); } catch { /* ignore */ }
                                this.socket = null;
                            }
                            this.connect();
                        }, delay);
                    } else {
                        logger.warn(COMPONENT, 'Logged out. Run titan pairing --whatsapp to re-pair');
                    }
                }

                if (connection === 'open') {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.reconnecting = false;
                    logger.info(COMPONENT, 'Connected to WhatsApp');
                }
            });

            sock.ev.on('messages.upsert', (m: {
                messages: Array<{
                    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
                    key: { id?: string; fromMe?: boolean; remoteJid?: string };
                    pushName?: string;
                    messageTimestamp?: number;
                }>;
            }) => {
                for (const msg of m.messages) {
                    if (!msg.message || msg.key.fromMe) continue;

                    const text =
                        msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        '';

                    if (!text) continue;

                    const inbound: InboundMessage = {
                        id: msg.key.id || String(Date.now()),
                        channel: 'whatsapp',
                        userId: msg.key.remoteJid || '',
                        userName: msg.pushName || undefined,
                        content: text,
                        groupId: msg.key.remoteJid?.endsWith('@g.us') ? msg.key.remoteJid : undefined,
                        timestamp: new Date((msg.messageTimestamp as number) * 1000),
                        raw: msg,
                    };

                    this.emit('message', inbound);
                }
            });

            this.socket = sock;
        } catch (error) {
            logger.error(COMPONENT, `Failed to connect: ${(error as Error).message}`);
            logger.info(COMPONENT, 'Install Baileys with: npm install @whiskeysockets/baileys');
        }
    }

    async disconnect(): Promise<void> {
        if (this.socket) {
            (this.socket as Record<string, unknown> & { end: () => void }).end();
            this.connected = false;
            logger.info(COMPONENT, 'Disconnected');
        }
    }

    async send(message: OutboundMessage): Promise<void> {
        if (!this.socket || !this.connected) {
            logger.warn(COMPONENT, 'Not connected, cannot send message');
            return;
        }

        try {
            const jid = message.userId || message.groupId;
            if (!jid) {
                logger.warn(COMPONENT, 'No userId or groupId provided');
                return;
            }

            await (this.socket as Record<string, unknown> & { sendMessage: (jid: string, msg: Record<string, unknown>) => Promise<void> }).sendMessage(jid, { text: message.content });
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
