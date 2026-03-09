/**
 * TITAN — Voice TTS Provider Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TTSProvider } from '../src/voice/tts/base.js';

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs for Chatterbox reference clip loading
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => Buffer.from('fake-audio-data')),
  };
});

/** Helper: create a ReadableStream from chunks for mocking fetch responses */
function createMockStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

// ─── TTS Interface Compliance ──────────────────────────────────
describe('TTS Provider Interface', () => {
  it('should require name, synthesizeStream, and synthesize', () => {
    const provider: TTSProvider = {
      name: 'test-tts',
      async *synthesizeStream() {
        yield Buffer.from('audio-chunk');
      },
      async synthesize() {
        return Buffer.from('full-audio');
      },
    };

    expect(provider.name).toBe('test-tts');
    expect(typeof provider.synthesizeStream).toBe('function');
    expect(typeof provider.synthesize).toBe('function');
  });
});

// ─── ChatterboxTTSProvider ─────────────────────────────────────
describe('ChatterboxTTSProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should have correct name property', async () => {
    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');
    const provider = new ChatterboxTTSProvider();
    expect(provider.name).toBe('chatterbox');
  });

  it('should POST to /tts endpoint', async () => {
    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');

    let capturedUrl = '';
    let capturedMethod = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url as string;
      capturedMethod = init?.method || '';
      return new Response(createMockStream([new Uint8Array([1, 2, 3])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new ChatterboxTTSProvider('http://localhost:8880');
    const chunks: Buffer[] = [];
    for await (const chunk of provider.synthesizeStream('Hello')) {
      chunks.push(chunk);
    }

    expect(capturedUrl).toBe('http://localhost:8880/tts');
    expect(capturedMethod).toBe('POST');
  });

  it('should use clone mode with reference_audio_filename when reference clip path given', async () => {
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.mock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    }));

    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1, 2])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new ChatterboxTTSProvider('http://localhost:8880', '/fake/path/clip.wav');
    for await (const _chunk of provider.synthesizeStream('Hello')) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.voice_mode).toBe('clone');
    expect(parsed.reference_audio_filename).toBe('clip.wav');
    expect(parsed.predefined_voice_id).toBeUndefined();
  });

  it('should use predefined mode with voice id when no reference clip', async () => {
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.mock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    }));

    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new ChatterboxTTSProvider('http://localhost:8880');
    for await (const _chunk of provider.synthesizeStream('Hello', 'robin-williams')) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.voice_mode).toBe('predefined');
    expect(parsed.predefined_voice_id).toBe('robin-williams');
    expect(parsed.reference_audio_filename).toBeUndefined();
  });

  it('should stream audio chunks from response body', async () => {
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.mock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    }));

    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');

    const chunk1 = new Uint8Array([10, 20, 30]);
    const chunk2 = new Uint8Array([40, 50, 60]);

    globalThis.fetch = vi.fn(async () => {
      return new Response(createMockStream([chunk1, chunk2]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new ChatterboxTTSProvider('http://localhost:8880');
    const chunks: Buffer[] = [];
    for await (const chunk of provider.synthesizeStream('Hello')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toEqual(Buffer.from(chunk1));
    expect(chunks[1]).toEqual(Buffer.from(chunk2));
  });

  it('should throw on non-OK response', async () => {
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.mock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    }));

    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response('GPU OOM', { status: 500 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new ChatterboxTTSProvider();
    const gen = provider.synthesizeStream('Hello');

    await expect(gen.next()).rejects.toThrow('Chatterbox TTS error 500');
  });

  it('should send correct body fields (text, output_format, speed)', async () => {
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.mock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    }));

    const { ChatterboxTTSProvider } = await import('../src/voice/tts/chatterbox.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new ChatterboxTTSProvider();
    for await (const _chunk of provider.synthesizeStream('Test', 'default', 1.2)) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.text).toBe('Test');
    expect(parsed.output_format).toBe('wav');
    expect(parsed.speed).toBe(1.2);
    expect(parsed.split_text).toBe(true);
  });
});

