import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Mic, MicOff, PhoneOff, RotateCcw } from 'lucide-react';
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
  const [activeSpeaker, setActiveSpeaker] = useState<'idle' | 'user' | 'assistant' | 'thinking'>('idle');
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const networkType = useMemo(() => {
    const host = window.location.hostname;
    if (host.startsWith('100.')) return 'Tailscale';
    if (host === 'localhost' || host === '127.0.0.1') return 'Local';
    return 'LAN';
  }, []);

  // Auto-retry on connection failure
  useEffect(() => {
    if (state === 'error' && phase === 'connecting' && retryCount < MAX_RETRIES) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        connect();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state, phase, retryCount, connect]);

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

  // Handle agent state changes from LiveKit
  const handleAgentStateChange = useCallback((agentState: string) => {
    switch (agentState) {
      case 'listening':
        setActiveSpeaker('user');
        break;
      case 'thinking':
        setActiveSpeaker('thinking');
        break;
      case 'speaking':
        setActiveSpeaker('assistant');
        break;
      default:
        setActiveSpeaker('idle');
    }
  }, []);

  // Handle audio level updates from LiveKit
  const handleAudioLevelChange = useCallback((level: number) => {
    setAudioLevel(level);
  }, []);

  // Reset state when not active or muted
  useEffect(() => {
    if (phase !== 'active') {
      setAudioLevel(0);
      setActiveSpeaker('idle');
    } else if (isMuted) {
      setAudioLevel(0.15);
      setActiveSpeaker('idle');
    }
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
              {state === 'connecting' && (retryCount > 0 ? `Reconnecting (${retryCount}/${MAX_RETRIES})...` : 'Connecting...')}
              {state === 'error' && retryCount >= MAX_RETRIES && 'Connection Failed'}
              {state === 'error' && retryCount < MAX_RETRIES && `Retrying (${retryCount + 1}/${MAX_RETRIES})...`}
              {state === 'disconnected' && 'Disconnected'}
            </div>
            {state === 'error' && error && (
              <div className="text-sm text-red-500 mt-1">{error}</div>
            )}
            <div className="text-xs mt-1" style={{ color: '#52525b' }}>
              via {networkType}
            </div>
          </div>

          {/* Try Again button when max retries exhausted */}
          {state === 'error' && retryCount >= MAX_RETRIES && (
            <button
              onClick={() => {
                setRetryCount(0);
                connect();
              }}
              className="mb-6 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[#3f3f46]"
              style={{ backgroundColor: '#27272a', color: '#fafafa' }}
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </button>
          )}

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
              color: activeSpeaker === 'user' ? '#22d3ee' :
                     activeSpeaker === 'assistant' ? '#a78bfa' :
                     activeSpeaker === 'thinking' ? '#f59e0b' :
                     '#71717a',
            }}>
              {isMuted ? 'Muted' :
               activeSpeaker === 'assistant' ? 'TITAN is speaking...' :
               activeSpeaker === 'thinking' ? 'Thinking...' :
               activeSpeaker === 'user' ? 'Listening...' :
               'Connected'}
            </div>
            <div className="text-xs mt-1" style={{ color: '#52525b' }}>
              via {networkType}
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
              }}
              onAgentStateChange={handleAgentStateChange}
              onAudioLevelChange={handleAudioLevelChange}
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
  onAgentStateChange,
  onAudioLevelChange,
}: {
  LK: any;
  serverUrl: string;
  token: string;
  isMuted: boolean;
  onTranscript: (msg: TranscriptMessage) => void;
  onAgentStateChange: (state: string) => void;
  onAudioLevelChange: (level: number) => void;
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
      <VoiceAssistantBridge
        LK={LK}
        onTranscript={onTranscript}
        onAgentStateChange={onAgentStateChange}
        onAudioLevelChange={onAudioLevelChange}
      />
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
  onAgentStateChange,
  onAudioLevelChange,
}: {
  LK: any;
  onTranscript: (msg: TranscriptMessage) => void;
  onAgentStateChange: (state: string) => void;
  onAudioLevelChange: (level: number) => void;
}) {
  const useVoiceAssistant = LK.useVoiceAssistant;
  if (!useVoiceAssistant) return null;

  return (
    <VoiceAssistantInner
      LK={LK}
      useVoiceAssistant={useVoiceAssistant}
      onTranscript={onTranscript}
      onAgentStateChange={onAgentStateChange}
      onAudioLevelChange={onAudioLevelChange}
    />
  );
}

