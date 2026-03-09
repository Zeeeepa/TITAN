/**
 * TITAN — Deepgram Nova-2 STT Provider (Streaming)
 * WebSocket-based streaming transcription with lowest cloud latency (~300ms).
 */
import type { STTProvider, STTResult, STTPartialResult } from './base.js';
import { pcm16ToWav } from '../audioUtils.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'STT:Deepgram';

export class DeepgramSTTProvider implements STTProvider {
  name = 'deepgram';
  private apiKey: string;
  private model: string;
  private language: string;

  constructor(apiKey: string, model: string = 'nova-2', language: string = 'en') {
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
  }

  /** Non-streaming fallback: POST audio to Deepgram REST API */
  async transcribe(audio: Buffer, format: 'pcm16' | 'wav', sampleRate: number = 16000): Promise<STTResult> {
    const startMs = Date.now();

    const wavBuffer = format === 'pcm16' ? pcm16ToWav(audio, sampleRate) : audio;

    try {
      const response = await fetch(
        `https://api.deepgram.com/v1/listen?model=${this.model}&language=${this.language}&smart_format=true`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'audio/wav',
          },
          body: new Uint8Array(wavBuffer),
        }
      );

      if (!response.ok) {
        throw new Error(`Deepgram error ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as {
        results: { channels: Array<{ alternatives: Array<{ transcript: string }> }> }
      };

      const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const durationMs = Date.now() - startMs;

      logger.debug(COMPONENT, `Transcribed in ${durationMs}ms: "${transcript.slice(0, 80)}"`);

      return { text: transcript, durationMs };
    } catch (err) {
      logger.error(COMPONENT, `Transcription failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Streaming transcription via WebSocket */
  async *transcribeStream(audioStream: AsyncIterable<Buffer>): AsyncGenerator<STTPartialResult> {
    const { WebSocket } = await import('ws');

    const url = `wss://api.deepgram.com/v1/listen?model=${this.model}&language=${this.language}&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true`;

    const ws = new WebSocket(url, {
      headers: { 'Authorization': `Token ${this.apiKey}` },
    });

    const results: STTPartialResult[] = [];
    let done = false;
    let resolveWait: (() => void) | null = null;

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0];
          if (alt) {
            const result: STTPartialResult = { partial: alt.transcript || '' };
            if (msg.is_final) result.final = alt.transcript || '';
            results.push(result);
            if (resolveWait) { resolveWait(); resolveWait = null; }
          }
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
      done = true;
      if (resolveWait) { resolveWait(); resolveWait = null; }
    });

    ws.on('error', (err) => {
      logger.error(COMPONENT, `WebSocket error: ${err.message}`);
      done = true;
      if (resolveWait) { resolveWait(); resolveWait = null; }
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Send audio chunks as they arrive
    (async () => {
      for await (const chunk of audioStream) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      }
      // Signal end of audio
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
    })().catch(() => {});

    // Yield results as they come
    while (!done || results.length > 0) {
      if (results.length > 0) {
        yield results.shift()!;
      } else if (!done) {
        await new Promise<void>(r => { resolveWait = r; });
      }
    }

    ws.close();
  }
}
