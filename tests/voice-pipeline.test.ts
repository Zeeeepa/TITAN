/**
 * TITAN — Voice Pipeline Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { STTProvider, STTResult } from '../src/voice/stt/base.js';
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

// Mock config
vi.mock('../src/config/config.js', () => ({
  loadConfig: vi.fn(() => ({
    voice: { personalVoice: 'robin-williams' },
    providers: {},
  })),
}));

// Mock agent
vi.mock('../src/agent/agent.js', () => ({
  processMessage: vi.fn(async (text: string) => ({
    content: `Response to: ${text}`,
    model: 'test-model',
    durationMs: 50,
    toolsUsed: [],
  })),
}));

// ─── Mock Helpers ──────────────────────────────────────────────

function createMockSTT(overrides: Partial<STTProvider> = {}): STTProvider {
  return {
    name: 'mock-stt',
    transcribe: vi.fn(async (): Promise<STTResult> => ({
      text: 'hello titan',
      durationMs: 42,
    })),
    ...overrides,
  };
}

function createMockTTS(name: string = 'mock-tts', chunks: Buffer[] = [Buffer.from([0xaa, 0xbb])]): TTSProvider {
  return {
    name,
    synthesizeStream: vi.fn(async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }),
    synthesize: vi.fn(async () => Buffer.concat(chunks)),
  };
}

/** Minimal WebSocket mock with readyState OPEN */
function createMockWs(): {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  sentMessages: (string | Buffer)[];
} {
  const sentMessages: (string | Buffer)[] = [];
  return {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn((data: string | Buffer) => { sentMessages.push(data); }),
    sentMessages,
  };
}

