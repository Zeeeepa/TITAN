/**
 * TITAN — Voice Pipeline
 * Orchestrates: mic audio → STT → agent → TTS → speaker
 * Supports push-to-talk, interrupt, and voice cloning.
 */
import type { WebSocket } from 'ws';
import type { STTProvider } from './stt/base.js';
import type { TTSProvider } from './tts/base.js';
import { splitBySentence } from './audioUtils.js';
import { loadConfig } from '../config/config.js';
import { processMessage } from '../agent/agent.js';
import logger from '../utils/logger.js';

const COMPONENT = 'VoicePipeline';

/** Binary frame headers for audio streaming */
const AUDIO_CHUNK = 0x01;
const AUDIO_END = 0x02;
const INTERRUPT_ACK = 0x03;

interface ActiveSession {
  abortController: AbortController;
  isSpeaking: boolean;
}

export class VoicePipeline {
  private sttProvider: STTProvider;
  private personalTTS: TTSProvider;    // Chatterbox (cloned voice) for personal sessions
  private customerTTS: TTSProvider;    // Orpheus (standard voices) for customers
  private fallbackTTS?: TTSProvider;   // OpenAI TTS cloud fallback
  private sessions: Map<WebSocket, ActiveSession> = new Map();
  private personalVoice: string;
  private customerVoice: string;
  private ttsSpeed: number;

  constructor(options: {
    stt: STTProvider;
    personalTTS: TTSProvider;
    customerTTS: TTSProvider;
    fallbackTTS?: TTSProvider;
    personalVoice?: string;
    customerVoice?: string;
    ttsSpeed?: number;
  }) {
    this.sttProvider = options.stt;
    this.personalTTS = options.personalTTS;
    this.customerTTS = options.customerTTS;
    this.fallbackTTS = options.fallbackTTS;
    this.personalVoice = options.personalVoice || 'default';
    this.customerVoice = options.customerVoice || 'tara';
    this.ttsSpeed = options.ttsSpeed || 1.0;

    logger.info(COMPONENT, `Voice pipeline initialized — STT: ${this.sttProvider.name}, Personal TTS: ${this.personalTTS.name}, Customer TTS: ${this.customerTTS.name}`);
  }

  /**
   * Handle incoming audio from a WebSocket client.
   * Flow: STT → agent → TTS → stream back
   */
  async handleAudioInput(audioBuffer: Buffer, ws: WebSocket, userId: string = 'dashboard'): Promise<void> {
    // Interrupt any in-flight response for this client
    this.interrupt(ws);

    const session: ActiveSession = {
      abortController: new AbortController(),
      isSpeaking: false,
    };
    this.sessions.set(ws, session);

    try {
      // 1. STT — transcribe the audio
      logger.debug(COMPONENT, `STT processing ${audioBuffer.length} bytes from ${userId}`);
      const { text, durationMs: sttMs } = await this.sttProvider.transcribe(audioBuffer, 'pcm16', 16000);

      if (!text || text.trim().length === 0) {
        logger.debug(COMPONENT, 'STT returned empty transcript, ignoring');
        return;
      }

      if (session.abortController.signal.aborted) return;

      // 2. Send inbound transcript to client for chat display
      this.sendJson(ws, {
        type: 'voice_transcript',
        text: text.trim(),
        direction: 'inbound',
        meta: { sttMs, sttProvider: this.sttProvider.name },
      });

      // 3. Run through agent pipeline
      logger.info(COMPONENT, `Voice query from ${userId}: "${text.trim().slice(0, 80)}"`);
      const response = await processMessage(text.trim(), 'webchat', userId);

      if (session.abortController.signal.aborted) return;

      // 4. Send outbound transcript to client
      this.sendJson(ws, {
        type: 'voice_transcript',
        text: response.content,
        direction: 'outbound',
        meta: {
          model: response.model,
          durationMs: response.durationMs,
          toolsUsed: response.toolsUsed,
        },
      });

      // 5. Select TTS provider based on user
      const isPersonalSession = this.isPersonalSession(userId);
      const ttsProvider = isPersonalSession ? this.personalTTS : this.customerTTS;
      const voice = isPersonalSession ? this.personalVoice : this.customerVoice;

      // 6. Stream TTS output
      session.isSpeaking = true;
      await this.streamTTS(ws, session, response.content, ttsProvider, voice);

    } catch (err) {
      if (session.abortController.signal.aborted) return;
      logger.error(COMPONENT, `Voice pipeline error: ${(err as Error).message}`);
      this.sendJson(ws, {
        type: 'voice_transcript',
        text: `Voice error: ${(err as Error).message}`,
        direction: 'outbound',
      });
    } finally {
      this.sessions.delete(ws);
    }
  }

