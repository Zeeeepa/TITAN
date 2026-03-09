/**
 * TITAN — Orpheus TTS Provider
 * Llama-based TTS with emotion tags and streaming. Standard voices for customers.
 * PRIMARY TTS for customer sessions. ~100ms streaming latency.
 * Connects to Orpheus TTS server (OpenAI-compatible API).
 */
import type { TTSProvider } from './base.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'TTS:Orpheus';

export class OrpheusTTSProvider implements TTSProvider {
  name = 'orpheus';
  private serverUrl: string;

  constructor(serverUrl: string = 'http://localhost:48423') {
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  async *synthesizeStream(text: string, voice: string = 'tara', speed: number = 1.0): AsyncGenerator<Buffer> {
    try {
      const response = await fetch(`${this.serverUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'orpheus',
          input: text,
          voice,
          speed,
          response_format: 'wav',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Orpheus TTS error ${response.status}: ${errText}`);
      }

      if (!response.body) {
        throw new Error('Orpheus TTS returned no body');
      }

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield Buffer.from(value);
      }
    } catch (err) {
      logger.error(COMPONENT, `TTS synthesis failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async synthesize(text: string, voice: string = 'tara', speed: number = 1.0): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.synthesizeStream(text, voice, speed)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
