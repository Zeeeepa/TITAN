/**
 * TITAN — Voice STT Provider Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { STTProvider } from '../src/voice/stt/base.js';

// Mock logger to suppress output during tests
vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── STT Interface Compliance ──────────────────────────────────
describe('STT Provider Interface', () => {
  it('should require name and transcribe method', () => {
    const provider: STTProvider = {
      name: 'test-stt',
      async transcribe(_audio: Buffer, _format: 'pcm16' | 'wav') {
        return { text: 'hello', durationMs: 100 };
      },
    };

    expect(provider.name).toBe('test-stt');
    expect(typeof provider.transcribe).toBe('function');
  });

  it('should allow optional transcribeStream method', () => {
    const provider: STTProvider = {
      name: 'test-streaming-stt',
      async transcribe(_audio: Buffer, _format: 'pcm16' | 'wav') {
        return { text: 'hello', durationMs: 100 };
      },
      async *transcribeStream() {
        yield { partial: 'hel' };
        yield { partial: 'hello', final: 'hello' };
      },
    };

    expect(typeof provider.transcribeStream).toBe('function');
  });
});

// ─── LocalWhisperSTTProvider ───────────────────────────────────
describe('LocalWhisperSTTProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should construct URL correctly and strip trailing slash', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');

    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify({ text: 'test transcription' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof globalThis.fetch;

    const provider = new LocalWhisperSTTProvider('http://192.168.1.11:8080/');
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedUrl).toBe('http://192.168.1.11:8080/asr?encode=true&task=transcribe&output=json');
  });

  it('should use default URL when not provided', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');

    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify({ text: 'hello' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new LocalWhisperSTTProvider();
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedUrl).toBe('http://192.168.1.11:8080/asr?encode=true&task=transcribe&output=json');
  });

  it('should send FormData with file and parameters', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');

    let capturedBody: FormData | null = null;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ text: 'transcribed' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new LocalWhisperSTTProvider();
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get('audio_file')).toBeInstanceOf(Blob);
  });

  it('should return text and durationMs', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ text: '  hello world  ' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new LocalWhisperSTTProvider();
    const result = await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(result.text).toBe('hello world');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should throw on non-OK response', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response('server error', { status: 500 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new LocalWhisperSTTProvider();
    await expect(provider.transcribe(Buffer.alloc(100), 'pcm16'))
      .rejects.toThrow('Whisper ASR server error 500');
  });

  it('should throw on network error', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');

    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof globalThis.fetch;

    const provider = new LocalWhisperSTTProvider();
    await expect(provider.transcribe(Buffer.alloc(100), 'pcm16'))
      .rejects.toThrow('ECONNREFUSED');
  });

  it('should have correct name property', async () => {
    const { LocalWhisperSTTProvider } = await import('../src/voice/stt/localWhisper.js');
    const provider = new LocalWhisperSTTProvider();
    expect(provider.name).toBe('local-whisper');
  });
});

// ─── OpenAIWhisperSTTProvider ──────────────────────────────────
describe('OpenAIWhisperSTTProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should send Authorization header with Bearer token', async () => {
    const { OpenAIWhisperSTTProvider } = await import('../src/voice/stt/openaiWhisper.js');

    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ text: 'hello' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAIWhisperSTTProvider('sk-test-key-123');
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedHeaders).toEqual({ 'Authorization': 'Bearer sk-test-key-123' });
  });

  it('should POST to OpenAI transcriptions endpoint', async () => {
    const { OpenAIWhisperSTTProvider } = await import('../src/voice/stt/openaiWhisper.js');

    let capturedUrl = '';
    let capturedMethod = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url as string;
      capturedMethod = init?.method || '';
      return new Response(JSON.stringify({ text: 'test' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAIWhisperSTTProvider('sk-key');
    await provider.transcribe(Buffer.alloc(100), 'wav');

    expect(capturedUrl).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(capturedMethod).toBe('POST');
  });

  it('should include model in FormData', async () => {
    const { OpenAIWhisperSTTProvider } = await import('../src/voice/stt/openaiWhisper.js');

    let capturedBody: FormData | null = null;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ text: 'test' }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAIWhisperSTTProvider('sk-key', 'whisper-1');
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedBody!.get('model')).toBe('whisper-1');
  });

  it('should throw on non-OK response', async () => {
    const { OpenAIWhisperSTTProvider } = await import('../src/voice/stt/openaiWhisper.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response('unauthorized', { status: 401 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAIWhisperSTTProvider('bad-key');
    await expect(provider.transcribe(Buffer.alloc(100), 'pcm16'))
      .rejects.toThrow('OpenAI Whisper error 401');
  });

  it('should have correct name property', async () => {
    const { OpenAIWhisperSTTProvider } = await import('../src/voice/stt/openaiWhisper.js');
    const provider = new OpenAIWhisperSTTProvider('sk-key');
    expect(provider.name).toBe('openai-whisper');
  });
});

// ─── DeepgramSTTProvider ───────────────────────────────────────
describe('DeepgramSTTProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should send Token auth header', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] },
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new DeepgramSTTProvider('dg-test-token');
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedHeaders['Authorization']).toBe('Token dg-test-token');
  });

  it('should include model and language in URL', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');

    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: 'test' }] }] },
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new DeepgramSTTProvider('key', 'nova-2', 'en');
    await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(capturedUrl).toContain('model=nova-2');
    expect(capturedUrl).toContain('language=en');
    expect(capturedUrl).toContain('smart_format=true');
  });

  it('should send Content-Type audio/wav header', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: 'ok' }] }] },
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new DeepgramSTTProvider('key');
    await provider.transcribe(Buffer.alloc(100), 'wav');

    expect(capturedHeaders['Content-Type']).toBe('audio/wav');
  });

  it('should extract transcript from nested Deepgram response', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        results: {
          channels: [{
            alternatives: [{ transcript: 'hello from deepgram' }],
          }],
        },
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new DeepgramSTTProvider('key');
    const result = await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(result.text).toBe('hello from deepgram');
  });

  it('should return empty string when no transcript in response', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        results: { channels: [{ alternatives: [{}] }] },
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new DeepgramSTTProvider('key');
    const result = await provider.transcribe(Buffer.alloc(100), 'pcm16');

    expect(result.text).toBe('');
  });

  it('should throw on non-OK response', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response('rate limited', { status: 429 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new DeepgramSTTProvider('key');
    await expect(provider.transcribe(Buffer.alloc(100), 'pcm16'))
      .rejects.toThrow('Deepgram error 429');
  });

  it('should have correct name property', async () => {
    const { DeepgramSTTProvider } = await import('../src/voice/stt/deepgram.js');
    const provider = new DeepgramSTTProvider('key');
    expect(provider.name).toBe('deepgram');
  });
});
