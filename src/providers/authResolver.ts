/**
 * TITAN — Auth Profile Resolver
 * Supports multiple API keys per provider with automatic failover.
 * Priority chain: auth profiles (sorted by priority, skip cooled-down) > config apiKey > env var
 */
import logger from '../utils/logger.js';
import { getSecret, isVaultUnlocked } from '../security/secrets.js';

const COMPONENT = 'AuthResolver';

export interface AuthProfile {
    name: string;
    apiKey: string;
    priority: number;
}

/** Cooldown tracking — keys that failed recently */
const cooldowns: Map<string, number> = new Map();
const COOLDOWN_MS = 60_000; // 60 seconds

/** Build a cooldown key from provider + profile name */
function cooldownKey(provider: string, profileName: string): string {
    return `${provider}:${profileName}`;
}

/**
 * Resolve the best API key for a provider.
 * Priority: auth profiles (sorted by priority, skip cooled-down) > config apiKey > env var
 */
export function resolveApiKey(
    providerName: string,
    profiles: AuthProfile[],
    configKey: string,
    envKey: string,
): string {
    const now = Date.now();

    // Try auth profiles sorted by priority (lower = higher priority)
    if (profiles.length > 0) {
        const sorted = [...profiles].sort((a, b) => a.priority - b.priority);
        for (const profile of sorted) {
            const key = cooldownKey(providerName, profile.name);
            const cooldownUntil = cooldowns.get(key);
            if (cooldownUntil && now < cooldownUntil) {
                logger.debug(COMPONENT, `Skipping cooled-down key: ${providerName}/${profile.name}`);
                continue;
            }
            if (profile.apiKey) {
                logger.debug(COMPONENT, `Using auth profile: ${providerName}/${profile.name}`);
                return profile.apiKey;
            }
        }
    }

    // Resolve vault references
    if (configKey && configKey.startsWith('$VAULT:')) {
        const secretName = configKey.slice(7);
        if (isVaultUnlocked()) {
            const vaultValue = getSecret(secretName);
            if (vaultValue) {
                logger.debug(COMPONENT, `Resolved vault reference: $VAULT:${secretName}`);
                return vaultValue;
            }
        }
        logger.warn(COMPONENT, `Vault reference $VAULT:${secretName} could not be resolved (vault locked or secret not found)`);
    }

    // Fallback to config key
    if (configKey) return configKey;

    // Fallback to env var
    const envVal = process.env[envKey];
    if (envVal) return envVal;

    return '';
}

/** Mark a key as failed — enters 60s cooldown */
export function markKeyFailed(provider: string, profileName: string): void {
    const key = cooldownKey(provider, profileName);
    cooldowns.set(key, Date.now() + COOLDOWN_MS);
    logger.warn(COMPONENT, `Key cooled down: ${provider}/${profileName} (60s)`);
}

/** Mark a key as healthy — clear cooldown */
export function markKeyHealthy(provider: string, profileName: string): void {
    const key = cooldownKey(provider, profileName);
    if (cooldowns.has(key)) {
        cooldowns.delete(key);
        logger.debug(COMPONENT, `Cooldown cleared: ${provider}/${profileName}`);
    }
}

/** Get cooldown status for monitoring */
export function getCooldownStatus(): Array<{ provider: string; profile: string; expiresAt: number }> {
    const now = Date.now();
    const active: Array<{ provider: string; profile: string; expiresAt: number }> = [];
    for (const [key, expiresAt] of cooldowns) {
        if (now < expiresAt) {
            const [provider, profile] = key.split(':');
            active.push({ provider, profile, expiresAt });
        } else {
            cooldowns.delete(key);
        }
    }
    return active;
}
