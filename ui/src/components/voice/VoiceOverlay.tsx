import { useState, useEffect, useCallback } from 'react';
import { X, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useLiveKit } from '@/hooks/useLiveKit';
import { AudioVisualizer } from './AudioVisualizer';
import { TranscriptView } from './TranscriptView';

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

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

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

  // Connect on mount once LiveKit is confirmed available
  useEffect(() => {
    if (liveKitAvailable) {
      connect();
    }
  }, [liveKitAvailable, connect]);

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
        className="absolute right-6 top-6 rounded-full p-2 transition-colors hover:bg-[#27272a]"
        style={{ color: '#a1a1aa' }}
      >
        <X className="h-6 w-6" />
      </button>

      {/* Status text */}
      <div className="mb-4 text-sm" style={{ color: '#71717a' }}>
        {state === 'connecting' && 'Connecting...'}
        {state === 'connected' && 'Connected'}
        {state === 'error' && (error || 'Connection failed')}
        {state === 'disconnected' && 'Disconnected'}
      </div>

      {/* LiveKit not installed message */}
      {liveKitAvailable === false && (
        <div className="mb-8 rounded-lg px-6 py-4 text-center" style={{ backgroundColor: '#27272a' }}>
          <p className="mb-2 text-sm font-medium" style={{ color: '#fafafa' }}>
            Voice packages not installed
          </p>
          <code
            className="rounded px-2 py-1 text-xs"
            style={{ backgroundColor: '#18181b', color: '#a855f7' }}
          >
            npm install @livekit/components-react livekit-client
          </code>
        </div>
      )}

      {/* Visualizer */}
      <AudioVisualizer
        type="bar"
        active={state === 'connected' && !isMuted}
        color="#6366f1"
      />

      {/* LiveKit Room — only render when packages are available and connected */}
      {liveKitAvailable && LKComponents && tokenData && state === 'connected' && (
        <LiveKitSession
          LK={LKComponents}
          serverUrl={tokenData.serverUrl}
          token={tokenData.participantToken}
          isMuted={isMuted}
          onTranscript={(msg) => setMessages((prev) => [...prev, msg])}
        />
      )}

      {/* Transcript */}
      <div className="mt-8 w-full max-w-lg px-4">
        <TranscriptView
          messages={messages}
          isListening={state === 'connected' && !isMuted}
        />
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-12 flex items-center gap-6">
        <button
          onClick={toggleMute}
          disabled={state !== 'connected'}
          className="rounded-full p-4 transition-colors"
          style={{
            backgroundColor: isMuted ? '#ef4444' : '#27272a',
            color: '#fafafa',
            opacity: state !== 'connected' ? 0.5 : 1,
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
