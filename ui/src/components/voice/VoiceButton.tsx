import { Mic } from 'lucide-react';

interface VoiceButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function VoiceButton({ onClick, disabled = false }: VoiceButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Voice services not available' : 'Voice chat'}
      className={`
        relative rounded-full p-2.5 transition-all duration-200
        ${disabled
          ? 'bg-[#27272a]/50 text-[#71717a] cursor-not-allowed'
          : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#6366f1] hover:text-[#fafafa] cursor-pointer'
        }
      `}
    >
      <Mic className="h-5 w-5" />
      {!disabled && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            animation: 'voicePulse 2s ease-in-out infinite',
            border: '1px solid #6366f1',
            opacity: 0,
          }}
        />
      )}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { opacity: 0; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.15); }
        }
      `}</style>
    </button>
  );
}