  /**
   * Stream TTS audio to the client, sentence by sentence for lower latency.
   */
  private async streamTTS(
    ws: WebSocket,
    session: ActiveSession,
    text: string,
    ttsProvider: TTSProvider,
    voice: string,
  ): Promise<void> {
    const sentences = splitBySentence(text);
    let isFirstSentence = true;

    for (const sentence of sentences) {
      if (session.abortController.signal.aborted) return;

      let sentenceChunks: Buffer[] = [];

      try {
        for await (const chunk of ttsProvider.synthesizeStream(sentence, voice, this.ttsSpeed)) {
          if (session.abortController.signal.aborted) return;
          sentenceChunks.push(chunk);
        }
      } catch (err) {
        // Try fallback TTS if primary fails
        if (this.fallbackTTS && ttsProvider !== this.fallbackTTS) {
          logger.warn(COMPONENT, `Primary TTS failed, trying fallback: ${(err as Error).message}`);
          sentenceChunks = [];
          try {
            for await (const chunk of this.fallbackTTS.synthesizeStream(sentence, 'alloy', this.ttsSpeed)) {
              if (session.abortController.signal.aborted) return;
              sentenceChunks.push(chunk);
            }
          } catch (fallbackErr) {
            logger.error(COMPONENT, `Fallback TTS also failed: ${(fallbackErr as Error).message}`);
          }
        } else {
          logger.error(COMPONENT, `TTS failed: ${(err as Error).message}`);
        }
      }

      // Concatenate sentence audio and strip WAV headers from non-first sentences
      let audioData = Buffer.concat(sentenceChunks);
      if (!isFirstSentence && audioData.length > 44) {
        // Check for WAV header (RIFF....WAVE)
        if (audioData[0] === 0x52 && audioData[1] === 0x49 && audioData[2] === 0x46 && audioData[3] === 0x46) {
          audioData = audioData.subarray(44);
        }
      }
      isFirstSentence = false;

      // Send as binary frame: 1-byte header + audio data
      if (audioData.length > 0) {
        const frame = Buffer.alloc(1 + audioData.length);
        frame[0] = AUDIO_CHUNK;
        audioData.copy(frame, 1);
        this.sendBinary(ws, frame);
      }
    }

    // Send end-of-stream marker
    if (!session.abortController.signal.aborted) {
      this.sendBinary(ws, Buffer.from([AUDIO_END]));
      session.isSpeaking = false;
    }
  }

  /**
   * Interrupt any in-flight response for a client.
   */
  interrupt(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      session.abortController.abort();
      session.isSpeaking = false;
      // Send interrupt acknowledgement
      this.sendBinary(ws, Buffer.from([INTERRUPT_ACK]));
      this.sessions.delete(ws);
      logger.debug(COMPONENT, 'Voice response interrupted');
    }
  }

  /**
   * Check if this is a personal session (uses cloned voice).
   */
  private isPersonalSession(userId: string): boolean {
    // Dashboard user uses personal voice by default (main session)
    return userId === 'dashboard';
  }

  /**
   * Speak text aloud via TTS (for auto-speaking text responses when voice is enabled).
   * Skips STT and agent — just does TTS → stream audio.
   */
  async speakText(text: string, ws: WebSocket, userId: string = 'dashboard'): Promise<void> {
    // Interrupt any current speech
    this.interrupt(ws);

    const session: ActiveSession = {
      abortController: new AbortController(),
      isSpeaking: true,
    };
    this.sessions.set(ws, session);

    try {
      const isPersonal = this.isPersonalSession(userId);
      const ttsProvider = isPersonal ? this.personalTTS : this.customerTTS;
      const voice = isPersonal ? this.personalVoice : this.customerVoice;

      await this.streamTTS(ws, session, text, ttsProvider, voice);
    } catch (err) {
      if (!session.abortController.signal.aborted) {
        logger.error(COMPONENT, `Voice speak error: ${(err as Error).message}`);
      }
    } finally {
      // Always send end-of-stream so client knows to play/cleanup
      this.sendBinary(ws, Buffer.from([AUDIO_END]));
      this.sessions.delete(ws);
    }
  }

  /**
   * Cleanup when a WebSocket disconnects.
   */
  cleanup(ws: WebSocket): void {
    this.interrupt(ws);
  }

  private sendJson(ws: WebSocket, data: Record<string, unknown>): void {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
    }
  }

  private sendBinary(ws: WebSocket, data: Buffer): void {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  }
}

