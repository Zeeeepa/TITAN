import { useState, useEffect, useCallback } from 'react';
import { X, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useLiveKit } from '@/hooks/useLiveKit';
import { AudioVisualizer } from './AudioVisualizer';
import { FluidOrb } from './FluidOrb';
import { TranscriptView } from './TranscriptView';
import { VoicePicker } from './VoicePicker';

interface VoiceOverlayProps {
  onClose: () => void;
}

interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function VoiceOverlay({ onClose }: VoiceOverlayProps) {
  const { state, tokenData, error, connect, disconnect } = useLiveKit();
  const [liveKitAvailable, setLiveKitAvailable] = useState<boolean | null>(null);
  const [LKComponents, setLKComponents] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [visible, setVisible] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [phase, setPhase] = useState<'picking' | 'connecting' | 'active'>('picking');
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [activeSpeaker, setActiveSpeaker] = useState<'idle' | 'user' | 'assistant'>('idle');

  // Load saved voice preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('titan-voice');
      if (saved) setSelectedVoice(saved);
    } catch { /* ignore */ }
  }, []);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Simulate audio level + speaker detection for visualization
  useEffect(() => {
    if (phase !== 'active') {
      setAudioLevel(0);
      setActiveSpeaker('idle');
      return;
    }
    if (isMuted) {
      setAudioLevel(0.15);
      setActiveSpeaker('idle');
      return;
    }
    let frame: number;
    let t = 0;
    let speakerCycle = 0;
    function tick() {
      t += 1;
      speakerCycle += 0.002;
      // Simulate speaker switching (will be replaced by real LiveKit data)
      const isAssistantTurn = Math.sin(speakerCycle) > 0.3;
      setActiveSpeaker(isAssistantTurn ? 'assistant' : 'user');

      const base = 0.3 + Math.sin(t * 0.02) * 0.15;
      const burst = Math.random() > 0.85 ? Math.random() * 0.4 : 0;
      setAudioLevel(Math.min(1, base + burst));
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, isMuted]);

  // Try loading LiveKit components
  useEffect(() => {
    import('@livekit/components-react')
      .then((mod) => {
        setLKComponents(mod);
        setLiveKitAvailable(true);
      })
      .catch(() => {
        setLiveKitAvailable(false);
      });
  }, []);

  // When state transitions to connected, move to active phase
  useEffect(() => {
    if (state === 'connected' && phase === 'connecting') {
      setPhase('active');
    }
  }, [state, phase]);

  const handleVoiceSelect = useCallback(async (voiceId: string) => {
    setSelectedVoice(voiceId);
    localStorage.setItem('titan-voice', voiceId);

    // Update voice config on server
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: { ttsVoice: voiceId } }),
      });
    } catch { /* non-critical */ }

    setPhase('connecting');
    connect();
  }, [connect]);

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
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } catch { /* preview not available */ }
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    disconnect();
    setTimeout(onClose, 200);
  }, [disconnect, onClose]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

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

      {/* Phase: Connecting */}
      {phase === 'connecting' && (
        <>
          <div className="mb-8 text-center">
            <div className="text-lg font-medium mb-1 text-[#fafafa]">
              {state === 'connecting' && 'Connecting...'}
              {state === 'error' && 'Connection Failed'}
              {state === 'disconnected' && 'Disconnected'}
            </div>
            {state === 'error' && error && (
              <div className="text-sm text-red-500">{error}</div>
            )}
          </div>

          {/* LiveKit not installed message */}
          {liveKitAvailable === false && (
            <div className="mb-8 rounded-lg px-6 py-4 text-center bg-[#27272a]">
              <p className="mb-2 text-sm font-medium text-[#fafafa]">
                Voice packages not installed
              </p>
              <code className="rounded px-2 py-1 text-xs bg-[#18181b] text-[#a855f7]">
                npm install @livekit/components-react livekit-client
              </code>
            </div>
          )}

          <AudioVisualizer
            type="wave"
            active={false}
            color="#6366f1"
            audioLevel={0}
          />
        </>
      )}

      {/* Phase: Active call */}
      {phase === 'active' && (
        <>
          {/* Status */}
          <div className="mb-6 text-center">
            <div className="text-base font-medium mb-0.5 transition-colors duration-500" style={{
              color: activeSpeaker === 'user' ? '#22d3ee' : activeSpeaker === 'assistant' ? '#a78bfa' : '#71717a',
            }}>
              {isMuted ? 'Muted' : activeSpeaker === 'assistant' ? 'TITAN is speaking...' : 'Listening...'}
            </div>
          </div>

          {/* Fluid orb with TITAN logo */}
          <FluidOrb
            audioLevel={audioLevel}
            speaker={isMuted ? 'idle' : activeSpeaker}
            size={260}
          />

          {/* LiveKit Room */}
          {liveKitAvailable && LKComponents && tokenData && state === 'connected' && (
            <LiveKitSession
              LK={LKComponents}
              serverUrl={tokenData.serverUrl}
              token={tokenData.participantToken}
              isMuted={isMuted}
              onTranscript={(msg) => {
                setMessages((prev) => [...prev, msg]);
                setActiveSpeaker(msg.role === 'assistant' ? 'assistant' : 'user');
              }}
            />
          )}

          {/* Transcript */}
          <div className="mt-8 w-full max-w-lg px-4">
            <TranscriptView
              messages={messages}
              isListening={!isMuted}
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

/**
 * Renders the actual LiveKit room connection.
 * Isolated so the dynamic import types stay contained.
 */
function LiveKitSession({
  LK,
  serverUrl,
  token,
  isMuted,
  onTranscript,
}: {
  LK: any;
  serverUrl: string;
  token: string;
  isMuted: boolean;
  onTranscript: (msg: TranscriptMessage) => void;
}) {
  const { LiveKitRoom, RoomAudioRenderer } = LK;

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      audio={!isMuted}
      connect={true}
      style={{ display: 'contents' }}
    >
      <RoomAudioRenderer />
      <VoiceAssistantBridge LK={LK} onTranscript={onTranscript} />
    </LiveKitRoom>
  );
}

/**
 * Uses the LiveKit useVoiceAssistant hook if available to capture transcripts.
 * Must be rendered inside LiveKitRoom.
 */
function VoiceAssistantBridge({
  LK,
  onTranscript,
}: {
  LK: any;
  onTranscript: (msg: TranscriptMessage) => void;
}) {
  const useVoiceAssistant = LK.useVoiceAssistant;
  if (!useVoiceAssistant) return null;

  return <VoiceAssistantInner useVoiceAssistant={useVoiceAssistant} onTranscript={onTranscript} />;
}

function VoiceAssistantInner({
  useVoiceAssistant,
  onTranscript,
}: {
  useVoiceAssistant: any;
  onTranscript: (msg: TranscriptMessage) => void;
}) {
  const voiceAssistant = useVoiceAssistant();
  const lastTranscript = voiceAssistant?.lastTranscript;

  useEffect(() => {
    if (lastTranscript?.text) {
      onTranscript({
        role: lastTranscript.participantKind === 'agent' ? 'assistant' : 'user',
        text: lastTranscript.text,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTranscript]);

  return null;
}
