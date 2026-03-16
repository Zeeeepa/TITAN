import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Mic, MicOff, PhoneOff, ChevronDown } from 'lucide-react';
import { FluidOrb } from './FluidOrb';
import { TranscriptView } from './TranscriptView';
import { VoicePicker, getVoiceInfo } from './VoicePicker';

interface VoiceOverlayProps {
  onClose: () => void;
}

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

let msgCounter = 0;
const nextMsgId = () => `voice-msg-${Date.now()}-${++msgCounter}`;

/** Strip Orpheus emotion tags for display (keep for TTS) */
const stripEmotionTags = (text: string) =>
  text.replace(/<(?:laugh|chuckle|sigh|cough|sniffle|groan|yawn|gasp)>/gi, '').replace(/\s{2,}/g, ' ').trim();

/** Strip markdown formatting for voice responses */
const stripMarkdown = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, '')    // code blocks
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/^#+\s+/gm, '')           // headings
    .replace(/^[-*]\s+/gm, '')         // bullet points
    .replace(/\n{2,}/g, ' ')           // collapse newlines
    .trim();

/** Strip tool narration that LLMs leak despite prompt instructions */
const stripToolNarration = (text: string) =>
  text
    .replace(/(?:Let me |I'll |I will |I'm going to )(?:use|call|check|run|invoke|execute|try)(?: the)? \w[\w_]*(?: tool)?(?:\s+(?:to|for|and)\b[^.!?]*)?[.!]?\s*/gi, '')
    .replace(/\b(?:Using|Calling|Running|Checking|Invoking|Executing) (?:the )?\w[\w_]*(?: tool)?(?:\s+(?:to|for)\b[^.!?]*)?[.!]?\s*/gi, '')
    .replace(/\b\w[\w_]*(?:_\w+)+\b/g, '')  // bare tool_names like ha_setup, web_search
    .replace(/\s{2,}/g, ' ')
    .trim();

/* eslint-disable @typescript-eslint/no-explicit-any */

// Browser Speech Recognition types
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Direct voice mode — uses browser Web Speech API for STT and Orpheus TTS for speech.
 * No LiveKit required.
 */