/**
 * Create a VoicePipeline from the current config.
 * Lazy-loads providers based on config settings.
 */
export async function createVoicePipeline(): Promise<VoicePipeline | null> {
  const config = loadConfig();
  const voiceConfig = (config as Record<string, unknown> & { voice?: VoiceConfig }).voice || {} as VoiceConfig;

  // Resolve STT provider
  let stt: STTProvider;
  const sttCfg = voiceConfig.stt || {};
  const sttProvider = sttCfg.provider || (config.providers.openai?.apiKey ? 'openai' : 'local');

  switch (sttProvider) {
    case 'deepgram': {
      const { DeepgramSTTProvider } = await import('./stt/deepgram.js');
      stt = new DeepgramSTTProvider(sttCfg.deepgramApiKey || '');
      break;
    }
    case 'openai': {
      const { OpenAIWhisperSTTProvider } = await import('./stt/openaiWhisper.js');
      stt = new OpenAIWhisperSTTProvider(config.providers.openai?.apiKey || '');
      break;
    }
    case 'local':
    default: {
      const { LocalWhisperSTTProvider } = await import('./stt/localWhisper.js');
      stt = new LocalWhisperSTTProvider(sttCfg.localUrl || 'http://localhost:48421');
      break;
    }
  }

  // Resolve TTS providers
  const ttsCfg = voiceConfig.tts || {};
  let personalTTS: TTSProvider;
  let customerTTS: TTSProvider;
  let fallbackTTS: TTSProvider | undefined;

  // If OpenAI key is available, use it as fallback (and primary if local servers aren't configured)
  if (config.providers.openai?.apiKey) {
    const { OpenAITTSProvider } = await import('./tts/openaiTts.js');
    fallbackTTS = new OpenAITTSProvider(config.providers.openai.apiKey);
  }

  try {
    const { ChatterboxTTSProvider } = await import('./tts/chatterbox.js');
    personalTTS = new ChatterboxTTSProvider(
      ttsCfg.chatterboxUrl || 'http://localhost:48422',
      voiceConfig.personalReferenceClip || '~/.titan/voice-references/default/clip1.wav',
    );
  } catch {
    // Fall back to OpenAI TTS if Chatterbox unavailable
    if (fallbackTTS) {
      personalTTS = fallbackTTS;
      logger.warn(COMPONENT, 'Chatterbox TTS unavailable, using OpenAI TTS fallback');
    } else {
      logger.error(COMPONENT, 'No TTS provider available');
      return null;
    }
  }

  try {
    const { OrpheusTTSProvider } = await import('./tts/orpheus.js');
    customerTTS = new OrpheusTTSProvider(
      ttsCfg.orpheusUrl || 'http://localhost:48423',
    );
  } catch {
    customerTTS = fallbackTTS || personalTTS;
    logger.warn(COMPONENT, 'Orpheus TTS unavailable, using fallback');
  }

  return new VoicePipeline({
    stt,
    personalTTS,
    customerTTS,
    fallbackTTS,
    personalVoice: voiceConfig.personalVoice || 'default',
    customerVoice: voiceConfig.customerVoice || 'tara',
    ttsSpeed: ttsCfg.speed || 1.0,
  });
}

// Type for voice config section
interface VoiceConfig {
  enabled: boolean;
  stt: {
    provider?: 'openai' | 'deepgram' | 'local';
    model?: string;
    language?: string;
    localUrl?: string;
    deepgramApiKey?: string;
  };
  tts: {
    provider?: 'chatterbox' | 'orpheus' | 'openai';
    voice?: string;
    speed?: number;
    chatterboxUrl?: string;
    orpheusUrl?: string;
  };
  personalVoice?: string;
  personalReferenceClip?: string;
  customerVoice?: string;
  defaultMode?: 'push-to-talk' | 'hands-free';
  maxRecordingSeconds?: number;
}
