/**
 * TITAN — TTS Provider Interface
 * Base interface for all Text-to-Speech providers.
 */

export interface TTSProvider {
  name: string;

  /** Stream synthesized audio chunks */
  synthesizeStream(text: string, voice?: string, speed?: number): AsyncGenerator<Buffer>;

  /** Synthesize complete audio buffer */
  synthesize(text: string, voice?: string, speed?: number): Promise<Buffer>;
}
