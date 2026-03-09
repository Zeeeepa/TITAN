/**
 * TITAN — Chatterbox TTS Provider (devnen/Chatterbox-TTS-Server)
 * Zero-shot voice cloning from reference audio.
 * PRIMARY TTS for personal/cloned voice sessions.
 * API: POST /tts with JSON body. Port 8004.
 * Voice cloning: reference audio is pre-loaded on server via volume mount.
 */
import { readFileSync, existsSync } from 'fs';
import type { TTSProvider } from './base.js';
import logger from '../../utils/logger.js';

const COMPONENT = 'TTS:Chatterbox';

export class ChatterboxTTSProvider implements TTSProvider {
  name = 'chatterbox';
  private serverUrl: string;
  private referenceClipPath?: string;
  private referenceFilename?: string;
  private referenceUploaded = false;

  constructor(serverUrl: string = 'http://localhost:48422', referenceClipPath?: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.referenceClipPath = referenceClipPath;

    if (referenceClipPath) {
      // Extract filename from path (works even if file doesn't exist locally)
      this.referenceFilename = referenceClipPath.split('/').pop() || 'clip1.wav';

      // Check if file exists locally for upload
      const resolvedPath = referenceClipPath.replace(/^~/, process.env.HOME || '');
      if (existsSync(resolvedPath)) {
        logger.info(COMPONENT, `Reference clip found locally: ${this.referenceFilename}`);
      } else {
        // File not local — assume it's already on the server (via volume mount)
        this.referenceUploaded = true;
        logger.info(COMPONENT, `Reference clip assumed on server: ${this.referenceFilename}`);
      }
    }
  }

  /**
   * Upload reference audio to the Chatterbox server (one-time, only if file exists locally).
   */
  private async ensureReferenceUploaded(): Promise<void> {
    if (this.referenceUploaded || !this.referenceClipPath) return;

    const resolvedPath = this.referenceClipPath.replace(/^~/, process.env.HOME || '');
    if (!existsSync(resolvedPath)) {
      // No local file — assume already on server
      this.referenceUploaded = true;
      return;
    }

    try {
      const audioBuffer = readFileSync(resolvedPath);
      const formData = new FormData();
      formData.append('files', new Blob([audioBuffer], { type: 'audio/wav' }), this.referenceFilename!);

      const response = await fetch(`${this.serverUrl}/upload_reference`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        this.referenceUploaded = true;
        logger.info(COMPONENT, `Uploaded reference clip: ${this.referenceFilename}`);
      } else {
        const errText = await response.text();
        logger.warn(COMPONENT, `Reference upload failed (${response.status}): ${errText}`);
        // Still mark as uploaded — try clone mode anyway (file may be on server via mount)
        this.referenceUploaded = true;
      }
    } catch (err) {
      logger.warn(COMPONENT, `Reference upload error: ${(err as Error).message}`);
      this.referenceUploaded = true;
    }
  }

  async *synthesizeStream(text: string, voice?: string, speed: number = 1.0): AsyncGenerator<Buffer> {
    try {
      // Ensure reference is available on server
      if (this.referenceClipPath && !this.referenceUploaded) {
        await this.ensureReferenceUploaded();
      }

      const body: Record<string, unknown> = {
        text,
        output_format: 'wav',
        split_text: true,
        speed,
      };

      // Use voice cloning if we have a reference filename
      if (this.referenceFilename) {
        body.voice_mode = 'clone';
        body.reference_audio_filename = this.referenceFilename;
      } else {
        body.voice_mode = 'predefined';
        body.predefined_voice_id = voice || 'Emily.wav';
      }

      const response = await fetch(`${this.serverUrl}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Chatterbox TTS error ${response.status}: ${errText}`);
      }

      if (!response.body) {
        throw new Error('Chatterbox TTS returned no body');
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

  async synthesize(text: string, voice?: string, speed: number = 1.0): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.synthesizeStream(text, voice, speed)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