// ─── VoicePipeline Tests ───────────────────────────────────────
describe('VoicePipeline', () => {
  let VoicePipeline: typeof import('../src/voice/pipeline.js').VoicePipeline;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../src/voice/pipeline.js');
    VoicePipeline = mod.VoicePipeline;
  });

  it('should call STT, then agent, then TTS in sequence', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({
      stt,
      personalTTS,
      customerTTS,
    });

    await pipeline.handleAudioInput(Buffer.alloc(1000), ws as any, 'dashboard');

    // STT was called with the audio buffer
    expect(stt.transcribe).toHaveBeenCalledWith(Buffer.alloc(1000), 'pcm16', 16000);

    // Agent was called (checked via processMessage mock)
    const { processMessage } = await import('../src/agent/agent.js');
    expect(processMessage).toHaveBeenCalledWith('hello titan', 'webchat', 'dashboard');

    // TTS was called (personal session = chatterbox)
    expect(personalTTS.synthesizeStream).toHaveBeenCalled();
  });

  it('should not proceed when STT returns empty text', async () => {
    const stt = createMockSTT({
      transcribe: vi.fn(async () => ({ text: '', durationMs: 10 })),
    });
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any);

    // TTS should NOT have been called
    expect(personalTTS.synthesizeStream).not.toHaveBeenCalled();
    expect(customerTTS.synthesizeStream).not.toHaveBeenCalled();
  });

  it('should send inbound and outbound transcripts as JSON', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Find JSON messages (strings, not buffers)
    const jsonMessages = ws.sentMessages
      .filter((m): m is string => typeof m === 'string')
      .map((m) => JSON.parse(m));

    const inbound = jsonMessages.find((m) => m.direction === 'inbound');
    const outbound = jsonMessages.find((m) => m.direction === 'outbound');

    expect(inbound).toBeDefined();
    expect(inbound.type).toBe('voice_transcript');
    expect(inbound.text).toBe('hello titan');

    expect(outbound).toBeDefined();
    expect(outbound.type).toBe('voice_transcript');
    expect(outbound.text).toContain('Response to');
  });

  it('should send binary frames with AUDIO_CHUNK header (0x01)', async () => {
    const audioData = Buffer.from([0xaa, 0xbb, 0xcc]);
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox', [audioData]);
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Find binary messages (Buffers)
    const binaryMessages = ws.sentMessages.filter((m): m is Buffer => Buffer.isBuffer(m));

    // Should have at least one audio chunk + one end marker
    expect(binaryMessages.length).toBeGreaterThanOrEqual(2);

    // First binary should be audio chunk with 0x01 header
    const audioFrame = binaryMessages[0];
    expect(audioFrame[0]).toBe(0x01); // AUDIO_CHUNK
    expect(audioFrame.slice(1)).toEqual(audioData);
  });

  it('should send AUDIO_END marker (0x02) after streaming completes', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    const binaryMessages = ws.sentMessages.filter((m): m is Buffer => Buffer.isBuffer(m));
    const lastBinary = binaryMessages[binaryMessages.length - 1];

    expect(lastBinary.length).toBe(1);
    expect(lastBinary[0]).toBe(0x02); // AUDIO_END
  });

  it('should send INTERRUPT_ACK (0x03) when interrupt is called on active session', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });

    // Start a long-running session by making TTS slow
    const slowTTS = createMockTTS('chatterbox');
    slowTTS.synthesizeStream = vi.fn(async function* () {
      // Simulate slow streaming
      await new Promise((r) => setTimeout(r, 500));
      yield Buffer.from([1]);
    });

    // Start processing (don't await)
    const pipelineWithSlowTTS = new VoicePipeline({
      stt,
      personalTTS: slowTTS,
      customerTTS,
    });

    const promise = pipelineWithSlowTTS.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Give it time to start
    await new Promise((r) => setTimeout(r, 10));

    // Interrupt
    pipelineWithSlowTTS.interrupt(ws as any);

    // INTERRUPT_ACK should have been sent
    const binaryMessages = ws.sentMessages.filter((m): m is Buffer => Buffer.isBuffer(m));
    const interruptFrame = binaryMessages.find((m) => m.length === 1 && m[0] === 0x03);
    expect(interruptFrame).toBeDefined();

    await promise;
  });

  it('should use personalTTS (Chatterbox) for dashboard user', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    expect(personalTTS.synthesizeStream).toHaveBeenCalled();
    expect(customerTTS.synthesizeStream).not.toHaveBeenCalled();
  });

  it('should use customerTTS (Orpheus) for non-dashboard users', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'customer-123');

    expect(customerTTS.synthesizeStream).toHaveBeenCalled();
    expect(personalTTS.synthesizeStream).not.toHaveBeenCalled();
  });

  it('should fall back to fallbackTTS when primary TTS fails', async () => {
    const stt = createMockSTT();
    const failingTTS = createMockTTS('chatterbox');
    failingTTS.synthesizeStream = vi.fn(async function* () {
      throw new Error('GPU crashed');
    });

    const fallbackTTS = createMockTTS('openai-tts', [Buffer.from([0xfa, 0x11])]);
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({
      stt,
      personalTTS: failingTTS,
      customerTTS,
      fallbackTTS,
    });

    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Fallback should have been called
    expect(fallbackTTS.synthesizeStream).toHaveBeenCalled();

    // Audio data from fallback should appear in binary messages
    const binaryMessages = ws.sentMessages.filter((m): m is Buffer => Buffer.isBuffer(m));
    const audioFrames = binaryMessages.filter((m) => m[0] === 0x01);
    expect(audioFrames.length).toBeGreaterThan(0);
  });

  it('should use alloy voice when falling back to OpenAI TTS', async () => {
    const stt = createMockSTT();
    const failingTTS = createMockTTS('chatterbox');
    failingTTS.synthesizeStream = vi.fn(async function* () {
      throw new Error('connection refused');
    });

    const fallbackTTS = createMockTTS('openai-tts');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({
      stt,
      personalTTS: failingTTS,
      customerTTS,
      fallbackTTS,
    });

    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Check fallback was called with 'alloy' voice
    expect(fallbackTTS.synthesizeStream).toHaveBeenCalledWith(
      expect.any(String),
      'alloy',
      expect.any(Number),
    );
  });

  it('should cleanup session on WebSocket disconnect', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });

    // Complete a request so we know it works
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Cleanup should not throw
    pipeline.cleanup(ws as any);

    // Calling cleanup again should be safe (no session)
    expect(() => pipeline.cleanup(ws as any)).not.toThrow();
  });

  it('should interrupt existing session when new audio arrives from same client', async () => {
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    // Use a slow STT that blocks until we explicitly resolve it
    let resolveSTT!: (v: STTResult) => void;
    const slowSTT = createMockSTT({
      transcribe: vi.fn(() => new Promise<STTResult>((r) => { resolveSTT = r; })),
    });
    const personalTTS = createMockTTS('chatterbox');

    const pipeline = new VoicePipeline({
      stt: slowSTT,
      personalTTS,
      customerTTS,
    });

    // Start first request — will block on STT
    const first = pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');
    await new Promise((r) => setTimeout(r, 10));

    // Now interrupt while the session is still active (blocked on STT)
    pipeline.interrupt(ws as any);

    // Resolve the STT so the promise settles (aborted path)
    resolveSTT({ text: 'hello', durationMs: 10 });
    await Promise.allSettled([first]);

    // INTERRUPT_ACK (0x03) should have been sent
    const binaryMessages = ws.sentMessages.filter((m): m is Buffer => Buffer.isBuffer(m));
    const interruptFrames = binaryMessages.filter((m) => m.length === 1 && m[0] === 0x03);
    expect(interruptFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('should not send audio to closed WebSocket', async () => {
    const stt = createMockSTT();
    const personalTTS = createMockTTS('chatterbox', [Buffer.from([1, 2, 3])]);
    const customerTTS = createMockTTS('orpheus');

    // Create a ws that is CLOSED
    const ws = createMockWs();
    ws.readyState = 3; // WebSocket.CLOSED

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any, 'dashboard');

    // Nothing should have been sent
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should send error transcript on pipeline failure', async () => {
    const stt = createMockSTT({
      transcribe: vi.fn(async () => { throw new Error('mic not found'); }),
    });
    const personalTTS = createMockTTS('chatterbox');
    const customerTTS = createMockTTS('orpheus');
    const ws = createMockWs();

    const pipeline = new VoicePipeline({ stt, personalTTS, customerTTS });
    await pipeline.handleAudioInput(Buffer.alloc(100), ws as any);

    const jsonMessages = ws.sentMessages
      .filter((m): m is string => typeof m === 'string')
      .map((m) => JSON.parse(m));

    const errorMsg = jsonMessages.find((m) => m.text?.includes('Voice error'));
    expect(errorMsg).toBeDefined();
    expect(errorMsg.direction).toBe('outbound');
  });
});