function VoiceAssistantInner({
  LK,
  useVoiceAssistant,
  onTranscript,
  onAgentStateChange,
  onAudioLevelChange,
}: {
  LK: any;
  useVoiceAssistant: any;
  onTranscript: (msg: TranscriptMessage) => void;
  onAgentStateChange: (state: string) => void;
  onAudioLevelChange: (level: number) => void;
}) {
  const voiceAssistant = useVoiceAssistant();
  const agentState: string = voiceAssistant?.state ?? 'disconnected';
  const audioTrack = voiceAssistant?.audioTrack;
  const agentTranscriptions: any[] = voiceAssistant?.agentTranscriptions ?? [];
  const [hasRealVolume, setHasRealVolume] = useState(false);

  // Emit agent state changes
  const prevState = useRef(agentState);
  useEffect(() => {
    if (agentState !== prevState.current) {
      prevState.current = agentState;
      onAgentStateChange(agentState);
    }
  }, [agentState, onAgentStateChange]);

  // Fire on mount so VoiceOverlay gets the initial state
  useEffect(() => {
    onAgentStateChange(agentState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback audio levels when no real track volume — synthesize from state
  useEffect(() => {
    if (hasRealVolume) return;
    let frame: number;
    function tick() {
      let level: number;
      switch (agentState) {
        case 'speaking':
          level = 0.5 + (Math.random() - 0.5) * 0.2;
          break;
        case 'listening':
          level = 0.3 + (Math.random() - 0.5) * 0.1;
          break;
        default:
          level = 0.1;
      }
      onAudioLevelChange(level);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [agentState, hasRealVolume, onAudioLevelChange]);

  // Emit transcripts from agentTranscriptions
  const processedCount = useRef(0);
  useEffect(() => {
    if (agentTranscriptions.length > processedCount.current) {
      const newSegments = agentTranscriptions.slice(processedCount.current);
      for (const seg of newSegments) {
        if (seg?.text) {
          onTranscript({
            role: 'assistant',
            text: seg.text,
          });
        }
      }
      processedCount.current = agentTranscriptions.length;
    }
  }, [agentTranscriptions, onTranscript]);

  return (
    <>
      {LK.useTrackVolume && audioTrack && (
        <TrackVolumeMonitor
          useTrackVolume={LK.useTrackVolume}
          audioTrack={audioTrack}
          onAudioLevelChange={onAudioLevelChange}
          onActive={setHasRealVolume}
        />
      )}
    </>
  );
}

/**
 * Isolated component for useTrackVolume hook.
 * By mounting/unmounting this component instead of conditionally calling the hook,
 * we avoid violating React's rules of hooks.
 */
function TrackVolumeMonitor({
  useTrackVolume,
  audioTrack,
  onAudioLevelChange,
  onActive,
}: {
  useTrackVolume: any;
  audioTrack: any;
  onAudioLevelChange: (level: number) => void;
  onActive: (active: boolean) => void;
}) {
  const volume = useTrackVolume(audioTrack) as number;

  useEffect(() => {
    onActive(true);
    return () => onActive(false);
  }, [onActive]);

  useEffect(() => {
    if (volume !== undefined) {
      onAudioLevelChange(Math.min(1, volume));
    }
  }, [volume, onAudioLevelChange]);

  return null;
}
