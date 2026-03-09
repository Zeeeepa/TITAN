/**
 * TITAN — Local Whisper STT Provider
 * Connects to openai-whisper-asr-webservice (faster-whisper) on Titan PC (RTX 5090).
 * PRIMARY STT provider for local mode — lowest latency.
 * API: POST /asr?task=transcribe&output=json with audio_file form field.
 */
import type { STTProvider, STTResult } from './base.js';
import { pcm16ToWav } from '../audioUtils.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'STT:LocalWhisper';

export class LocalWhisperSTTProvider implements STTProvider {
  name = 'local-whisper';
  private serverUrl: string;

  constructor(serverUrl: string = 'http://localhost:48421') {
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  async transcribe(audio: Buffer, format: 'pcm16' | 'wav', sampleRate: number = 16000): Promise<STTResult> {
    const startMs = Date.now();

    // Whisper expects WAV format
    const wavBuffer = format === 'pcm16' ? pcm16ToWav(audio, sampleRate) : audio;

    const formData = new FormData();
    formData.append('audio_file', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'audio.wav');

    try {
      const response = await fetch(`${this.serverUrl}/asr?encode=true&task=transcribe&output=json`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Whisper ASR server error ${response.status}: ${errText}`);
      }

      const data = await response.json() as { text: string };
      const durationMs = Date.now() - startMs;

      logger.debug(COMPONENT, `Transcribed in ${durationMs}ms: "${data.text.trim().slice(0, 80)}"`);

      return {
        text: data.text.trim(),
        durationMs,
      };
    } catch (err) {
      logger.error(COMPONENT, `Transcription failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
