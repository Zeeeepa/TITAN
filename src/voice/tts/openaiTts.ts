/**
 * TITAN — OpenAI TTS Provider (Cloud Fallback)
 * Uses OpenAI's TTS-1 API with streaming support.
 */
import type { TTSProvider } from './base.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'TTS:OpenAI';

export class OpenAITTSProvider implements TTSProvider {
  name = 'openai-tts';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async *synthesizeStream(text: string, voice: string = 'alloy', speed: number = 1.0): AsyncGenerator<Buffer> {
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice,
          speed,
          response_format: 'opus',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS error ${response.status}: ${await response.text()}`);
      }

      if (!response.body) {
        throw new Error('OpenAI TTS returned no body');
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

  async synthesize(text: string, voice: string = 'alloy', speed: number = 1.0): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.synthesizeStream(text, voice, speed)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
