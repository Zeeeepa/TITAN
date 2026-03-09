/**
 * TITAN — LiveKit Voice Integration Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config
const mockConfig = {
  voice: {
    enabled: false,
    provider: 'livekit',
    livekit: { url: '', apiKey: '', apiSecret: '', agentName: 'titan-voice' },
  },
  providers: {},
};

vi.mock('../src/config/config.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
}));

// Mock processMessage
vi.mock('../src/agent/agent.js', () => ({
  processMessage: vi.fn(async (text: string) => ({
    content: `Response to: ${text}`,
    model: 'test-model',
  })),
}));

// ─── Config Resolution ──────────────────────────────────────────
describe('LiveKit Config Resolution', () => {
  beforeEach(() => {
    mockConfig.voice.enabled = false;
    mockConfig.voice.livekit = { url: '', apiKey: '', apiSecret: '', agentName: 'titan-voice' };
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
  });

  it('should return null when voice is disabled', async () => {
    const { getLiveKitConfig } = await import('../src/voice/livekitAgent.js');
    const config = getLiveKitConfig();
    expect(config).toBeNull();
  });

  it('should return null when enabled but credentials missing', async () => {
    mockConfig.voice.enabled = true;
    const { getLiveKitConfig } = await import('../src/voice/livekitAgent.js');
    const config = getLiveKitConfig();
    expect(config).toBeNull();
  });

  it('should resolve config from titan config', async () => {
    mockConfig.voice.enabled = true;
    mockConfig.voice.livekit = {
      url: 'wss://my-server.livekit.cloud',
      apiKey: 'key123',
      apiSecret: 'secret456',
      agentName: 'custom-agent',
    };
    const { getLiveKitConfig } = await import('../src/voice/livekitAgent.js');
    const config = getLiveKitConfig();
    expect(config).not.toBeNull();
    expect(config!.url).toBe('wss://my-server.livekit.cloud');
    expect(config!.apiKey).toBe('key123');
    expect(config!.apiSecret).toBe('secret456');
    expect(config!.agentName).toBe('custom-agent');
  });

  it('should fall back to environment variables', async () => {
    mockConfig.voice.enabled = true;
    process.env.LIVEKIT_URL = 'wss://env-server.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'env-key';
    process.env.LIVEKIT_API_SECRET = 'env-secret';
    const { getLiveKitConfig } = await import('../src/voice/livekitAgent.js');
    const config = getLiveKitConfig();
    expect(config).not.toBeNull();
    expect(config!.url).toBe('wss://env-server.livekit.cloud');
    expect(config!.apiKey).toBe('env-key');
    expect(config!.apiSecret).toBe('env-secret');
  });

  it('should prefer config values over env vars', async () => {
    mockConfig.voice.enabled = true;
    mockConfig.voice.livekit = {
      url: 'wss://config-server.livekit.cloud',
      apiKey: 'config-key',
      apiSecret: 'config-secret',
      agentName: 'titan-voice',
    };
    process.env.LIVEKIT_URL = 'wss://env-server.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'env-key';
    process.env.LIVEKIT_API_SECRET = 'env-secret';
    const { getLiveKitConfig } = await import('../src/voice/livekitAgent.js');
    const config = getLiveKitConfig();
    expect(config!.url).toBe('wss://config-server.livekit.cloud');
    expect(config!.apiKey).toBe('config-key');
  });

  it('should default agentName to titan-voice', async () => {
    mockConfig.voice.enabled = true;
    mockConfig.voice.livekit = {
      url: 'wss://test.livekit.cloud',
      apiKey: 'key',
      apiSecret: 'secret',
      agentName: '',
    };
    const { getLiveKitConfig } = await import('../src/voice/livekitAgent.js');
    const config = getLiveKitConfig();
    expect(config!.agentName).toBe('titan-voice');
  });
});

// ─── VoiceConfigSchema ──────────────────────────────────────────
describe('VoiceConfigSchema', () => {
  it('should parse empty voice config with LiveKit defaults', async () => {
    const { VoiceConfigSchema } = await import('../src/config/schema.js');
    const result = VoiceConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.provider).toBe('livekit');
    expect(result.livekit.url).toBe('');
    expect(result.livekit.apiKey).toBe('');
    expect(result.livekit.apiSecret).toBe('');
    expect(result.livekit.agentName).toBe('titan-voice');
  });

  it('should accept valid LiveKit config', async () => {
    const { VoiceConfigSchema } = await import('../src/config/schema.js');
    const result = VoiceConfigSchema.parse({
      enabled: true,
      provider: 'livekit',
      livekit: {
        url: 'wss://test.livekit.cloud',
        apiKey: 'mykey',
        apiSecret: 'mysecret',
      },
    });
    expect(result.enabled).toBe(true);
    expect(result.livekit.url).toBe('wss://test.livekit.cloud');
  });

  it('should reject invalid provider', async () => {
    const { VoiceConfigSchema } = await import('../src/config/schema.js');
    expect(() => VoiceConfigSchema.parse({ provider: 'invalid' })).toThrow();
  });
});

// ─── Agent Bridge (graceful fallback) ───────────────────────────
describe('LiveKit Agent Worker', () => {
  it('should skip when voice not configured', async () => {
    mockConfig.voice.enabled = false;
    const { startLiveKitAgent } = await import('../src/voice/livekitAgent.js');
    // Should not throw
    await startLiveKitAgent();
  });

  it('should handle missing @livekit/agents gracefully', async () => {
    mockConfig.voice.enabled = true;
    mockConfig.voice.livekit = {
      url: 'wss://test.livekit.cloud',
      apiKey: 'key',
      apiSecret: 'secret',
      agentName: 'titan-voice',
    };
    const { startLiveKitAgent } = await import('../src/voice/livekitAgent.js');
    // Should not throw — logs warning about missing module
    await startLiveKitAgent();
  });
});
