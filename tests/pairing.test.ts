/**
 * TITAN — Pairing Manager Tests
 * Tests security/pairing.ts: DM pairing for secure inbound messaging
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
    isUserApproved,
    createPairingRequest,
    approvePairing,
    denyPairing,
    listPendingPairings,
    listApprovedUsers,
} from '../src/security/pairing.js';

describe('Pairing Manager', () => {
    describe('createPairingRequest', () => {
        it('should return an 8-character uppercase hex code', () => {
            const code = createPairingRequest('discord', 'user-1', 'Alice');
            expect(code).toHaveLength(8);
            expect(code).toMatch(/^[0-9A-F]{8}$/);
        });

        it('should return unique codes for each request', () => {
            const code1 = createPairingRequest('discord', 'user-2', 'Bob');
            const code2 = createPairingRequest('discord', 'user-3', 'Charlie');
            expect(code1).not.toBe(code2);
        });

        it('should work without a userName', () => {
            const code = createPairingRequest('telegram', 'user-4');
            expect(code).toHaveLength(8);
        });
    });

    describe('isUserApproved', () => {
        it('should return false for unapproved users', () => {
            expect(isUserApproved('discord', 'unknown-user')).toBe(false);
        });

        it('should return false for non-existent channel', () => {
            expect(isUserApproved('nonexistent-channel', 'user-1')).toBe(false);
        });

        it('should return true after approval', () => {
            const code = createPairingRequest('test-channel-1', 'approved-user-1', 'Test');
            approvePairing('test-channel-1', code);
            expect(isUserApproved('test-channel-1', 'approved-user-1')).toBe(true);
        });
    });

    describe('approvePairing', () => {
        it('should approve a valid pairing code', () => {
            const code = createPairingRequest('discord', 'user-approve-1', 'TestUser');
            const result = approvePairing('discord', code);
            expect(result.success).toBe(true);
            expect(result.message).toContain('Approved');
            expect(result.message).toContain('TestUser');
        });

        it('should fail for an unknown pairing code', () => {
            const result = approvePairing('discord', 'BADCODE1');
            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
        });

        it('should fail when channel does not match', () => {
            const code = createPairingRequest('discord', 'user-approve-2', 'TestUser2');
            const result = approvePairing('telegram', code);
            expect(result.success).toBe(false);
            expect(result.message).toContain('discord');
            expect(result.message).toContain('telegram');
        });

        it('should fail when pairing is already approved', () => {
            const code = createPairingRequest('discord', 'user-approve-3', 'TestUser3');
            approvePairing('discord', code);
            const result = approvePairing('discord', code);
            expect(result.success).toBe(false);
            expect(result.message).toContain('already approved');
        });

        it('should add user to approved users set', () => {
            const code = createPairingRequest('test-chan-2', 'user-approve-4', 'TestUser4');
            approvePairing('test-chan-2', code);
            expect(isUserApproved('test-chan-2', 'user-approve-4')).toBe(true);
        });

        it('should use userId when userName is not provided', () => {
            const code = createPairingRequest('discord', 'user-no-name');
            const result = approvePairing('discord', code);
            expect(result.success).toBe(true);
            expect(result.message).toContain('user-no-name');
        });
    });

    describe('denyPairing', () => {
        it('should deny a valid pairing code', () => {
            const code = createPairingRequest('discord', 'user-deny-1', 'DenyUser');
            const result = denyPairing(code);
            expect(result.success).toBe(true);
            expect(result.message).toContain('Denied');
            expect(result.message).toContain('DenyUser');
        });

        it('should fail for an unknown code', () => {
            const result = denyPairing('ZZZZZZZZ');
            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
        });

        it('should use userId when userName is not provided', () => {
            const code = createPairingRequest('discord', 'user-deny-no-name');
            const result = denyPairing(code);
            expect(result.success).toBe(true);
            expect(result.message).toContain('user-deny-no-name');
        });
    });

    describe('listPendingPairings', () => {
        it('should return only pending requests', () => {
            const code1 = createPairingRequest('discord', 'pending-1', 'Pending1');
            const code2 = createPairingRequest('discord', 'pending-2', 'Pending2');
            // Approve one
            approvePairing('discord', code1);
            const pending = listPendingPairings();
            const pendingIds = pending.map(p => p.userId);
            expect(pendingIds).toContain('pending-2');
            expect(pendingIds).not.toContain('pending-1');
        });

        it('should not include denied requests', () => {
            const code = createPairingRequest('discord', 'denied-check', 'DeniedCheck');
            denyPairing(code);
            const pending = listPendingPairings();
            const ids = pending.map(p => p.userId);
            expect(ids).not.toContain('denied-check');
        });
    });

    describe('listApprovedUsers', () => {
        it('should return all approved users across channels', () => {
            const code1 = createPairingRequest('chan-a', 'approved-list-1', 'User1');
            approvePairing('chan-a', code1);
            const code2 = createPairingRequest('chan-b', 'approved-list-2', 'User2');
            approvePairing('chan-b', code2);
            const approved = listApprovedUsers();
            expect(approved.some(u => u.channel === 'chan-a' && u.userId === 'approved-list-1')).toBe(true);
            expect(approved.some(u => u.channel === 'chan-b' && u.userId === 'approved-list-2')).toBe(true);
        });

        it('should return correct structure', () => {
            const approved = listApprovedUsers();
            for (const entry of approved) {
                expect(entry).toHaveProperty('channel');
                expect(entry).toHaveProperty('userId');
            }
        });
    });
});
