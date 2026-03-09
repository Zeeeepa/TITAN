/**
 * TITAN — STT Provider Interface
 * Base interface for all Speech-to-Text providers.
 */

export interface STTResult {
  text: string;
  durationMs: number;
}

export interface STTPartialResult {
  partial: string;
  final?: string;
}

export interface STTProvider {
  name: string;

  /** Transcribe a complete audio buffer */
  transcribe(audio: Buffer, format: 'pcm16' | 'wav', sampleRate?: number): Promise<STTResult>;

  /** Stream transcription (optional — not all providers support this) */
  transcribeStream?(audioStream: AsyncIterable<Buffer>): AsyncGenerator<STTPartialResult>;
}
