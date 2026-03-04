/**
 * TITAN — Google Chat Channel Tests
 * Tests the Google Chat webhook adapter: connect, disconnect, send, status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeConfig(overrides: Record<string, any> = {}) {
    return {
        channels: {
            googlechat: {
                enabled: false,
                token: '',
                apiKey: '',
                allowFrom: [],
                dmPolicy: 'pairing',
                ...overrides,
            },
        },
    };
}

let currentConfig = makeConfig();

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn(() => currentConfig),
}));

// ── Test suite ───────────────────────────────────────────────────────

import { GoogleChatChannel } from '../src/channels/googlechat.js';
import logger from '../src/utils/logger.js';

describe('GoogleChatChannel', () => {
    let channel: GoogleChatChannel;

    beforeEach(() => {
        currentConfig = makeConfig();
        channel = new GoogleChatChannel();
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await channel.disconnect();
    });

    // ── Identity ───────────────────────────────────────────────────

    describe('identity', () => {
        it('should have name "googlechat"', () => {
            expect(channel.name).toBe('googlechat');
        });

        it('should have displayName "Google Chat"', () => {
            expect(channel.displayName).toBe('Google Chat');
        });

        it('should be an instance of GoogleChatChannel', () => {
            expect(channel).toBeInstanceOf(GoogleChatChannel);
        });
    });

    // ── connect() ──────────────────────────────────────────────────

    describe('connect', () => {
        it('should not connect when disabled', async () => {
            await channel.connect();
            expect(channel.getStatus().connected).toBe(false);
        });

        it('should log info when disabled', async () => {
            await channel.connect();
            expect(logger.info).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('disabled'));
        });

        it('should connect with valid Google Chat webhook URL', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=test&token=tok',
            });
            await channel.connect();
            expect(channel.getStatus().connected).toBe(true);
        });

        it('should not connect when enabled but no token', async () => {
            currentConfig = makeConfig({ enabled: true });
            await channel.connect();
            expect(channel.getStatus().connected).toBe(false);
        });

        it('should log warning when no token configured', async () => {
            currentConfig = makeConfig({ enabled: true });
            await channel.connect();
            expect(logger.warn).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('not configured'));
        });

        it('should warn on non-Google Chat URL', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://hooks.slack.com/services/abc',
            });
            await channel.connect();
            expect(logger.warn).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('does not appear'));
            // Should still connect despite warning
            expect(channel.getStatus().connected).toBe(true);
        });

        it('should accept any string as token and connect', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'arbitrary-string',
            });
            await channel.connect();
            expect(channel.getStatus().connected).toBe(true);
        });

        it('should log success message on connect', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();
            expect(logger.info).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('Connected'));
        });

        it('should use GOOGLE_CHAT_WEBHOOK_URL env var as fallback', async () => {
            const originalEnv = process.env.GOOGLE_CHAT_WEBHOOK_URL;
            process.env.GOOGLE_CHAT_WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/env/messages';
            currentConfig = makeConfig({ enabled: true, token: '' });
            await channel.connect();
            expect(channel.getStatus().connected).toBe(true);
            // Restore env
            if (originalEnv !== undefined) {
                process.env.GOOGLE_CHAT_WEBHOOK_URL = originalEnv;
            } else {
                delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
            }
        });
    });

    // ── disconnect() ───────────────────────────────────────────────

    describe('disconnect', () => {
        it('should set connected to false', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();
            expect(channel.getStatus().connected).toBe(true);
            await channel.disconnect();
            expect(channel.getStatus().connected).toBe(false);
        });

        it('should be safe to call when not connected', async () => {
            await expect(channel.disconnect()).resolves.toBeUndefined();
        });

        it('should be safe to call multiple times', async () => {
            await channel.disconnect();
            await channel.disconnect();
            expect(channel.getStatus().connected).toBe(false);
        });

        it('should log disconnect message', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();
            await channel.disconnect();
            expect(logger.info).toHaveBeenCalledWith('GoogleChat', 'Disconnected');
        });
    });

    // ── send() ─────────────────────────────────────────────────────

    describe('send', () => {
        it('should not throw when not connected', async () => {
            await expect(channel.send({ channel: 'googlechat', content: 'test' }))
                .resolves.toBeUndefined();
        });

        it('should warn when not connected', async () => {
            await channel.send({ channel: 'googlechat', content: 'test' });
            expect(logger.warn).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('Not connected'));
        });

        it('should send when connected (mocked fetch)', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();

            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            const origFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            await channel.send({ channel: 'googlechat', content: 'Hello from TITAN' });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockFetch.mock.calls[0];
            expect(url).toBe('https://chat.googleapis.com/v1/spaces/test/messages');
            expect(options.method).toBe('POST');
            expect(options.headers['Content-Type']).toBe('application/json; charset=UTF-8');

            const body = JSON.parse(options.body);
            expect(body.cardsV2).toBeDefined();
            expect(body.cardsV2[0].card.sections[0].widgets[0].textParagraph.text).toBe('Hello from TITAN');

            globalThis.fetch = origFetch;
        });

        it('should include card header with TITAN Agent title', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();

            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            const origFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            await channel.send({ channel: 'googlechat', content: 'test' });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.cardsV2[0].card.header.title).toBe('TITAN Agent');

            globalThis.fetch = origFetch;
        });

        it('should handle fetch errors gracefully', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();

            const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
            const origFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            await expect(channel.send({ channel: 'googlechat', content: 'test' }))
                .resolves.toBeUndefined();
            expect(logger.error).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('Send failed'));

            globalThis.fetch = origFetch;
        });

        it('should handle non-OK response', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();

            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                text: vi.fn().mockResolvedValue('Forbidden'),
            });
            const origFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            await channel.send({ channel: 'googlechat', content: 'test' });
            expect(logger.error).toHaveBeenCalledWith('GoogleChat', expect.stringContaining('403'));

            globalThis.fetch = origFetch;
        });

        it('should handle empty message content', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();

            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            const origFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            await channel.send({ channel: 'googlechat', content: '' });
            expect(mockFetch).toHaveBeenCalled();

            globalThis.fetch = origFetch;
        });

        it('should handle long message content', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();

            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            const origFetch = globalThis.fetch;
            globalThis.fetch = mockFetch;

            const longContent = 'x'.repeat(10000);
            await channel.send({ channel: 'googlechat', content: longContent });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.cardsV2[0].card.sections[0].widgets[0].textParagraph.text).toBe(longContent);

            globalThis.fetch = origFetch;
        });
    });

    // ── getStatus() ────────────────────────────────────────────────

    describe('getStatus', () => {
        it('should return disconnected status by default', () => {
            const status = channel.getStatus();
            expect(status.name).toBe('Google Chat');
            expect(status.connected).toBe(false);
            expect(status.error).toBe('Webhook URL not configured');
        });

        it('should return connected status after connect', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();
            const status = channel.getStatus();
            expect(status.connected).toBe(true);
            expect(status.error).toBeUndefined();
        });

        it('should return disconnected status after disconnect', async () => {
            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await channel.connect();
            await channel.disconnect();
            const status = channel.getStatus();
            expect(status.connected).toBe(false);
        });

        it('should always return displayName', () => {
            expect(channel.getStatus().name).toBe('Google Chat');
        });
    });

    // ── Multiple channel instances ─────────────────────────────────

    describe('multiple instances', () => {
        it('should allow independent instances', () => {
            const ch1 = new GoogleChatChannel();
            const ch2 = new GoogleChatChannel();
            expect(ch1).not.toBe(ch2);
            expect(ch1.name).toBe(ch2.name);
        });

        it('instances should have independent state', async () => {
            const ch1 = new GoogleChatChannel();
            const ch2 = new GoogleChatChannel();

            currentConfig = makeConfig({
                enabled: true,
                token: 'https://chat.googleapis.com/v1/spaces/test/messages',
            });
            await ch1.connect();

            expect(ch1.getStatus().connected).toBe(true);
            expect(ch2.getStatus().connected).toBe(false);

            await ch1.disconnect();
        });
    });
});
