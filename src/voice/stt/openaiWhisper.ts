/**
 * TITAN — OpenAI Whisper STT Provider (Cloud Fallback)
 * Uses OpenAI's Whisper API for speech-to-text transcription.
 */
import type { STTProvider, STTResult } from './base.js';
import { pcm16ToWav } from '../audioUtils.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'STT:OpenAIWhisper';

export class OpenAIWhisperSTTProvider implements STTProvider {
  name = 'openai-whisper';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'whisper-1') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audio: Buffer, format: 'pcm16' | 'wav', sampleRate: number = 16000): Promise<STTResult> {
    const startMs = Date.now();

    const wavBuffer = format === 'pcm16' ? pcm16ToWav(audio, sampleRate) : audio;

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', this.model);

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`OpenAI Whisper error ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as { text: string };
      const durationMs = Date.now() - startMs;

      logger.debug(COMPONENT, `Transcribed in ${durationMs}ms: "${data.text.trim().slice(0, 80)}"`);

      return { text: data.text.trim(), durationMs };
    } catch (err) {
      logger.error(COMPONENT, `Transcription failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
