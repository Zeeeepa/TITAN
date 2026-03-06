/**
 * TITAN — Email Skill Tests
 * Tests src/skills/builtin/email.ts: registerEmailSkill
 * Covers email_send, email_search, email_read, email_list handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ─── Global mocks ──────────────────────────────────────────────────

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mock socket factory ───────────────────────────────────────────

function createMockSocket(): EventEmitter & {
    setTimeout: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
} {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
        setTimeout: vi.fn(),
        removeAllListeners: vi.fn().mockImplementation((event?: string) => {
            if (event) EventEmitter.prototype.removeAllListeners.call(emitter, event);
            else EventEmitter.prototype.removeAllListeners.call(emitter);
            return emitter;
        }),
        destroy: vi.fn(),
        write: vi.fn(),
    });
}

// ════════════════════════════════════════════════════════════════════
// Registration Tests
// ════════════════════════════════════════════════════════════════════

describe('Email Skill — Registration', () => {
    let handlers: Map<string, any>;

    beforeEach(async () => {
        vi.resetModules();
        handlers = new Map();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('net', () => ({ createConnection: vi.fn().mockReturnValue(createMockSocket()) }));
        vi.doMock('tls', () => ({ connect: vi.fn().mockReturnValue(createMockSocket()) }));

        const { registerEmailSkill } = await import('../src/skills/builtin/email.js');
        registerEmailSkill();
    });

    afterEach(() => {
        delete process.env.GMAIL_ADDRESS;
        delete process.env.GMAIL_APP_PASSWORD;
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        delete process.env.SMTP_PORT;
    });

    it('should register all 4 handlers', () => {
        expect(handlers.size).toBe(4);
        expect(handlers.has('email_send')).toBe(true);
        expect(handlers.has('email_search')).toBe(true);
        expect(handlers.has('email_read')).toBe(true);
        expect(handlers.has('email_list')).toBe(true);
    });

    it('email_send handler has correct required parameters', () => {
        const h = handlers.get('email_send');
        expect(h.parameters.required).toContain('to');
        expect(h.parameters.required).toContain('subject');
        expect(h.parameters.required).toContain('body');
    });

    it('email_search handler has correct required parameters', () => {
        const h = handlers.get('email_search');
        expect(h.parameters.required).toContain('query');
    });

    it('email_read handler has correct required parameters', () => {
        const h = handlers.get('email_read');
        expect(h.parameters.required).toContain('messageId');
    });

    it('email_list handler has no required parameters', () => {
        const h = handlers.get('email_list');
        expect(h.parameters.required).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════
// email_send — Validation Tests
// ════════════════════════════════════════════════════════════════════

describe('Email Skill — email_send validation', () => {
    let sendHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('net', () => ({ createConnection: vi.fn().mockReturnValue(createMockSocket()) }));
        vi.doMock('tls', () => ({ connect: vi.fn().mockReturnValue(createMockSocket()) }));

        const { registerEmailSkill } = await import('../src/skills/builtin/email.js');
        registerEmailSkill();
        sendHandler = handlers.get('email_send');
    });

    afterEach(() => {
        delete process.env.GMAIL_ADDRESS;
        delete process.env.GMAIL_APP_PASSWORD;
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        delete process.env.SMTP_PORT;
    });

    it('should return error when "to" is empty', async () => {
        const result = await sendHandler.execute({ to: '', subject: 'Hi', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('"to" is required');
    });

    it('should return error when "to" is whitespace-only', async () => {
        const result = await sendHandler.execute({ to: '   ', subject: 'Hi', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('"to" is required');
    });

    it('should return error when "subject" is empty', async () => {
        const result = await sendHandler.execute({ to: 'a@b.com', subject: '', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('"subject" is required');
    });

    it('should return error when "subject" is whitespace-only', async () => {
        const result = await sendHandler.execute({ to: 'a@b.com', subject: '  ', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('"subject" is required');
    });

    it('should return error when "body" is empty', async () => {
        const result = await sendHandler.execute({ to: 'a@b.com', subject: 'Hi', body: '' });
        expect(result).toContain('Error');
        expect(result).toContain('"body" is required');
    });

    it('should return error when "body" is whitespace-only', async () => {
        const result = await sendHandler.execute({ to: 'a@b.com', subject: 'Hi', body: '   ' });
        expect(result).toContain('Error');
        expect(result).toContain('"body" is required');
    });

    it('should return error for invalid "to" email address', async () => {
        const result = await sendHandler.execute({ to: 'not-an-email', subject: 'Hi', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "to" address');
        expect(result).toContain('not-an-email');
    });

    it('should return error for email missing domain TLD', async () => {
        const result = await sendHandler.execute({ to: 'user@domain', subject: 'Hi', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "to" address');
    });

    it('should return error for email with spaces', async () => {
        const result = await sendHandler.execute({ to: 'user @domain.com', subject: 'Hi', body: 'Hello' });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "to" address');
    });

    it('should return error for invalid CC address', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass123';
        const result = await sendHandler.execute({
            to: 'valid@example.com',
            subject: 'Hi',
            body: 'Hello',
            cc: 'bad-cc-addr',
        });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "cc" address');
    });

    it('should return error for invalid BCC address', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass123';
        const result = await sendHandler.execute({
            to: 'valid@example.com',
            subject: 'Hi',
            body: 'Hello',
            bcc: 'bad-bcc-addr',
        });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "bcc" address');
    });

    it('should handle multiple invalid "to" addresses', async () => {
        const result = await sendHandler.execute({
            to: 'bad1, also-bad, nope',
            subject: 'Hi',
            body: 'Hello',
        });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "to" address');
    });

    it('should handle mixture of valid and invalid "to" addresses', async () => {
        const result = await sendHandler.execute({
            to: 'good@example.com, bad-addr',
            subject: 'Hi',
            body: 'Hello',
        });
        expect(result).toContain('Error');
        expect(result).toContain('Invalid "to" address');
        expect(result).toContain('bad-addr');
    });
});

// ════════════════════════════════════════════════════════════════════
// email_send — SMTP Config Resolution
// ════════════════════════════════════════════════════════════════════

describe('Email Skill — email_send SMTP config', () => {
    let sendHandler: any;
    let mockSocket: ReturnType<typeof createMockSocket>;
    let mockTlsSocket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
        vi.resetModules();
        mockSocket = createMockSocket();
        mockTlsSocket = createMockSocket();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('net', () => ({ createConnection: vi.fn().mockReturnValue(mockSocket) }));
        vi.doMock('tls', () => ({ connect: vi.fn().mockReturnValue(mockTlsSocket) }));

        const { registerEmailSkill } = await import('../src/skills/builtin/email.js');
        registerEmailSkill();
        sendHandler = handlers.get('email_send');
    });

    afterEach(() => {
        delete process.env.GMAIL_ADDRESS;
        delete process.env.GMAIL_APP_PASSWORD;
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        delete process.env.SMTP_PORT;
    });

    it('should return error when no SMTP config is set', async () => {
        delete process.env.GMAIL_ADDRESS;
        delete process.env.GMAIL_APP_PASSWORD;
        delete process.env.SMTP_HOST;
        const result = await sendHandler.execute({
            to: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
        });
        expect(result).toContain('Error');
        expect(result).toContain('No email configuration found');
        expect(result).toContain('GMAIL_ADDRESS');
        expect(result).toContain('SMTP_HOST');
    });

    it('should return error when only GMAIL_ADDRESS is set (no password)', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        delete process.env.GMAIL_APP_PASSWORD;
        delete process.env.SMTP_HOST;
        const result = await sendHandler.execute({
            to: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
        });
        expect(result).toContain('Error');
        expect(result).toContain('No email configuration found');
    });

    it('should return error when only GMAIL_APP_PASSWORD is set (no address)', async () => {
        delete process.env.GMAIL_ADDRESS;
        process.env.GMAIL_APP_PASSWORD = 'password123';
        delete process.env.SMTP_HOST;
        const result = await sendHandler.execute({
            to: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
        });
        expect(result).toContain('Error');
        expect(result).toContain('No email configuration found');
    });

    it('should use Gmail config when both GMAIL env vars are set', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'app-pass-123';

        // Simulate a successful SMTP conversation
        const sendPromise = sendHandler.execute({
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        // Drive the SMTP state machine through all steps
        await nextTick();
        mockSocket.emit('data', '220 smtp.gmail.com ESMTP\r\n');
        await nextTick();
        mockSocket.emit('data', '250 smtp.gmail.com at your service\r\n');
        await nextTick();
        mockSocket.emit('data', '220 2.0.0 Ready to start TLS\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 smtp.gmail.com at your service\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 VXNlcm5hbWU6\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 UGFzc3dvcmQ6\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '235 2.7.0 Accepted\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 2.1.0 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 2.1.5 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '354 Go ahead\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 2.0.0 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '221 2.0.0 closing connection\r\n');

        const result = await sendPromise;
        expect(result).toContain('Email sent successfully');
        expect(result).toContain('dest@example.com');
        expect(result).toContain('smtp.gmail.com');
    });

    it('should use custom SMTP config when SMTP env vars are set', async () => {
        process.env.SMTP_HOST = 'mail.example.com';
        process.env.SMTP_USER = 'user@example.com';
        process.env.SMTP_PASS = 'secret123';
        process.env.SMTP_PORT = '465';

        const sendPromise = sendHandler.execute({
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        // Drive the SMTP state machine
        await nextTick();
        mockSocket.emit('data', '220 mail.example.com ESMTP\r\n');
        await nextTick();
        mockSocket.emit('data', '250 mail.example.com OK\r\n');
        await nextTick();
        mockSocket.emit('data', '220 Ready to start TLS\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 VXNlcm5hbWU6\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 UGFzc3dvcmQ6\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '235 Accepted\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '354 Go ahead\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '221 Bye\r\n');

        const result = await sendPromise;
        expect(result).toContain('Email sent successfully');
        expect(result).toContain('mail.example.com');
    });

    it('should prefer Gmail config over custom SMTP when both are set', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'app-pass';
        process.env.SMTP_HOST = 'mail.example.com';
        process.env.SMTP_USER = 'user@example.com';
        process.env.SMTP_PASS = 'secret';

        const sendPromise = sendHandler.execute({
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        // Drive the SMTP state machine (Gmail)
        await nextTick();
        mockSocket.emit('data', '220 smtp.gmail.com ESMTP\r\n');
        await nextTick();
        mockSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockSocket.emit('data', '220 Ready\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 Challenge\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 Challenge\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '235 Auth OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '354 Data\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '221 Bye\r\n');

        const result = await sendPromise;
        expect(result).toContain('Email sent successfully');
        expect(result).toContain('smtp.gmail.com');
    });

    it('should handle SMTP connection rejection at greeting', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass123';

        const sendPromise = sendHandler.execute({
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        await nextTick();
        mockSocket.emit('data', '421 Service not available\r\n');

        const result = await sendPromise;
        expect(result).toContain('Error sending email');
        expect(result).toContain('Server rejected connection');
    });

    it('should handle SMTP AUTH failure', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'wrong-pass';

        const sendPromise = sendHandler.execute({
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        await nextTick();
        mockSocket.emit('data', '220 smtp.gmail.com ESMTP\r\n');
        await nextTick();
        mockSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockSocket.emit('data', '220 Ready\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 Challenge\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 Challenge\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '535 Authentication failed\r\n');

        const result = await sendPromise;
        expect(result).toContain('Error sending email');
        expect(result).toContain('AUTH password rejected');
    });

    it('should include CC and BCC recipients in success message', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass';

        const sendPromise = sendHandler.execute({
            to: 'to@example.com',
            subject: 'Test',
            body: 'Hello',
            cc: 'cc@example.com',
            bcc: 'bcc@example.com',
        });

        // Drive through all SMTP steps (3 RCPT TO: to, cc, bcc)
        await nextTick();
        mockSocket.emit('data', '220 smtp.gmail.com ESMTP\r\n');
        await nextTick();
        mockSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockSocket.emit('data', '220 Ready\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 C\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 C\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '235 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n'); // MAIL FROM
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n'); // RCPT TO: to
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n'); // RCPT TO: cc
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n'); // RCPT TO: bcc
        await nextTick();
        mockTlsSocket.emit('data', '354 Data\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '221 Bye\r\n');

        const result = await sendPromise;
        expect(result).toContain('Email sent successfully');
        expect(result).toContain('to@example.com');
        expect(result).toContain('CC');
        expect(result).toContain('BCC');
    });

    it('should send HTML email when html=true', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass';

        const sendPromise = sendHandler.execute({
            to: 'to@example.com',
            subject: 'HTML Test',
            body: '<h1>Hello</h1><p>World</p>',
            html: true,
        });

        await nextTick();
        mockSocket.emit('data', '220 smtp.gmail.com ESMTP\r\n');
        await nextTick();
        mockSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockSocket.emit('data', '220 Ready\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 C\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '334 C\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '235 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '354 Data\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '250 OK\r\n');
        await nextTick();
        mockTlsSocket.emit('data', '221 Bye\r\n');

        const result = await sendPromise;
        expect(result).toContain('Email sent successfully');
        expect(result).toContain('HTML Test');
    });

    it('should handle socket error during send', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass';

        const sendPromise = sendHandler.execute({
            to: 'to@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        await nextTick();
        mockSocket.emit('error', new Error('Connection refused'));

        const result = await sendPromise;
        expect(result).toContain('Error sending email');
        expect(result).toContain('Socket error');
    });

    it('should handle socket timeout', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass';

        const sendPromise = sendHandler.execute({
            to: 'to@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        await nextTick();
        mockSocket.emit('timeout');

        const result = await sendPromise;
        expect(result).toContain('Error sending email');
        expect(result).toContain('timed out');
    });

    it('should handle premature socket close', async () => {
        process.env.GMAIL_ADDRESS = 'test@gmail.com';
        process.env.GMAIL_APP_PASSWORD = 'pass';

        const sendPromise = sendHandler.execute({
            to: 'to@example.com',
            subject: 'Test',
            body: 'Hello',
        });

        await nextTick();
        mockSocket.emit('close');

        const result = await sendPromise;
        expect(result).toContain('Error sending email');
        expect(result).toContain('closed');
    });
});

// ════════════════════════════════════════════════════════════════════
// email_search — OAuth2 Stub
// ════════════════════════════════════════════════════════════════════

describe('Email Skill — email_search', () => {
    let searchHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        vi.doMock('../src/auth/google.js', () => ({
            isGoogleConnected: vi.fn().mockReturnValue(false),
            gmailFetch: vi.fn(),
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('net', () => ({ createConnection: vi.fn().mockReturnValue(createMockSocket()) }));
        vi.doMock('tls', () => ({ connect: vi.fn().mockReturnValue(createMockSocket()) }));

        const { registerEmailSkill } = await import('../src/skills/builtin/email.js');
        registerEmailSkill();
        searchHandler = handlers.get('email_search');
    });

    it('should return not-connected message when Google is not connected', async () => {
        const result = await searchHandler.execute({ query: 'from:boss@company.com' });
        expect(result).toContain('Gmail not connected');
        expect(result).toContain('Settings');
    });

    it('should handle empty query gracefully', async () => {
        const result = await searchHandler.execute({ query: '' });
        expect(result).toContain('Gmail not connected');
    });
});

// ════════════════════════════════════════════════════════════════════
// email_read — OAuth2 Stub
// ════════════════════════════════════════════════════════════════════

describe('Email Skill — email_read', () => {
    let readHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        vi.doMock('../src/auth/google.js', () => ({
            isGoogleConnected: vi.fn().mockReturnValue(false),
            gmailFetch: vi.fn(),
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('net', () => ({ createConnection: vi.fn().mockReturnValue(createMockSocket()) }));
        vi.doMock('tls', () => ({ connect: vi.fn().mockReturnValue(createMockSocket()) }));

        const { registerEmailSkill } = await import('../src/skills/builtin/email.js');
        registerEmailSkill();
        readHandler = handlers.get('email_read');
    });

    it('should return not-connected message when Google is not connected', async () => {
        const result = await readHandler.execute({ messageId: 'msg-123' });
        expect(result).toContain('Gmail not connected');
    });

    it('should return error for empty messageId', async () => {
        const result = await readHandler.execute({ messageId: '' });
        expect(result).toContain('Error');
    });
});

// ════════════════════════════════════════════════════════════════════
// email_list — OAuth2/IMAP Stub
// ════════════════════════════════════════════════════════════════════

describe('Email Skill — email_list', () => {
    let listHandler: any;

    beforeEach(async () => {
        vi.resetModules();

        vi.doMock('../src/utils/logger.js', () => ({
            default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        vi.doMock('../src/auth/google.js', () => ({
            isGoogleConnected: vi.fn().mockReturnValue(false),
            gmailFetch: vi.fn(),
        }));

        const handlers = new Map<string, any>();
        vi.doMock('../src/skills/registry.js', () => ({
            registerSkill: vi.fn().mockImplementation((_meta: any, handler: any) => {
                handlers.set(handler.name, handler);
            }),
        }));

        vi.doMock('net', () => ({ createConnection: vi.fn().mockReturnValue(createMockSocket()) }));
        vi.doMock('tls', () => ({ connect: vi.fn().mockReturnValue(createMockSocket()) }));

        const { registerEmailSkill } = await import('../src/skills/builtin/email.js');
        registerEmailSkill();
        listHandler = handlers.get('email_list');
    });

    it('should return not-connected message when Google is not connected', async () => {
        const result = await listHandler.execute({});
        expect(result).toContain('Gmail not connected');
        expect(result).toContain('Settings');
    });
});

// ─── Helper ────────────────────────────────────────────────────────

function nextTick(): Promise<void> {
    return new Promise(resolve => process.nextTick(resolve));
}
