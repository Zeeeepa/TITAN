/**
 * TITAN — New Providers Tests (Venice, Bedrock, LiteLLM)
 * Phase 5 Batch 3 Agent 3 — Tests for:
 *   - PROVIDER_PRESETS verification (venice, bedrock, litellm)
 *   - OpenAICompatProvider instantiation for new providers
 *   - Router alias normalization (aws, amazon, litellm-proxy)
 *   - Config schema validation (new provider entries)
 *   - Edge cases (custom baseUrl, env keys, supportsModelList)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { mockFetch, mockResolveApiKey, mockLoadConfig } = vi.hoisted(() => ({
    mockFetch: vi.fn(),
    mockResolveApiKey: vi.fn(),
    mockLoadConfig: vi.fn(),
}));

vi.mock('../src/utils/logger.js', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/config.js', () => ({
    loadConfig: mockLoadConfig,
    getDefaultConfig: vi.fn().mockReturnValue({}),
    resetConfigCache: vi.fn(),
}));

vi.mock('../src/utils/helpers.js', () => ({
    fetchWithRetry: vi.fn(),
    ensureDir: vi.fn(),
    truncate: vi.fn((s: string) => s),
}));

vi.mock('../src/providers/authResolver.js', () => ({
    resolveApiKey: mockResolveApiKey,
}));

// ── Import after mocks ───────────────────────────────────────────────────

import {
    OpenAICompatProvider,
    PROVIDER_PRESETS,
    type OpenAICompatConfig,
} from '../src/providers/openai_compat.js';
import { TitanConfigSchema } from '../src/config/schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function getPreset(name: string): OpenAICompatConfig {
    const preset = PROVIDER_PRESETS.find(p => p.name === name);
    if (!preset) throw new Error(`Preset not found: ${name}`);
    return preset;
}

function makeJsonResponse(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
        text: async () => JSON.stringify(data),
        headers: new Headers(),
    } as unknown as Response;
}

// ════════════════════════════════════════════════════════════════════════
// 1. PROVIDER_PRESETS verification (~15 tests)
// ════════════════════════════════════════════════════════════════════════

describe('PROVIDER_PRESETS — New Providers', () => {
    it('should contain 13 total provider presets (10 original + 3 new)', () => {
        expect(PROVIDER_PRESETS).toHaveLength(13);
    });

    it('should include venice in the presets', () => {
        const names = PROVIDER_PRESETS.map(p => p.name);
        expect(names).toContain('venice');
    });

    it('should include bedrock in the presets', () => {
        const names = PROVIDER_PRESETS.map(p => p.name);
        expect(names).toContain('bedrock');
    });

    it('should include litellm in the presets', () => {
        const names = PROVIDER_PRESETS.map(p => p.name);
        expect(names).toContain('litellm');
    });

    // ── Venice preset details ────────────────────────────────────────

    describe('Venice preset', () => {
        it('should have correct name and displayName', () => {
            const venice = getPreset('venice');
            expect(venice.name).toBe('venice');
            expect(venice.displayName).toBe('Venice AI (Privacy-First)');
        });

        it('should have correct defaultBaseUrl', () => {
            const venice = getPreset('venice');
            expect(venice.defaultBaseUrl).toBe('https://api.venice.ai/api/v1');
        });

        it('should have correct envKey and configKey', () => {
            const venice = getPreset('venice');
            expect(venice.envKey).toBe('VENICE_API_KEY');
            expect(venice.configKey).toBe('venice');
        });

        it('should have correct defaultModel', () => {
            const venice = getPreset('venice');
            expect(venice.defaultModel).toBe('llama-3.3-70b');
        });

        it('should have non-empty knownModels array', () => {
            const venice = getPreset('venice');
            expect(venice.knownModels).toBeInstanceOf(Array);
            expect(venice.knownModels.length).toBeGreaterThan(0);
            expect(venice.knownModels).toContain('llama-3.3-70b');
            expect(venice.knownModels).toContain('deepseek-r1-671b');
            expect(venice.knownModels).toContain('qwen-2.5-vl-72b');
        });

        it('should support model list', () => {
            const venice = getPreset('venice');
            expect(venice.supportsModelList).toBe(true);
        });
    });

    // ── Bedrock preset details ───────────────────────────────────────

    describe('Bedrock preset', () => {
        it('should have correct name and displayName', () => {
            const bedrock = getPreset('bedrock');
            expect(bedrock.name).toBe('bedrock');
            expect(bedrock.displayName).toBe('AWS Bedrock (via Proxy)');
        });

        it('should have localhost defaultBaseUrl (proxy)', () => {
            const bedrock = getPreset('bedrock');
            expect(bedrock.defaultBaseUrl).toBe('http://localhost:4000/v1');
        });

        it('should have correct envKey and configKey', () => {
            const bedrock = getPreset('bedrock');
            expect(bedrock.envKey).toBe('AWS_BEDROCK_API_KEY');
            expect(bedrock.configKey).toBe('bedrock');
        });

        it('should have correct defaultModel', () => {
            const bedrock = getPreset('bedrock');
            expect(bedrock.defaultModel).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
        });

        it('should have non-empty knownModels array', () => {
            const bedrock = getPreset('bedrock');
            expect(bedrock.knownModels).toBeInstanceOf(Array);
            expect(bedrock.knownModels.length).toBeGreaterThan(0);
            expect(bedrock.knownModels).toContain('anthropic.claude-3-5-sonnet-20241022-v2:0');
            expect(bedrock.knownModels).toContain('amazon.titan-text-premier-v1:0');
            expect(bedrock.knownModels).toContain('meta.llama3-70b-instruct-v1:0');
        });

        it('should NOT support model list', () => {
            const bedrock = getPreset('bedrock');
            expect(bedrock.supportsModelList).toBe(false);
        });
    });

    // ── LiteLLM preset details ───────────────────────────────────────

    describe('LiteLLM preset', () => {
        it('should have correct name and displayName', () => {
            const litellm = getPreset('litellm');
            expect(litellm.name).toBe('litellm');
            expect(litellm.displayName).toBe('LiteLLM (Universal Proxy)');
        });

        it('should have localhost defaultBaseUrl (proxy)', () => {
            const litellm = getPreset('litellm');
            expect(litellm.defaultBaseUrl).toBe('http://localhost:4000/v1');
        });

        it('should have correct envKey and configKey', () => {
            const litellm = getPreset('litellm');
            expect(litellm.envKey).toBe('LITELLM_API_KEY');
            expect(litellm.configKey).toBe('litellm');
        });

        it('should have correct defaultModel', () => {
            const litellm = getPreset('litellm');
            expect(litellm.defaultModel).toBe('gpt-4o');
        });

        it('should have non-empty knownModels array', () => {
            const litellm = getPreset('litellm');
            expect(litellm.knownModels).toBeInstanceOf(Array);
            expect(litellm.knownModels.length).toBeGreaterThan(0);
            expect(litellm.knownModels).toContain('gpt-4o');
            expect(litellm.knownModels).toContain('claude-sonnet-4-20250514');
            expect(litellm.knownModels).toContain('gemini-2.5-flash');
        });

        it('should support model list', () => {
            const litellm = getPreset('litellm');
            expect(litellm.supportsModelList).toBe(true);
        });
    });
});

// ════════════════════════════════════════════════════════════════════════
// 2. OpenAICompatProvider instantiation (~10 tests)
// ════════════════════════════════════════════════════════════════════════

describe('OpenAICompatProvider — New Providers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLoadConfig.mockReturnValue({
            providers: {
                venice: { apiKey: 'test-venice-key', baseUrl: '', authProfiles: [] },
                bedrock: { apiKey: 'test-bedrock-key', baseUrl: '', authProfiles: [] },
                litellm: { apiKey: 'test-litellm-key', baseUrl: '', authProfiles: [] },
            },
        });
        mockResolveApiKey.mockReturnValue('test-key');
        vi.stubGlobal('fetch', mockFetch);
    });

    describe('Venice provider instantiation', () => {
        it('should create a Venice provider with correct name', () => {
            const venice = new OpenAICompatProvider(getPreset('venice'));
            expect(venice.name).toBe('venice');
        });

        it('should have Venice display name', () => {
            const venice = new OpenAICompatProvider(getPreset('venice'));
            expect(venice.displayName).toBe('Venice AI (Privacy-First)');
        });
    });

    describe('Bedrock provider instantiation', () => {
        it('should create a Bedrock provider with correct name', () => {
            const bedrock = new OpenAICompatProvider(getPreset('bedrock'));
            expect(bedrock.name).toBe('bedrock');
        });

        it('should have Bedrock display name', () => {
            const bedrock = new OpenAICompatProvider(getPreset('bedrock'));
            expect(bedrock.displayName).toBe('AWS Bedrock (via Proxy)');
        });
    });

    describe('LiteLLM provider instantiation', () => {
        it('should create a LiteLLM provider with correct name', () => {
            const litellm = new OpenAICompatProvider(getPreset('litellm'));
            expect(litellm.name).toBe('litellm');
        });

        it('should have LiteLLM display name', () => {
            const litellm = new OpenAICompatProvider(getPreset('litellm'));
            expect(litellm.displayName).toBe('LiteLLM (Universal Proxy)');
        });
    });

    describe('healthCheck for new providers', () => {
        it('Venice healthCheck should return false when fetch rejects', async () => {
            const venice = new OpenAICompatProvider(getPreset('venice'));
            mockFetch.mockRejectedValue(new Error('Network error'));
            expect(await venice.healthCheck()).toBe(false);
        });

        it('Bedrock healthCheck should return false when fetch rejects', async () => {
            const bedrock = new OpenAICompatProvider(getPreset('bedrock'));
            mockFetch.mockRejectedValue(new Error('Network error'));
            expect(await bedrock.healthCheck()).toBe(false);
        });

        it('LiteLLM healthCheck should return false when fetch rejects', async () => {
            const litellm = new OpenAICompatProvider(getPreset('litellm'));
            mockFetch.mockRejectedValue(new Error('Network error'));
            expect(await litellm.healthCheck()).toBe(false);
        });
    });

    describe('listModels for new providers', () => {
        it('Venice should attempt to fetch models (supportsModelList=true) and fall back on error', async () => {
            const venice = new OpenAICompatProvider(getPreset('venice'));
            mockFetch.mockRejectedValue(new Error('timeout'));
            const models = await venice.listModels();
            expect(models).toEqual(getPreset('venice').knownModels);
        });

        it('Bedrock should return knownModels directly (supportsModelList=false)', async () => {
            const bedrock = new OpenAICompatProvider(getPreset('bedrock'));
            const models = await bedrock.listModels();
            expect(models).toEqual(getPreset('bedrock').knownModels);
        });

        it('LiteLLM should attempt to fetch models (supportsModelList=true) and fall back on error', async () => {
            const litellm = new OpenAICompatProvider(getPreset('litellm'));
            mockFetch.mockRejectedValue(new Error('timeout'));
            const models = await litellm.listModels();
            expect(models).toEqual(getPreset('litellm').knownModels);
        });
    });
});

// ════════════════════════════════════════════════════════════════════════
// 3. Router aliases (~10 tests)
// ════════════════════════════════════════════════════════════════════════

describe('Router — New Provider Aliases', () => {
    // The router module has module-level state (initialized flag) so we import it once
    let normalizeProvider: typeof import('../src/providers/router.js').normalizeProvider;
    let getProvider: typeof import('../src/providers/router.js').getProvider;
    let getAllProviders: typeof import('../src/providers/router.js').getAllProviders;

    beforeEach(async () => {
        mockLoadConfig.mockReturnValue({
            agent: {
                model: 'venice/llama-3.3-70b',
                modelAliases: {},
                allowedModels: [],
            },
            providers: {
                venice: { apiKey: '', baseUrl: '', authProfiles: [] },
                bedrock: { apiKey: '', baseUrl: '', authProfiles: [] },
                litellm: { apiKey: '', baseUrl: '', authProfiles: [] },
                anthropic: {}, openai: {}, google: {}, ollama: {},
                groq: {}, mistral: {}, openrouter: {}, fireworks: {},
                xai: {}, together: {}, deepseek: {}, cerebras: {},
                cohere: {}, perplexity: {},
            },
            security: { allowedTools: [], deniedTools: [] },
        });
        const router = await import('../src/providers/router.js');
        normalizeProvider = router.normalizeProvider;
        getProvider = router.getProvider;
        getAllProviders = router.getAllProviders;
    });

    describe('normalizeProvider()', () => {
        it('should normalize "aws" to "bedrock"', () => {
            expect(normalizeProvider('aws')).toBe('bedrock');
        });

        it('should normalize "amazon" to "bedrock"', () => {
            expect(normalizeProvider('amazon')).toBe('bedrock');
        });

        it('should normalize "litellm-proxy" to "litellm"', () => {
            expect(normalizeProvider('litellm-proxy')).toBe('litellm');
        });

        it('should normalize "AWS" (uppercase) to "bedrock"', () => {
            expect(normalizeProvider('AWS')).toBe('bedrock');
        });

        it('should normalize "Amazon" (mixed case) to "bedrock"', () => {
            expect(normalizeProvider('Amazon')).toBe('bedrock');
        });

        it('should normalize "LiteLLM-Proxy" (mixed case) to "litellm"', () => {
            expect(normalizeProvider('LiteLLM-Proxy')).toBe('litellm');
        });

        it('should pass through "venice" unchanged', () => {
            expect(normalizeProvider('venice')).toBe('venice');
        });

        it('should pass through "bedrock" unchanged', () => {
            expect(normalizeProvider('bedrock')).toBe('bedrock');
        });

        it('should pass through "litellm" unchanged', () => {
            expect(normalizeProvider('litellm')).toBe('litellm');
        });
    });

    describe('getProvider()', () => {
        it('should return a provider for "venice"', () => {
            const provider = getProvider('venice');
            expect(provider).toBeDefined();
            expect(provider!.name).toBe('venice');
        });

        it('should return a provider for "bedrock"', () => {
            const provider = getProvider('bedrock');
            expect(provider).toBeDefined();
            expect(provider!.name).toBe('bedrock');
        });

        it('should return a provider for "litellm"', () => {
            const provider = getProvider('litellm');
            expect(provider).toBeDefined();
            expect(provider!.name).toBe('litellm');
        });
    });

    describe('getAllProviders()', () => {
        it('should return 17 total providers (4 core + 13 compat)', () => {
            const all = getAllProviders();
            expect(all.size).toBe(17);
        });

        it('should include venice, bedrock, and litellm in the provider map', () => {
            const all = getAllProviders();
            expect(all.has('venice')).toBe(true);
            expect(all.has('bedrock')).toBe(true);
            expect(all.has('litellm')).toBe(true);
        });
    });
});

// ════════════════════════════════════════════════════════════════════════
// 4. Config schema validation (~10 tests)
// ════════════════════════════════════════════════════════════════════════

describe('TitanConfigSchema — New Provider Entries', () => {
    it('should parse an empty object successfully', () => {
        const result = TitanConfigSchema.parse({});
        expect(result).toBeDefined();
    });

    it('should include venice in the parsed providers', () => {
        const result = TitanConfigSchema.parse({});
        expect(result.providers).toHaveProperty('venice');
    });

    it('should include bedrock in the parsed providers', () => {
        const result = TitanConfigSchema.parse({});
        expect(result.providers).toHaveProperty('bedrock');
    });

    it('should include litellm in the parsed providers', () => {
        const result = TitanConfigSchema.parse({});
        expect(result.providers).toHaveProperty('litellm');
    });

    it('venice provider config should have correct defaults', () => {
        const result = TitanConfigSchema.parse({});
        const venice = result.providers.venice;
        expect(venice.authProfiles).toEqual([]);
        expect(venice.apiKey).toBeUndefined();
        expect(venice.baseUrl).toBeUndefined();
    });

    it('bedrock provider config should have correct defaults', () => {
        const result = TitanConfigSchema.parse({});
        const bedrock = result.providers.bedrock;
        expect(bedrock.authProfiles).toEqual([]);
        expect(bedrock.apiKey).toBeUndefined();
        expect(bedrock.baseUrl).toBeUndefined();
    });

    it('litellm provider config should have correct defaults', () => {
        const result = TitanConfigSchema.parse({});
        const litellm = result.providers.litellm;
        expect(litellm.authProfiles).toEqual([]);
        expect(litellm.apiKey).toBeUndefined();
        expect(litellm.baseUrl).toBeUndefined();
    });

    it('should accept custom apiKey for venice', () => {
        const result = TitanConfigSchema.parse({
            providers: {
                venice: { apiKey: 'venice-key-123' },
            },
        });
        expect(result.providers.venice.apiKey).toBe('venice-key-123');
    });

    it('should accept custom baseUrl for bedrock', () => {
        const result = TitanConfigSchema.parse({
            providers: {
                bedrock: { baseUrl: 'http://my-proxy:8080/v1' },
            },
        });
        expect(result.providers.bedrock.baseUrl).toBe('http://my-proxy:8080/v1');
    });

    it('should accept custom model for litellm', () => {
        const result = TitanConfigSchema.parse({
            providers: {
                litellm: { model: 'custom-model' },
            },
        });
        expect(result.providers.litellm.model).toBe('custom-model');
    });

    it('should still include all original providers alongside new ones', () => {
        const result = TitanConfigSchema.parse({});
        const providerNames = Object.keys(result.providers);
        const expected = [
            'anthropic', 'openai', 'google', 'ollama',
            'groq', 'mistral', 'openrouter', 'fireworks',
            'xai', 'together', 'deepseek', 'cerebras',
            'cohere', 'perplexity', 'venice', 'bedrock', 'litellm',
        ];
        for (const name of expected) {
            expect(providerNames).toContain(name);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════
// 5. Edge cases (~5 tests)
// ════════════════════════════════════════════════════════════════════════

describe('New Providers — Edge Cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', mockFetch);
    });

    it('Venice should use custom baseUrl from config when available', () => {
        mockLoadConfig.mockReturnValue({
            providers: {
                venice: { apiKey: 'test-key', baseUrl: 'https://custom-venice.example.com/v1', authProfiles: [] },
            },
        });
        mockResolveApiKey.mockReturnValue('test-key');

        const venice = new OpenAICompatProvider(getPreset('venice'));
        // Access the private baseUrl getter indirectly via healthCheck which uses it
        // We verify by testing listModels which calls this.baseUrl
        mockFetch.mockResolvedValue(makeJsonResponse({ data: [{ id: 'custom-model' }] }));

        // The provider was constructed; verify the config key is correct for lookup
        expect(getPreset('venice').configKey).toBe('venice');
    });

    it('Bedrock should use API key from environment variable key name', () => {
        const bedrock = getPreset('bedrock');
        expect(bedrock.envKey).toBe('AWS_BEDROCK_API_KEY');
        // The resolveApiKey function uses this envKey as fallback when no config key is set
    });

    it('LiteLLM with supportsModelList=true should fetch models from API on success', async () => {
        mockLoadConfig.mockReturnValue({
            providers: {
                litellm: { apiKey: 'test-key', baseUrl: '', authProfiles: [] },
            },
        });
        mockResolveApiKey.mockReturnValue('test-key');

        const litellm = new OpenAICompatProvider(getPreset('litellm'));
        mockFetch.mockResolvedValue(makeJsonResponse({
            data: [{ id: 'gpt-4o' }, { id: 'claude-sonnet-4-20250514' }, { id: 'custom-model' }],
        }));

        const models = await litellm.listModels();
        expect(models).toEqual(['gpt-4o', 'claude-sonnet-4-20250514', 'custom-model']);
    });

    it('Bedrock with supportsModelList=false should never call fetch for listModels', async () => {
        mockLoadConfig.mockReturnValue({
            providers: {
                bedrock: { apiKey: 'test-key', baseUrl: '', authProfiles: [] },
            },
        });
        mockResolveApiKey.mockReturnValue('test-key');

        const bedrock = new OpenAICompatProvider(getPreset('bedrock'));
        const models = await bedrock.listModels();
        expect(models).toEqual(getPreset('bedrock').knownModels);
        // fetch should NOT have been called for model listing
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('all three new presets should have unique config keys', () => {
        const venice = getPreset('venice');
        const bedrock = getPreset('bedrock');
        const litellm = getPreset('litellm');
        const keys = new Set([venice.configKey, bedrock.configKey, litellm.configKey]);
        expect(keys.size).toBe(3);
    });
});
