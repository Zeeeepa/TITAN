/**
 * TITAN — Audio Utilities
 * PCM/WAV conversion, sentence splitting, volume normalization.
 */

/**
 * Prepend a 44-byte WAV header to raw PCM16 data.
 */
export function pcm16ToWav(pcm: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);         // chunk size
  header.writeUInt16LE(1, 20);          // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Split text at sentence boundaries for chunked TTS streaming.
 * Splits on . ! ? followed by whitespace, preserving the delimiter.
 */
export function splitBySentence(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g);
  if (!sentences) return text.trim() ? [text.trim()] : [];

  const result: string[] = [];
  let current = '';

  for (const s of sentences) {
    current += s;
    // Flush when sentence is long enough (>20 chars) to avoid tiny chunks
    if (current.trim().length >= 20) {
      result.push(current.trim());
      current = '';
    }
  }

  // Remainder (text after last sentence-end punctuation)
  const remainder = text.slice(sentences.join('').length).trim();
  if (current.trim() || remainder) {
    result.push((current + remainder).trim());
  }

  return result.filter(s => s.length > 0);
}

/**
 * Normalize PCM16 audio volume to target peak level.
 */
export function normalizeAudio(pcm: Buffer, targetPeak: number = 0.9): Buffer {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);

  // Find peak
  let maxSample = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxSample) maxSample = abs;
  }

  if (maxSample === 0) return pcm;

  const gain = (32767 * targetPeak) / maxSample;
  if (Math.abs(gain - 1.0) < 0.05) return pcm; // Already normalized

  const output = Buffer.alloc(pcm.length);
  const outSamples = new Int16Array(output.buffer, output.byteOffset, output.length / 2);

  for (let i = 0; i < samples.length; i++) {
    outSamples[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain)));
  }

  return output;
}
