/**
 * TITAN — Encryption Module
 * Provides E2E encryption for sensitive sessions using AES-256-GCM.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import logger from '../utils/logger.js';

const COMPONENT = 'Encryption';
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedPayload {
    iv: string;
    authTag: string;
    data: string;
}

/**
 * Generates a strong 256-bit encryption key securely.
 */
export function generateKey(): Buffer {
    return randomBytes(32);
}

/**
 * Encrypts a string of text using AES-256-GCM.
 * @param text The plaintext to encrypt
 * @param key The 32-byte encryption key
 */
export function encrypt(text: string, key: Buffer | string): EncryptedPayload {
    try {
        const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
        if (keyBuffer.length !== 32) {
            throw new Error('Encryption key must be exactly 32 bytes (256 bits).');
        }

        const iv = randomBytes(16);
        const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');

        return {
            iv: iv.toString('hex'),
            authTag,
            data: encrypted
        };
    } catch (e: unknown) {
        logger.error(COMPONENT, `Encryption failed: ${e instanceof Error ? e.message : String(e)}`);
        throw new Error('Failed to encrypt session data.');
    }
}

/**
 * Decrypts an EncryptedPayload back into plaintext text using AES-256-GCM.
 * @param payload The encrypted payload object (iv, authTag, data)
 * @param key The 32-byte encryption key
 */
export function decrypt(payload: EncryptedPayload, key: Buffer | string): string {
    try {
        const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
        if (keyBuffer.length !== 32) {
            throw new Error('Decryption key must be exactly 32 bytes (256 bits).');
        }

        const decipher = createDecipheriv(ALGORITHM, keyBuffer, Buffer.from(payload.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

        let decrypted = decipher.update(payload.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e: unknown) {
        logger.error(COMPONENT, `Decryption failed: ${e instanceof Error ? e.message : String(e)}`);
        throw new Error('Failed to decrypt session data. Invalid key or corrupted payload.');
    }
}