// ─── OrpheusTTSProvider ────────────────────────────────────────
describe('OrpheusTTSProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should have correct name property', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');
    const provider = new OrpheusTTSProvider();
    expect(provider.name).toBe('orpheus');
  });

  it('should send correct voice in request body', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OrpheusTTSProvider('http://localhost:8881');
    for await (const _chunk of provider.synthesizeStream('Hello customer', 'tara', 1.0)) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.voice).toBe('tara');
    expect(parsed.model).toBe('orpheus');
    expect(parsed.input).toBe('Hello customer');
  });

  it('should default to tara voice', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OrpheusTTSProvider();
    for await (const _chunk of provider.synthesizeStream('Test')) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.voice).toBe('tara');
  });

  it('should stream audio chunks from response', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');

    const c1 = new Uint8Array([10, 20]);
    const c2 = new Uint8Array([30, 40]);
    const c3 = new Uint8Array([50]);

    globalThis.fetch = vi.fn(async () => {
      return new Response(createMockStream([c1, c2, c3]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OrpheusTTSProvider();
    const chunks: Buffer[] = [];
    for await (const chunk of provider.synthesizeStream('Hello')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(3);
  });

  it('should strip trailing slash from server URL', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');

    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = url as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OrpheusTTSProvider('http://localhost:8881/');
    for await (const _chunk of provider.synthesizeStream('Test')) { /* consume */ }

    expect(capturedUrl).toBe('http://localhost:8881/v1/audio/speech');
  });

  it('should throw on non-OK response', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response('model not loaded', { status: 503 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OrpheusTTSProvider();
    const gen = provider.synthesizeStream('Hello');

    await expect(gen.next()).rejects.toThrow('Orpheus TTS error 503');
  });

  it('should use synthesize to collect all chunks into one buffer', async () => {
    const { OrpheusTTSProvider } = await import('../src/voice/tts/orpheus.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        createMockStream([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
        { status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;

    const provider = new OrpheusTTSProvider();
    const result = await provider.synthesize('Hello');

    expect(result).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});

// ─── OpenAITTSProvider ─────────────────────────────────────────
describe('OpenAITTSProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
    vi.mock('../src/utils/logger.js', () => ({
      default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should have correct name property', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');
    const provider = new OpenAITTSProvider('sk-key');
    expect(provider.name).toBe('openai-tts');
  });

  it('should send Authorization Bearer header', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAITTSProvider('sk-test-api-key');
    for await (const _chunk of provider.synthesizeStream('Hello')) { /* consume */ }

    expect(capturedHeaders['Authorization']).toBe('Bearer sk-test-api-key');
  });

  it('should request opus format', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAITTSProvider('sk-key');
    for await (const _chunk of provider.synthesizeStream('Hello')) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.response_format).toBe('opus');
    expect(parsed.model).toBe('tts-1');
  });

  it('should POST to OpenAI TTS endpoint', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');

    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = url as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAITTSProvider('sk-key');
    for await (const _chunk of provider.synthesizeStream('Hello')) { /* consume */ }

    expect(capturedUrl).toBe('https://api.openai.com/v1/audio/speech');
  });

  it('should default to alloy voice', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAITTSProvider('sk-key');
    for await (const _chunk of provider.synthesizeStream('Hello')) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.voice).toBe('alloy');
  });

  it('should throw on non-OK response', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');

    globalThis.fetch = vi.fn(async () => {
      return new Response('rate limit exceeded', { status: 429 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAITTSProvider('sk-key');
    const gen = provider.synthesizeStream('Hello');

    await expect(gen.next()).rejects.toThrow('OpenAI TTS error 429');
  });

  it('should pass voice and speed parameters', async () => {
    const { OpenAITTSProvider } = await import('../src/voice/tts/openaiTts.js');

    let capturedBody: string = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(createMockStream([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const provider = new OpenAITTSProvider('sk-key');
    for await (const _chunk of provider.synthesizeStream('Fast speech', 'nova', 1.5)) { /* consume */ }

    const parsed = JSON.parse(capturedBody);
    expect(parsed.voice).toBe('nova');
    expect(parsed.speed).toBe(1.5);
    expect(parsed.input).toBe('Fast speech');
  });
});
