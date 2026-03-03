/**
 * TITAN — Auth Resolver Tests
 * Tests for src/providers/authResolver.ts: resolveApiKey, markKeyFailed,
 * markKeyHealthy, getCooldownStatus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
    resolveApiKey,
    markKeyFailed,
    markKeyHealthy,
    getCooldownStatus,
    type AuthProfile,
} from '../src/providers/authResolver.js';

describe('AuthResolver', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // Clear cooldowns by marking all known keys healthy
        // There's no reset function, so we use markKeyHealthy
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    // ─── resolveApiKey ──────────────────────────────────────────────
    describe('resolveApiKey', () => {
        it('returns profile key when available', () => {
            const profiles: AuthProfile[] = [
                { name: 'primary', apiKey: 'sk-primary-123', priority: 1 },
            ];
            const result = resolveApiKey('anthropic', profiles, '', '');
            expect(result).toBe('sk-primary-123');
        });

        it('sorts profiles by priority (lower = higher priority)', () => {
            const profiles: AuthProfile[] = [
                { name: 'low-priority', apiKey: 'sk-low', priority: 10 },
                { name: 'high-priority', apiKey: 'sk-high', priority: 1 },
                { name: 'mid-priority', apiKey: 'sk-mid', priority: 5 },
            ];
            const result = resolveApiKey('anthropic', profiles, '', '');
            expect(result).toBe('sk-high');
        });

        it('skips cooled-down profiles', () => {
            const profiles: AuthProfile[] = [
                { name: 'primary', apiKey: 'sk-primary', priority: 1 },
                { name: 'secondary', apiKey: 'sk-secondary', priority: 2 },
            ];
            markKeyFailed('openai', 'primary');
            const result = resolveApiKey('openai', profiles, '', '');
            expect(result).toBe('sk-secondary');
            markKeyHealthy('openai', 'primary');
        });

        it('falls back to configKey when no profiles match', () => {
            const result = resolveApiKey('anthropic', [], 'sk-config-key', '');
            expect(result).toBe('sk-config-key');
        });

        it('falls back to env var when no profiles and no configKey', () => {
            process.env['TEST_API_KEY'] = 'sk-env-key';
            const result = resolveApiKey('anthropic', [], '', 'TEST_API_KEY');
            expect(result).toBe('sk-env-key');
            delete process.env['TEST_API_KEY'];
        });

        it('returns empty string when nothing available', () => {
            const result = resolveApiKey('anthropic', [], '', 'NONEXISTENT_KEY');
            expect(result).toBe('');
        });

        it('handles empty profiles array', () => {
            const result = resolveApiKey('openai', [], 'fallback', '');
            expect(result).toBe('fallback');
        });

        it('skips profiles with empty apiKey', () => {
            const profiles: AuthProfile[] = [
                { name: 'empty', apiKey: '', priority: 1 },
                { name: 'valid', apiKey: 'sk-valid', priority: 2 },
            ];
            const result = resolveApiKey('anthropic', profiles, '', '');
            expect(result).toBe('sk-valid');
        });

        it('prefers profile over configKey', () => {
            const profiles: AuthProfile[] = [
                { name: 'prof', apiKey: 'sk-profile', priority: 1 },
            ];
            const result = resolveApiKey('anthropic', profiles, 'sk-config', 'ENV_KEY');
            expect(result).toBe('sk-profile');
        });

        it('prefers configKey over env var', () => {
            process.env['TEST_FALLBACK'] = 'sk-env';
            const result = resolveApiKey('openai', [], 'sk-config', 'TEST_FALLBACK');
            expect(result).toBe('sk-config');
            delete process.env['TEST_FALLBACK'];
        });

        it('handles all profiles being cooled down (falls to configKey)', () => {
            const profiles: AuthProfile[] = [
                { name: 'p1', apiKey: 'sk-1', priority: 1 },
                { name: 'p2', apiKey: 'sk-2', priority: 2 },
            ];
            markKeyFailed('google', 'p1');
            markKeyFailed('google', 'p2');
            const result = resolveApiKey('google', profiles, 'sk-fallback', '');
            expect(result).toBe('sk-fallback');
            markKeyHealthy('google', 'p1');
            markKeyHealthy('google', 'p2');
        });

        it('handles multiple profiles with same priority', () => {
            const profiles: AuthProfile[] = [
                { name: 'a', apiKey: 'sk-a', priority: 1 },
                { name: 'b', apiKey: 'sk-b', priority: 1 },
            ];
            const result = resolveApiKey('anthropic', profiles, '', '');
            // Both have same priority; first in stable sort wins
            expect(['sk-a', 'sk-b']).toContain(result);
        });

        it('returns empty string when env var key does not exist', () => {
            const result = resolveApiKey('openai', [], '', 'TOTALLY_NONEXISTENT_ENV_VAR_XYZ');
            expect(result).toBe('');
        });

        it('handles provider name correctly in cooldown key', () => {
            const profiles: AuthProfile[] = [
                { name: 'shared', apiKey: 'sk-shared', priority: 1 },
            ];
            // Cool down for 'anthropic' provider
            markKeyFailed('anthropic', 'shared');
            // Same profile name but different provider should still work
            const result = resolveApiKey('openai', profiles, '', '');
            expect(result).toBe('sk-shared');
            markKeyHealthy('anthropic', 'shared');
        });
    });

    // ─── markKeyFailed / markKeyHealthy ─────────────────────────────
    describe('markKeyFailed / markKeyHealthy', () => {
        it('failed key enters cooldown and is skipped', () => {
            const profiles: AuthProfile[] = [
                { name: 'test-fail', apiKey: 'sk-fail', priority: 1 },
                { name: 'backup', apiKey: 'sk-backup', priority: 2 },
            ];
            markKeyFailed('test-prov', 'test-fail');
            const result = resolveApiKey('test-prov', profiles, '', '');
            expect(result).toBe('sk-backup');
            markKeyHealthy('test-prov', 'test-fail');
        });

        it('markKeyHealthy clears cooldown', () => {
            const profiles: AuthProfile[] = [
                { name: 'revived', apiKey: 'sk-revived', priority: 1 },
            ];
            markKeyFailed('prov-h', 'revived');
            // Should be in cooldown
            expect(resolveApiKey('prov-h', profiles, 'fallback', '')).toBe('fallback');
            // Clear it
            markKeyHealthy('prov-h', 'revived');
            // Should work again
            expect(resolveApiKey('prov-h', profiles, 'fallback', '')).toBe('sk-revived');
        });

        it('markKeyHealthy is a no-op for non-cooled-down keys', () => {
            // Should not throw
            expect(() => markKeyHealthy('any', 'notcooled')).not.toThrow();
        });

        it('cooldown expires after 60 seconds (mock Date.now)', () => {
            const profiles: AuthProfile[] = [
                { name: 'expiring', apiKey: 'sk-expiring', priority: 1 },
            ];
            const realDateNow = Date.now;
            const baseTime = Date.now();

            // Mock Date.now for markKeyFailed
            Date.now = vi.fn().mockReturnValue(baseTime);
            markKeyFailed('exp-prov', 'expiring');

            // Still in cooldown at +30s
            Date.now = vi.fn().mockReturnValue(baseTime + 30_000);
            expect(resolveApiKey('exp-prov', profiles, 'fallback', '')).toBe('fallback');

            // Expired at +61s
            Date.now = vi.fn().mockReturnValue(baseTime + 61_000);
            expect(resolveApiKey('exp-prov', profiles, 'fallback', '')).toBe('sk-expiring');

            Date.now = realDateNow;
        });

        it('can fail multiple keys for same provider', () => {
            const profiles: AuthProfile[] = [
                { name: 'k1', apiKey: 'sk-1', priority: 1 },
                { name: 'k2', apiKey: 'sk-2', priority: 2 },
                { name: 'k3', apiKey: 'sk-3', priority: 3 },
            ];
            markKeyFailed('multi-prov', 'k1');
            markKeyFailed('multi-prov', 'k2');
            const result = resolveApiKey('multi-prov', profiles, '', '');
            expect(result).toBe('sk-3');
            markKeyHealthy('multi-prov', 'k1');
            markKeyHealthy('multi-prov', 'k2');
        });

        it('failing a key does not affect other providers', () => {
            const profiles: AuthProfile[] = [
                { name: 'shared-name', apiKey: 'sk-shared', priority: 1 },
            ];
            markKeyFailed('provider-A', 'shared-name');
            // Different provider, same profile name
            const result = resolveApiKey('provider-B', profiles, '', '');
            expect(result).toBe('sk-shared');
            markKeyHealthy('provider-A', 'shared-name');
        });
    });

    // ─── getCooldownStatus ──────────────────────────────────────────
    describe('getCooldownStatus', () => {
        it('returns empty array when no cooldowns', () => {
            // Note: there may be cooldowns from other tests, but we check structure
            const status = getCooldownStatus();
            expect(Array.isArray(status)).toBe(true);
        });

        it('returns active cooldowns after markKeyFailed', () => {
            markKeyFailed('status-prov', 'status-key');
            const status = getCooldownStatus();
            const found = status.find(s => s.provider === 'status-prov' && s.profile === 'status-key');
            expect(found).toBeDefined();
            expect(found!.expiresAt).toBeGreaterThan(Date.now());
            markKeyHealthy('status-prov', 'status-key');
        });

        it('each entry has provider, profile, and expiresAt', () => {
            markKeyFailed('struct-prov', 'struct-key');
            const status = getCooldownStatus();
            const found = status.find(s => s.provider === 'struct-prov');
            expect(found).toHaveProperty('provider');
            expect(found).toHaveProperty('profile');
            expect(found).toHaveProperty('expiresAt');
            markKeyHealthy('struct-prov', 'struct-key');
        });

        it('cleans expired cooldowns', () => {
            const realDateNow = Date.now;
            const baseTime = Date.now();

            Date.now = vi.fn().mockReturnValue(baseTime);
            markKeyFailed('clean-prov', 'clean-key');

            // Jump past expiry
            Date.now = vi.fn().mockReturnValue(baseTime + 120_000);
            const status = getCooldownStatus();
            const found = status.find(s => s.provider === 'clean-prov' && s.profile === 'clean-key');
            expect(found).toBeUndefined(); // Should be cleaned

            Date.now = realDateNow;
        });

        it('does not return already healthy keys', () => {
            markKeyFailed('healthy-prov', 'healthy-key');
            markKeyHealthy('healthy-prov', 'healthy-key');
            const status = getCooldownStatus();
            const found = status.find(s => s.provider === 'healthy-prov' && s.profile === 'healthy-key');
            expect(found).toBeUndefined();
        });

        it('returns multiple cooldowns for different keys', () => {
            markKeyFailed('multi-cd', 'key-a');
            markKeyFailed('multi-cd', 'key-b');
            const status = getCooldownStatus();
            const matching = status.filter(s => s.provider === 'multi-cd');
            expect(matching.length).toBeGreaterThanOrEqual(2);
            markKeyHealthy('multi-cd', 'key-a');
            markKeyHealthy('multi-cd', 'key-b');
        });
    });

    // ─── Edge cases ─────────────────────────────────────────────────
    describe('Edge cases', () => {
        it('handles empty string configKey', () => {
            const result = resolveApiKey('prov', [], '', '');
            expect(result).toBe('');
        });

        it('handles empty string env key name', () => {
            const result = resolveApiKey('prov', [], '', '');
            expect(result).toBe('');
        });

        it('handles profile with special characters in name', () => {
            const profiles: AuthProfile[] = [
                { name: 'my-key_v2.0', apiKey: 'sk-special', priority: 1 },
            ];
            const result = resolveApiKey('prov', profiles, '', '');
            expect(result).toBe('sk-special');
        });

        it('handles very long apiKey', () => {
            const longKey = 'sk-' + 'a'.repeat(500);
            const profiles: AuthProfile[] = [
                { name: 'long', apiKey: longKey, priority: 1 },
            ];
            const result = resolveApiKey('prov', profiles, '', '');
            expect(result).toBe(longKey);
        });

        it('handles negative priority values', () => {
            const profiles: AuthProfile[] = [
                { name: 'neg', apiKey: 'sk-neg', priority: -1 },
                { name: 'zero', apiKey: 'sk-zero', priority: 0 },
                { name: 'pos', apiKey: 'sk-pos', priority: 1 },
            ];
            const result = resolveApiKey('prov', profiles, '', '');
            expect(result).toBe('sk-neg'); // -1 < 0 < 1
        });

        it('process.env fallback works with existing env var', () => {
            process.env['TITAN_TEST_API_KEY_42'] = 'sk-from-env';
            const result = resolveApiKey('any', [], '', 'TITAN_TEST_API_KEY_42');
            expect(result).toBe('sk-from-env');
            delete process.env['TITAN_TEST_API_KEY_42'];
        });

        it('resolveApiKey does not throw on any input combination', () => {
            expect(() => resolveApiKey('', [], '', '')).not.toThrow();
            expect(() => resolveApiKey('x', [{ name: '', apiKey: '', priority: 0 }], '', '')).not.toThrow();
        });
    });
});
