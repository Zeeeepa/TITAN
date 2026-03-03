/**
 * TITAN — Security Module Tests
 * Tests encryption.ts and sandbox.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Encryption Tests ────────────────────────────────────────────
import { generateKey, encrypt, decrypt, type EncryptedPayload } from '../src/security/encryption.js';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Encryption Module', () => {
    describe('generateKey', () => {
        it('should generate a 32-byte buffer', () => {
            const key = generateKey();
            expect(Buffer.isBuffer(key)).toBe(true);
            expect(key.length).toBe(32);
        });

        it('should generate unique keys each time', () => {
            const key1 = generateKey();
            const key2 = generateKey();
            expect(key1.equals(key2)).toBe(false);
        });
    });

    describe('encrypt', () => {
        it('should return an EncryptedPayload with iv, authTag, and data', () => {
            const key = generateKey();
            const payload = encrypt('Hello, TITAN!', key);
            expect(payload).toHaveProperty('iv');
            expect(payload).toHaveProperty('authTag');
            expect(payload).toHaveProperty('data');
            expect(typeof payload.iv).toBe('string');
            expect(typeof payload.authTag).toBe('string');
            expect(typeof payload.data).toBe('string');
        });

        it('should produce different ciphertext for same plaintext (due to random IV)', () => {
            const key = generateKey();
            const p1 = encrypt('Same text', key);
            const p2 = encrypt('Same text', key);
            expect(p1.data).not.toBe(p2.data);
            expect(p1.iv).not.toBe(p2.iv);
        });

        it('should accept a hex string key', () => {
            const key = generateKey();
            const hexKey = key.toString('hex');
            const payload = encrypt('Test', hexKey);
            expect(payload.data.length).toBeGreaterThan(0);
        });

        it('should throw for an invalid key length', () => {
            const shortKey = Buffer.alloc(16); // 16 bytes, not 32
            expect(() => encrypt('Test', shortKey)).toThrow();
        });
    });

    describe('decrypt', () => {
        it('should decrypt back to original plaintext', () => {
            const key = generateKey();
            const plaintext = 'Hello, TITAN! This is a secret message.';
            const payload = encrypt(plaintext, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(plaintext);
        });

        it('should handle empty strings', () => {
            const key = generateKey();
            const payload = encrypt('', key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe('');
        });

        it('should handle unicode text', () => {
            const key = generateKey();
            const text = 'TITAN supports unicode: \u00e9\u00e8\u00ea \u2603 \ud83d\ude80';
            const payload = encrypt(text, key);
            expect(decrypt(payload, key)).toBe(text);
        });

        it('should throw with a wrong key', () => {
            const key1 = generateKey();
            const key2 = generateKey();
            const payload = encrypt('Secret', key1);
            expect(() => decrypt(payload, key2)).toThrow();
        });

        it('should throw with tampered ciphertext', () => {
            const key = generateKey();
            const payload = encrypt('Secret', key);
            // Tamper with the data
            payload.data = payload.data.slice(0, -4) + 'ffff';
            expect(() => decrypt(payload, key)).toThrow();
        });

        it('should throw with tampered authTag', () => {
            const key = generateKey();
            const payload = encrypt('Secret', key);
            payload.authTag = '0'.repeat(payload.authTag.length);
            expect(() => decrypt(payload, key)).toThrow();
        });
    });
});

// ─── Sandbox (Security Context) Tests ─────────────────────────────

vi.mock('../src/config/config.js', () => ({
    loadConfig: vi.fn().mockReturnValue({
        security: {
            sandboxMode: 'host',
            allowedTools: ['shell', 'read_file', 'write_file'],
            deniedTools: ['dangerous_tool'],
            fileSystemAllowlist: ['/home/user/safe', '/tmp'],
            networkAllowlist: ['api.example.com', 'github.com'],
            shield: { enabled: true, mode: 'strict' },
            commandTimeout: 30000,
        },
        channels: {
            discord: { enabled: false, dmPolicy: 'pairing' },
        },
    }),
    configExists: vi.fn().mockReturnValue(true),
    getDefaultConfig: vi.fn(),
    resetConfigCache: vi.fn(),
}));

import {
    createSecurityContext,
    isToolAllowed,
    isPathAllowed,
    isNetworkAllowed,
    auditSecurity,
} from '../src/security/sandbox.js';

describe('Security Sandbox', () => {
    describe('createSecurityContext', () => {
        it('should create a context with correct fields', () => {
            const ctx = createSecurityContext('sess-1', 'discord', 'user-1', true);
            expect(ctx.sessionId).toBe('sess-1');
            expect(ctx.channel).toBe('discord');
            expect(ctx.userId).toBe('user-1');
            expect(ctx.isMainSession).toBe(true);
            expect(ctx.sandboxMode).toBe('host');
        });

        it('should use config sandboxMode for non-main sessions', () => {
            const ctx = createSecurityContext('sess-2', 'api', 'user-2', false);
            expect(ctx.isMainSession).toBe(false);
            expect(ctx.sandboxMode).toBe('host');
        });

        it('should populate allowed and denied tools from config', () => {
            const ctx = createSecurityContext('sess-3', 'cli', 'user-3');
            expect(ctx.allowedTools).toContain('shell');
            expect(ctx.deniedTools).toContain('dangerous_tool');
        });
    });

    describe('isToolAllowed', () => {
        it('should deny tools in the deniedTools list', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isToolAllowed('dangerous_tool', ctx)).toBe(false);
        });

        it('should allow tools in the allowedTools list', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isToolAllowed('shell', ctx)).toBe(true);
        });

        it('should deny tools not in the allowedTools list when it is non-empty', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isToolAllowed('unknown_tool_xyz', ctx)).toBe(false);
        });

        it('should allow all non-denied tools when allowedTools is empty', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            ctx.allowedTools = [];
            ctx.deniedTools = ['bad_tool'];
            expect(isToolAllowed('any_tool', ctx)).toBe(true);
            expect(isToolAllowed('bad_tool', ctx)).toBe(false);
        });
    });

    describe('isPathAllowed', () => {
        it('should allow all paths for main sessions', () => {
            const ctx = createSecurityContext('s', 'c', 'u', true);
            expect(isPathAllowed('/etc/secret', ctx)).toBe(true);
        });

        it('should check allowlist for non-main sessions', () => {
            const ctx = createSecurityContext('s', 'c', 'u', false);
            expect(isPathAllowed('/home/user/safe/file.txt', ctx)).toBe(true);
            expect(isPathAllowed('/tmp/test', ctx)).toBe(true);
        });

        it('should deny paths not in allowlist for non-main sessions', () => {
            const ctx = createSecurityContext('s', 'c', 'u', false);
            expect(isPathAllowed('/etc/passwd', ctx)).toBe(false);
        });

        it('should deny all paths when allowlist is empty for non-main sessions', () => {
            const ctx = createSecurityContext('s', 'c', 'u', false);
            ctx.fileSystemAllowlist = [];
            expect(isPathAllowed('/tmp/anything', ctx)).toBe(false);
        });

        it('should allow all paths when allowlist contains wildcard for non-main sessions', () => {
            const ctx = createSecurityContext('s', 'c', 'u', false);
            ctx.fileSystemAllowlist = ['*'];
            expect(isPathAllowed('/anything/at/all', ctx)).toBe(true);
        });
    });

    describe('isNetworkAllowed', () => {
        it('should allow URLs matching the network allowlist', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isNetworkAllowed('https://api.example.com/data', ctx)).toBe(true);
            expect(isNetworkAllowed('https://github.com/repo', ctx)).toBe(true);
        });

        it('should deny URLs not in the network allowlist', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isNetworkAllowed('https://evil.com/hack', ctx)).toBe(false);
        });

        it('should allow subdomain matches', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isNetworkAllowed('https://sub.api.example.com/path', ctx)).toBe(true);
        });

        it('should allow all when wildcard is in allowlist', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            ctx.networkAllowlist = ['*'];
            expect(isNetworkAllowed('https://anything.com', ctx)).toBe(true);
        });

        it('should deny all when allowlist is empty', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            ctx.networkAllowlist = [];
            expect(isNetworkAllowed('https://api.example.com', ctx)).toBe(false);
        });

        it('should handle invalid URLs gracefully', () => {
            const ctx = createSecurityContext('s', 'c', 'u');
            expect(isNetworkAllowed('not-a-url', ctx)).toBe(false);
        });
    });

    describe('auditSecurity', () => {
        it('should return an array of issues', () => {
            const issues = auditSecurity();
            expect(Array.isArray(issues)).toBe(true);
        });

        it('each issue should have level and message', () => {
            const issues = auditSecurity();
            for (const issue of issues) {
                expect(['info', 'warn', 'error']).toContain(issue.level);
                expect(typeof issue.message).toBe('string');
            }
        });
    });
});
