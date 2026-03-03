/**
 * TITAN — Encryption Extended Tests
 * Additional edge case tests for src/security/encryption.ts beyond what
 * tests/security.test.ts already covers.
 *
 * Existing coverage in security.test.ts:
 * - generateKey: 32-byte buffer, unique keys
 * - encrypt: returns payload, different ciphertext for same plaintext, hex key, invalid key length
 * - decrypt: roundtrip, empty strings, unicode, wrong key, tampered ciphertext, tampered authTag
 *
 * This file covers ADDITIONAL scenarios.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateKey, encrypt, decrypt, type EncryptedPayload } from '../src/security/encryption.js';

describe('Encryption — Extended Tests', () => {
    // ─── generateKey — additional ───────────────────────────────────
    describe('generateKey — additional', () => {
        it('generates cryptographically random keys (statistical test)', () => {
            const keys = Array.from({ length: 20 }, () => generateKey());
            // All should be unique
            const hexKeys = keys.map(k => k.toString('hex'));
            const uniqueKeys = new Set(hexKeys);
            expect(uniqueKeys.size).toBe(20);
        });

        it('generated key is immediately usable for encrypt/decrypt', () => {
            const key = generateKey();
            const payload = encrypt('test', key);
            const result = decrypt(payload, key);
            expect(result).toBe('test');
        });

        it('generates keys that are all 32 bytes consistently', () => {
            for (let i = 0; i < 10; i++) {
                const key = generateKey();
                expect(key.length).toBe(32);
            }
        });

        it('keys have high entropy (not all same byte)', () => {
            const key = generateKey();
            const bytes = Array.from(key);
            const uniqueBytes = new Set(bytes);
            // With 32 random bytes, we expect many unique values
            expect(uniqueBytes.size).toBeGreaterThan(5);
        });

        it('key is a Buffer instance', () => {
            const key = generateKey();
            expect(Buffer.isBuffer(key)).toBe(true);
        });
    });

    // ─── encrypt — additional ───────────────────────────────────────
    describe('encrypt — additional', () => {
        it('handles very long strings (10KB+)', () => {
            const key = generateKey();
            const longText = 'A'.repeat(10240); // 10KB
            const payload = encrypt(longText, key);
            expect(payload.data.length).toBeGreaterThan(0);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(longText);
        });

        it('handles special characters: newlines', () => {
            const key = generateKey();
            const text = 'line1\nline2\nline3\n';
            const payload = encrypt(text, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(text);
        });

        it('handles special characters: null bytes', () => {
            const key = generateKey();
            const text = 'before\0after';
            const payload = encrypt(text, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(text);
        });

        it('handles special characters: tabs', () => {
            const key = generateKey();
            const text = 'col1\tcol2\tcol3';
            const payload = encrypt(text, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(text);
        });

        it('handles JSON strings', () => {
            const key = generateKey();
            const json = JSON.stringify({ name: 'TITAN', version: '2026.5.0', nested: { key: 'value' } });
            const payload = encrypt(json, key);
            const decrypted = decrypt(payload, key);
            expect(JSON.parse(decrypted)).toEqual(JSON.parse(json));
        });

        it('produces different ciphertext each time due to random IV', () => {
            const key = generateKey();
            const results = Array.from({ length: 5 }, () => encrypt('same text', key));
            const datas = results.map(r => r.data);
            const uniqueDatas = new Set(datas);
            expect(uniqueDatas.size).toBe(5);
        });

        it('produces different IVs each time', () => {
            const key = generateKey();
            const results = Array.from({ length: 5 }, () => encrypt('same text', key));
            const ivs = results.map(r => r.iv);
            const uniqueIvs = new Set(ivs);
            expect(uniqueIvs.size).toBe(5);
        });

        it('encrypted data length scales with plaintext length', () => {
            const key = generateKey();
            const short = encrypt('hi', key);
            const long = encrypt('a'.repeat(10000), key);
            expect(long.data.length).toBeGreaterThan(short.data.length);
        });

        it('accepts hex string key', () => {
            const keyBuf = generateKey();
            const hexKey = keyBuf.toString('hex');
            const payload = encrypt('hex key test', hexKey);
            expect(payload.data.length).toBeGreaterThan(0);
            // Should also decrypt with hex key
            const result = decrypt(payload, hexKey);
            expect(result).toBe('hex key test');
        });

        it('accepts Buffer key', () => {
            const key = generateKey();
            const payload = encrypt('buffer key test', key);
            expect(payload.data.length).toBeGreaterThan(0);
        });

        it('throws with descriptive error for wrong key length (Buffer)', () => {
            const badKey = Buffer.alloc(16);
            expect(() => encrypt('test', badKey)).toThrow();
        });

        it('throws with descriptive error for wrong key length (hex string)', () => {
            const badHex = 'ab'.repeat(16); // 16 bytes as hex
            expect(() => encrypt('test', badHex)).toThrow();
        });

        it('handles multiline text with mixed line endings', () => {
            const key = generateKey();
            const text = 'line1\r\nline2\nline3\rline4';
            const payload = encrypt(text, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(text);
        });
    });

    // ─── decrypt — additional ───────────────────────────────────────
    describe('decrypt — additional', () => {
        it('roundtrip with JSON content preserves structure', () => {
            const key = generateKey();
            const obj = { users: [{ id: 1 }, { id: 2 }], meta: { total: 2 } };
            const json = JSON.stringify(obj);
            const payload = encrypt(json, key);
            const decrypted = decrypt(payload, key);
            expect(JSON.parse(decrypted)).toEqual(obj);
        });

        it('roundtrip with multiline content', () => {
            const key = generateKey();
            const text = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${'data'.repeat(10)}`).join('\n');
            const payload = encrypt(text, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(text);
        });

        it('throws descriptive error for short key (Buffer)', () => {
            const key = generateKey();
            const payload = encrypt('test', key);
            const shortKey = Buffer.alloc(8);
            expect(() => decrypt(payload, shortKey)).toThrow();
        });

        it('throws descriptive error for short key (hex string)', () => {
            const key = generateKey();
            const payload = encrypt('test', key);
            const shortHex = 'aa'.repeat(8); // 8 bytes
            expect(() => decrypt(payload, shortHex)).toThrow();
        });

        it('throws for tampered IV', () => {
            const key = generateKey();
            const payload = encrypt('test', key);
            // Tamper with IV by replacing first chars
            const tampered: EncryptedPayload = {
                ...payload,
                iv: 'ff' + payload.iv.slice(2),
            };
            // May or may not throw depending on whether the modified IV produces valid GCM
            // But authentication should fail
            expect(() => decrypt(tampered, key)).toThrow();
        });

        it('handles maximum-length payloads', () => {
            const key = generateKey();
            // 100KB payload
            const text = 'X'.repeat(100_000);
            const payload = encrypt(text, key);
            const decrypted = decrypt(payload, key);
            expect(decrypted).toBe(text);
            expect(decrypted.length).toBe(100_000);
        });

        it('decrypt with hex key produces same result as Buffer key', () => {
            const keyBuf = generateKey();
            const hexKey = keyBuf.toString('hex');
            const payload = encrypt('crossover test', keyBuf);
            const result1 = decrypt(payload, keyBuf);
            const result2 = decrypt(payload, hexKey);
            expect(result1).toBe(result2);
            expect(result1).toBe('crossover test');
        });

        it('throws for completely invalid payload data', () => {
            const key = generateKey();
            const badPayload: EncryptedPayload = {
                iv: 'not-valid-hex',
                authTag: 'also-not-valid',
                data: 'garbage-data',
            };
            expect(() => decrypt(badPayload, key)).toThrow();
        });

        it('throws for empty IV', () => {
            const key = generateKey();
            const payload = encrypt('test', key);
            expect(() => decrypt({ ...payload, iv: '' }, key)).toThrow();
        });

        it('throws for empty authTag', () => {
            const key = generateKey();
            const payload = encrypt('test', key);
            expect(() => decrypt({ ...payload, authTag: '' }, key)).toThrow();
        });
    });

    // ─── Integration ────────────────────────────────────────────────
    describe('Integration', () => {
        it('full CRUD cycle: encrypt->decrypt repeated', () => {
            const key = generateKey();
            const texts = ['First message', 'Second message', 'Third message'];
            for (const text of texts) {
                const payload = encrypt(text, key);
                const result = decrypt(payload, key);
                expect(result).toBe(text);
            }
        });

        it('key rotation: encrypt with key1, must use key1 to decrypt', () => {
            const key1 = generateKey();
            const key2 = generateKey();
            const payload = encrypt('secret data', key1);
            // Must use key1
            expect(decrypt(payload, key1)).toBe('secret data');
            // key2 should fail
            expect(() => decrypt(payload, key2)).toThrow();
        });

        it('different keys produce different ciphertext for same plaintext', () => {
            const key1 = generateKey();
            const key2 = generateKey();
            const p1 = encrypt('same text', key1);
            const p2 = encrypt('same text', key2);
            // Different keys produce different data (virtually certain)
            expect(p1.data).not.toBe(p2.data);
        });

        it('can encrypt and decrypt very diverse content types', () => {
            const key = generateKey();
            const contents = [
                '',
                ' ',
                'Simple ASCII',
                '\u00e9\u00e8\u00ea\u00eb', // French accents
                '\u4f60\u597d\u4e16\u754c', // Chinese
                '\ud83d\ude80\ud83c\udf1f\u2728', // Emojis
                '{"json": true}',
                '<html><body>HTML</body></html>',
                'line1\nline2\rline3\r\nline4',
                'a'.repeat(50000),
            ];
            for (const content of contents) {
                const payload = encrypt(content, key);
                const decrypted = decrypt(payload, key);
                expect(decrypted).toBe(content);
            }
        });

        it('hex key and buffer key are interchangeable', () => {
            const keyBuf = generateKey();
            const hexKey = keyBuf.toString('hex');

            // Encrypt with buffer, decrypt with hex
            const p1 = encrypt('test1', keyBuf);
            expect(decrypt(p1, hexKey)).toBe('test1');

            // Encrypt with hex, decrypt with buffer
            const p2 = encrypt('test2', hexKey);
            expect(decrypt(p2, keyBuf)).toBe('test2');
        });
    });
});