export function VoiceOverlay({ onClose }: VoiceOverlayProps) {
  const [visible, setVisible] = useState(false);
  const savedVoice = localStorage.getItem('titan-voice') || '';
  const [phase, setPhase] = useState<'picking' | 'active'>(savedVoice ? 'active' : 'picking');
  const [selectedVoice, setSelectedVoice] = useState<string>(savedVoice);
  const selectedVoiceRef = useRef<string>(savedVoice);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  const ORPHEUS_VOICES = ['tara', 'leah', 'jess', 'mia', 'zoe', 'leo', 'dan', 'zac'];

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTranscriptRef = useRef('');
  const levelAnimRef = useRef<number>(0);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const interruptCheckRef = useRef<number>(0);
  const processingRef = useRef(false); // guard against overlapping handleUserMessage calls

  // Refs to avoid stale closures in recognition callbacks
  const isMutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const phaseRef = useRef<'picking' | 'active'>('picking');

  // Keep refs in sync with state
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Close voice menu on outside click
  useEffect(() => {
    if (!showVoiceMenu) return;
    const handler = () => setShowVoiceMenu(false);
    // Delay so the toggle click doesn't immediately close
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [showVoiceMenu]);

  // Mic level monitoring
  const startMicMonitor = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length / 255;
        setAudioLevel(avg);
        levelAnimRef.current = requestAnimationFrame(tick);
      }
      levelAnimRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.error('Mic access denied:', e);
    }
  }, []);

  const stopMicMonitor = useCallback(() => {
    cancelAnimationFrame(levelAnimRef.current);
    cancelAnimationFrame(interruptCheckRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    micStreamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Speech recognition setup — uses refs to avoid stale closure bug
  const startRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported');
      return;
    }

    // Stop any existing recognition before creating new one
    try { recognitionRef.current?.stop(); } catch { /* ok */ }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Ignore speech recognition results while TITAN is speaking — it's echo
      if (isSpeakingRef.current) return;

      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Filter low-confidence results — likely echo artifacts from speaker bleed
        if (result[0].confidence > 0 && result[0].confidence < 0.5) continue;

        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimText(interim);
      }

      if (final) {
        currentTranscriptRef.current += final;
        setInterimText('');

        // Reset silence timer — wait for user to stop speaking
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          const text = currentTranscriptRef.current.trim();
          if (text) {
            currentTranscriptRef.current = '';
            handleUserMessage(text);
          }
        }, 1200); // 1.2s silence = end of utterance
      }
    };

    recognition.onend = () => {
      // Use refs (not state) to avoid stale closure — these always have current values
      // Don't auto-restart while TITAN is speaking — mic would pick up TTS audio
      if (!isMutedRef.current && !isSpeakingRef.current && phaseRef.current === 'active') {
        try { recognition.start(); } catch { /* already started */ }
      }
      setIsListening(false);
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onerror = (e: any) => {
      console.error('Speech recognition error:', e.error);
      if (e.error === 'not-allowed') {
        setErrorMsg('Mic access denied — check browser permissions');
        setIsListening(false);
      } else if (e.error === 'network') {
        setErrorMsg('Speech recognition network error');
        setTimeout(() => {
          if (!isMutedRef.current && phaseRef.current === 'active') {
            try { recognition.start(); } catch { /* ok */ }
          }
        }, 2000);
      } else if (e.error === 'audio-capture') {
        setErrorMsg('Mic not available — is another app using it?');
        setIsListening(false);
      } else if (e.error !== 'no-speech') {
        console.error('STT error:', e.error);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch { /* already started */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop any currently playing audio (enables interruption)
  const stopCurrentAudio = useCallback(() => {
    const audio = currentAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      currentAudioRef.current = null;
    }
    // Also cancel browser speech synthesis
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setAudioLevel(0);
  }, []);

  // Auto-start mic when resuming a saved voice (skipping picker)
  useEffect(() => {
    if (savedVoice && phase === 'active') {
      startMicMonitor();
      startRecognition();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Send user message to TITAN and speak the response via TTS
  const handleUserMessage = useCallback(async (text: string) => {
    // Prevent overlapping calls (echo can trigger rapid duplicate messages)
    if (processingRef.current) return;
    processingRef.current = true;

    // If TITAN is speaking, interrupt it
    stopCurrentAudio();

    // Abort any in-flight requests
    abortRef.current?.abort();

    setMessages(prev => [...prev, { id: nextMsgId(), role: 'user', text }]);
    setIsThinking(true);
    setIsListening(false);
    setErrorMsg(null);

    // Pause recognition while processing
    try { recognitionRef.current?.stop(); } catch { /* ok */ }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Send to TITAN with session continuity and timeout
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          channel: 'voice',
          sessionId: sessionIdRef.current,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`TITAN request failed (${res.status})`);
      const data = await res.json();

      // Track session for continuity
      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
      }

      // Process response text: markdown → emotion tags → tool narration
      const rawText = data.content || 'Sorry, I couldn\'t process that.';
      const cleanText = stripMarkdown(rawText);
      const displayText = stripToolNarration(stripEmotionTags(cleanText));

      setMessages(prev => [...prev, { id: nextMsgId(), role: 'assistant', text: displayText }]);
      setIsThinking(false);

      // Speak the response — try Orpheus server TTS first (fast GPU), browser TTS fallback
      setIsSpeaking(true);
      const voice = selectedVoiceRef.current || 'tara';

      // Use displayText for TTS so spoken words match what's shown
      // Truncate for TTS to avoid long hangs (max ~500 chars)
      const ttsText = displayText.length > 500 ? displayText.slice(0, 497) + '...' : displayText;

      // Try server TTS (Orpheus) — separate AbortController so it doesn't kill other requests
      let useBrowserTTS = false;
      let url = '';

      try {
        const ttsController = new AbortController();
        const ttsTimeoutId = setTimeout(() => ttsController.abort(), 15000); // 15s max
        const ttsRes = await fetch('/api/voice/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice, text: ttsText }),
          signal: ttsController.signal,
        });
        clearTimeout(ttsTimeoutId);

        if (!ttsRes.ok) {
          useBrowserTTS = true;
        } else {
          const blob = await ttsRes.blob();
          url = URL.createObjectURL(blob);
        }
      } catch {
        useBrowserTTS = true;
      }

      // Fallback: browser Speech Synthesis API (instant, no server needed)
      if (useBrowserTTS && 'speechSynthesis' in window) {
        try { recognitionRef.current?.stop(); } catch { /* ok */ }
        const utterance = new SpeechSynthesisUtterance(ttsText);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        const synthInterval = setInterval(() => {
          setAudioLevel(0.3 + Math.random() * 0.3);
        }, 100);
        utterance.onend = () => {
          clearInterval(synthInterval);
          setIsSpeaking(false);
          setAudioLevel(0);
          currentTranscriptRef.current = '';
          setTimeout(() => {
            processingRef.current = false;
            if (!isMutedRef.current && phaseRef.current === 'active') {
              try { recognitionRef.current?.start(); } catch { /* ok */ }
            }
          }, 1500);
        };
        utterance.onerror = () => {
          clearInterval(synthInterval);
          setIsSpeaking(false);
          setAudioLevel(0);
          currentTranscriptRef.current = '';
          processingRef.current = false;
          try { recognitionRef.current?.start(); } catch { /* ok */ }
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        return;
      }

      if (useBrowserTTS) {
        setIsSpeaking(false);
        processingRef.current = false;
        try { recognitionRef.current?.start(); } catch { /* ok */ }
        return;
      }

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      // Simulate audio levels from playback + monitor mic for voice interrupts
      let levelFrame: number;
      let interruptFrames = 0; // consecutive frames above threshold
      const INTERRUPT_THRESHOLD = 0.45; // mic energy needed to interrupt (above TTS bleed)
      const INTERRUPT_FRAMES = 8; // ~130ms of sustained loud input to trigger interrupt

      const simulateLevel = () => {
        // Check mic energy — if user is speaking over TITAN, interrupt
        const analyser = analyserRef.current;
        if (analyser) {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const micEnergy = sum / data.length / 255;

          if (micEnergy > INTERRUPT_THRESHOLD) {
            interruptFrames++;
            if (interruptFrames >= INTERRUPT_FRAMES) {
              // User is speaking — interrupt TITAN
              audio.pause();
              audio.src = '';
              currentAudioRef.current = null;
              cancelAnimationFrame(levelFrame);
              setIsSpeaking(false);
              setAudioLevel(0);
              URL.revokeObjectURL(url);
              // Clear any buffered echo transcript, then resume recognition
              currentTranscriptRef.current = '';
              setInterimText('');
              processingRef.current = false;
              setTimeout(() => {
                try { recognitionRef.current?.start(); } catch { /* ok */ }
              }, 300);
              return;
            }
          } else {
            interruptFrames = 0;
          }
        }

        setAudioLevel(0.3 + Math.random() * 0.4);
        levelFrame = requestAnimationFrame(simulateLevel);
      };

      audio.onplay = () => {
        // Fully stop STT during TTS playback to prevent buffered echo
        try { recognitionRef.current?.stop(); } catch { /* ok */ }
        simulateLevel();
      };

      const cleanup = () => {
        cancelAnimationFrame(levelFrame);
        URL.revokeObjectURL(url);
        audio.src = '';
        currentAudioRef.current = null;
        setIsSpeaking(false);
        setAudioLevel(0);
        // Clear any buffered transcript that might be echo
        currentTranscriptRef.current = '';
        setInterimText('');
        // Grace period — let echo fully decay before restarting STT (1.5s)
        setTimeout(() => {
          processingRef.current = false;
          if (!isMutedRef.current && phaseRef.current === 'active') {
            try { recognitionRef.current?.start(); } catch { /* ok */ }
          }
        }, 1500);
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;

      await audio.play();
    } catch (e: any) {
      // Ignore aborts from component close
      if (e?.name === 'AbortError' && !abortRef.current) return;

      const isTimeout = e?.name === 'AbortError';
      const msg = isTimeout ? 'Request timed out' : 'Connection error';
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
      console.error('Voice processing error:', e);
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'assistant', text: isTimeout ? 'Sorry, that took too long. Try again.' : 'Sorry, something went wrong.' }]);
      setIsThinking(false);
      setIsSpeaking(false);
      currentTranscriptRef.current = '';
      processingRef.current = false;
      try { recognitionRef.current?.start(); } catch { /* ok */ }
    }
  }, [stopCurrentAudio]);

  // Voice selection handler
  const handleVoiceSelect = useCallback(async (voiceId: string) => {
    setSelectedVoice(voiceId);
    selectedVoiceRef.current = voiceId;
    localStorage.setItem('titan-voice', voiceId);

    // Update voice config on server
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: { ttsVoice: voiceId } }),
      });
    } catch { /* non-critical */ }

    setPhase('active');
    startMicMonitor();
    startRecognition();
  }, [startMicMonitor, startRecognition]);

  // Switch voice during active chat (no need to go back to picker)
  const switchVoice = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    selectedVoiceRef.current = voiceId;
    localStorage.setItem('titan-voice', voiceId);
    setShowVoiceMenu(false);
    // Update server config
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: { ttsVoice: voiceId } }),
    }).catch(() => {/* non-critical */});
  }, []);

  // Preview voice
  const handlePreview = useCallback(async (voiceId: string) => {
    try {
      const res = await fetch('/api/voice/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId, text: 'Hey! I\'m TITAN, your AI assistant.' }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.src = '';
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play();
    } catch { /* preview not available */ }
  }, []);

  // Close handler — abort in-flight requests, stop audio, stop mic
  const handleClose = useCallback(() => {
    setVisible(false);
    // Abort any in-flight fetches
    abortRef.current?.abort();
    abortRef.current = null;
    try { recognitionRef.current?.stop(); } catch { /* ok */ }
    stopCurrentAudio();
    stopMicMonitor();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setTimeout(onClose, 200);
  }, [onClose, stopMicMonitor, stopCurrentAudio]);

  // Toggle mute — also stops/starts mic stream so browser indicator reflects state
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      isMutedRef.current = newMuted;
      if (newMuted) {
        try { recognitionRef.current?.stop(); } catch { /* ok */ }
        stopMicMonitor();
        setIsListening(false);
      } else {
        startMicMonitor();
        try { recognitionRef.current?.start(); } catch { /* ok */ }
      }
      return newMuted;
    });
  }, [startMicMonitor, stopMicMonitor]);

  // Determine speaker state for the orb
  const activeSpeaker = isSpeaking ? 'assistant' : isThinking ? 'thinking' : isListening ? 'user' : 'idle';

  // Status text
  const statusText = isMuted
    ? 'Muted'
    : isSpeaking
      ? 'TITAN is speaking...'
      : isThinking
        ? 'Thinking...'
        : isListening
          ? (interimText ? `"${interimText}"` : 'Listening...')
          : 'Connected';

  const statusColor = isSpeaking ? '#a78bfa' : isThinking ? '#f59e0b' : isListening ? '#22d3ee' : '#71717a';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm transition-all duration-200"
      style={{
        backgroundColor: 'rgba(9, 9, 11, 0.95)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.95)',
      }}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute right-6 top-6 rounded-full p-2 transition-colors hover:bg-[#27272a] z-20"
        style={{ color: '#a1a1aa' }}
      >
        <X className="h-6 w-6" />
      </button>

      {/* Phase: Voice Picker */}
      {phase === 'picking' && (
        <div className="w-full h-full">
          <VoicePicker
            currentVoice={selectedVoice || undefined}
            onSelect={handleVoiceSelect}
            onPreview={handlePreview}
          />
        </div>
      )}

      {/* Phase: Active voice chat */}
      {phase === 'active' && (
        <>
          {/* Status */}
          <div className="mb-6 text-center">
            <div
              className="text-base font-medium mb-0.5 transition-colors duration-500 max-w-md truncate px-4"
              style={{ color: statusColor }}
            >
              {statusText}
            </div>
            {errorMsg && (
              <div
                className="text-xs font-medium mt-1 animate-pulse"
                style={{ color: '#ef4444' }}
              >
                {errorMsg}
              </div>
            )}
            {/* Voice selector */}
            <div className="relative mt-2">
              <button
                onClick={() => setShowVoiceMenu(prev => !prev)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:bg-[#27272a]"
                style={{ color: getVoiceInfo(selectedVoice || 'tara').glow }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: getVoiceInfo(selectedVoice || 'tara').glow }}
                />
                {getVoiceInfo(selectedVoice || 'tara').name}
                <ChevronDown className="h-3 w-3" />
              </button>

              {showVoiceMenu && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 mt-1 rounded-xl border border-[#27272a] bg-[#18181b]/95 backdrop-blur-sm p-1.5 shadow-xl z-30"
                  style={{ minWidth: 180 }}
                >
                  {ORPHEUS_VOICES.map(v => {
                    const info = getVoiceInfo(v);
                    const isActive = v === (selectedVoice || 'tara');
                    return (
                      <button
                        key={v}
                        onClick={() => switchVoice(v)}
                        className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#27272a]"
                        style={{ color: isActive ? info.glow : '#a1a1aa' }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: info.glow,
                            boxShadow: isActive ? `0 0 8px ${info.glow}60` : 'none',
                          }}
                        />
                        <span className="font-medium">{info.name}</span>
                        {isActive && (
                          <span className="ml-auto text-xs opacity-60">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Fluid orb */}
          <FluidOrb
            audioLevel={isMuted ? 0 : audioLevel}
            speaker={isMuted ? 'idle' : activeSpeaker}
            size={260}
          />

          {/* Transcript */}
          <div className="mt-8 w-full max-w-lg px-4">
            <TranscriptView
              messages={messages}
              isListening={isListening && !isMuted}
            />
          </div>

          {/* Controls bar */}
          <div className="absolute bottom-12 flex items-center gap-6">
            <button
              onClick={toggleMute}
              className="rounded-full p-4 transition-colors"
              style={{
                backgroundColor: isMuted ? '#ef4444' : '#27272a',
                color: '#fafafa',
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>

            <button
              onClick={handleClose}
              className="rounded-full p-4 transition-colors"
              style={{ backgroundColor: '#ef4444', color: '#fafafa' }}
              title="End call"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
