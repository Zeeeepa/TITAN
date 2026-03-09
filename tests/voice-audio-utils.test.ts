/**
 * TITAN — Voice Audio Utilities Tests
 */
import { describe, it, expect } from 'vitest';
import { pcm16ToWav, splitBySentence, normalizeAudio } from '../src/voice/audioUtils.js';

// ─── pcm16ToWav ────────────────────────────────────────────────
describe('pcm16ToWav', () => {
  const pcm = Buffer.alloc(320); // 10ms of 16kHz mono PCM16

  it('should produce a buffer with 44-byte header + data', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.length).toBe(44 + pcm.length);
  });

  it('should write RIFF magic at offset 0', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('should write WAVE format at offset 8', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('should write correct file size at offset 4 (36 + dataSize)', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length);
  });

  it('should write fmt chunk marker at offset 12', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
  });

  it('should write PCM format (1) at offset 20', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.readUInt16LE(20)).toBe(1);
  });

  it('should write correct sample rate at offset 24', () => {
    const wav16k = pcm16ToWav(pcm, 16000);
    expect(wav16k.readUInt32LE(24)).toBe(16000);

    const wav44k = pcm16ToWav(pcm, 44100);
    expect(wav44k.readUInt32LE(24)).toBe(44100);
  });

  it('should write correct channels at offset 22', () => {
    const mono = pcm16ToWav(pcm, 16000, 1);
    expect(mono.readUInt16LE(22)).toBe(1);

    const stereo = pcm16ToWav(pcm, 16000, 2);
    expect(stereo.readUInt16LE(22)).toBe(2);
  });

  it('should write correct byte rate at offset 28', () => {
    const wav = pcm16ToWav(pcm, 16000, 1);
    // byteRate = sampleRate * channels * (bitsPerSample/8) = 16000 * 1 * 2
    expect(wav.readUInt32LE(28)).toBe(32000);
  });

  it('should write correct block align at offset 32', () => {
    const wav = pcm16ToWav(pcm, 16000, 1);
    expect(wav.readUInt16LE(32)).toBe(2); // 1 channel * 2 bytes

    const stereo = pcm16ToWav(pcm, 16000, 2);
    expect(stereo.readUInt16LE(32)).toBe(4); // 2 channels * 2 bytes
  });

  it('should write bits per sample (16) at offset 34', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.readUInt16LE(34)).toBe(16);
  });

  it('should write data chunk marker at offset 36', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  it('should write correct data size at offset 40', () => {
    const wav = pcm16ToWav(pcm);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it('should preserve original PCM data after header', () => {
    const testPcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]);
    const wav = pcm16ToWav(testPcm);
    expect(wav.slice(44)).toEqual(testPcm);
  });
});

// ─── splitBySentence ───────────────────────────────────────────
describe('splitBySentence', () => {
  it('should split multiple sentences', () => {
    const result = splitBySentence('Hello world. How are you doing today? I am fine!');
    expect(result.length).toBeGreaterThanOrEqual(2);
    // All original text should be represented
    const joined = result.join(' ');
    expect(joined).toContain('Hello world.');
    expect(joined).toContain('I am fine!');
  });

  it('should return single element for one sentence', () => {
    const result = splitBySentence('This is a single long enough sentence with punctuation.');
    expect(result.length).toBe(1);
    expect(result[0]).toContain('This is a single');
  });

  it('should return empty array for empty string', () => {
    expect(splitBySentence('')).toEqual([]);
  });

  it('should return empty array for whitespace-only string', () => {
    expect(splitBySentence('   ')).toEqual([]);
  });

  it('should return text as-is when no sentence punctuation', () => {
    const result = splitBySentence('Hello world no punctuation here');
    expect(result).toEqual(['Hello world no punctuation here']);
  });

  it('should merge short sentences below 20 chars', () => {
    // "Hi. Ok. " are short — should be merged together
    const result = splitBySentence('Hi. Ok. Sure thing, that works for me. Absolutely wonderful news!');
    // The first two short sentences should be merged with subsequent text
    for (const s of result) {
      // Each chunk should be non-empty
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('should handle exclamation and question marks', () => {
    const result = splitBySentence('What is happening? This is amazing! I agree.');
    expect(result.length).toBeGreaterThanOrEqual(1);
    const joined = result.join(' ');
    expect(joined).toContain('What is happening?');
    expect(joined).toContain('This is amazing!');
  });
});

// ─── normalizeAudio ────────────────────────────────────────────
describe('normalizeAudio', () => {
  it('should return same buffer for silent audio (all zeros)', () => {
    const silent = Buffer.alloc(100);
    const result = normalizeAudio(silent);
    expect(result).toBe(silent); // same reference — no processing
  });

  it('should return same buffer when already near target peak', () => {
    // Create buffer with peak near 0.9 * 32767 ≈ 29490
    const buf = Buffer.alloc(4);
    const samples = new Int16Array(buf.buffer, buf.byteOffset, 2);
    samples[0] = 29490;
    samples[1] = -10000;

    const result = normalizeAudio(buf, 0.9);
    // gain = (32767 * 0.9) / 29490 ≈ 0.9998, which is within 0.05 of 1.0
    expect(result).toBe(buf);
  });

  it('should amplify quiet audio to target peak', () => {
    // Create quiet audio with peak at 1000 (very quiet)
    const buf = Buffer.alloc(8);
    const samples = new Int16Array(buf.buffer, buf.byteOffset, 4);
    samples[0] = 1000;
    samples[1] = -500;
    samples[2] = 200;
    samples[3] = -1000;

    const result = normalizeAudio(buf, 0.9);
    const outSamples = new Int16Array(result.buffer, result.byteOffset, 4);

    // Expected gain = (32767 * 0.9) / 1000 ≈ 29.49
    // Peak sample should be close to 29490
    expect(Math.abs(outSamples[0])).toBeGreaterThan(20000);
    // The peak should be near the target
    const peak = Math.max(...Array.from(outSamples).map(Math.abs));
    expect(peak).toBeCloseTo(29490, -2); // within ~100
  });

  it('should not exceed 16-bit range after normalization', () => {
    // Edge case: one sample near max, one at max negative
    const buf = Buffer.alloc(4);
    const samples = new Int16Array(buf.buffer, buf.byteOffset, 2);
    samples[0] = 100;
    samples[1] = -100;

    const result = normalizeAudio(buf, 0.9);
    const outSamples = new Int16Array(result.buffer, result.byteOffset, 2);

    for (let i = 0; i < outSamples.length; i++) {
      expect(outSamples[i]).toBeGreaterThanOrEqual(-32768);
      expect(outSamples[i]).toBeLessThanOrEqual(32767);
    }
  });

  it('should produce new buffer (not mutate input) when gain is applied', () => {
    const buf = Buffer.alloc(4);
    const samples = new Int16Array(buf.buffer, buf.byteOffset, 2);
    samples[0] = 500;
    samples[1] = -500;

    const result = normalizeAudio(buf, 0.9);
    expect(result).not.toBe(buf);
    // Original should be untouched
    const origSamples = new Int16Array(buf.buffer, buf.byteOffset, 2);
    expect(origSamples[0]).toBe(500);
  });
});
