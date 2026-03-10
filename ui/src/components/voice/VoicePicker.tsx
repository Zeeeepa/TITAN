import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  /** CSS gradient for the orb */
  gradient: string;
  /** Glow color */
  glow: string;
  /** Gender hint for display */
  gender: 'female' | 'male';
}

const VOICES: VoiceOption[] = [
  {
    id: 'af_heart',
    name: 'Heart',
    description: 'Warm and expressive',
    gradient: 'radial-gradient(circle at 35% 35%, #f472b6, #ec4899, #be185d)',
    glow: '#ec4899',
    gender: 'female',
  },
  {
    id: 'af_bella',
    name: 'Bella',
    description: 'Elegant and clear',
    gradient: 'radial-gradient(circle at 35% 35%, #c084fc, #a855f7, #7c3aed)',
    glow: '#a855f7',
    gender: 'female',
  },
  {
    id: 'af_nova',
    name: 'Nova',
    description: 'Bright and energetic',
    gradient: 'radial-gradient(circle at 35% 35%, #67e8f9, #22d3ee, #0891b2)',
    glow: '#22d3ee',
    gender: 'female',
  },
  {
    id: 'af_sky',
    name: 'Sky',
    description: 'Calm and soothing',
    gradient: 'radial-gradient(circle at 35% 35%, #93c5fd, #3b82f6, #1d4ed8)',
    glow: '#3b82f6',
    gender: 'female',
  },
  {
    id: 'am_adam',
    name: 'Adam',
    description: 'Confident and deep',
    gradient: 'radial-gradient(circle at 35% 35%, #86efac, #22c55e, #15803d)',
    glow: '#22c55e',
    gender: 'male',
  },
  {
    id: 'am_michael',
    name: 'Michael',
    description: 'Steady and articulate',
    gradient: 'radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b, #b45309)',
    glow: '#f59e0b',
    gender: 'male',
  },
  {
    id: 'am_puck',
    name: 'Puck',
    description: 'Quick and playful',
    gradient: 'radial-gradient(circle at 35% 35%, #fb923c, #f97316, #c2410c)',
    glow: '#f97316',
    gender: 'male',
  },
  {
    id: 'bf_emma',
    name: 'Emma',
    description: 'Refined and composed',
    gradient: 'radial-gradient(circle at 35% 35%, #e9d5ff, #d8b4fe, #a78bfa)',
    glow: '#d8b4fe',
    gender: 'female',
  },
  {
    id: 'am_fenrir',
    name: 'Fenrir',
    description: 'Bold and commanding',
    gradient: 'radial-gradient(circle at 35% 35%, #fca5a5, #ef4444, #991b1b)',
    glow: '#ef4444',
    gender: 'male',
  },
  {
    id: 'af_river',
    name: 'River',
    description: 'Natural and flowing',
    gradient: 'radial-gradient(circle at 35% 35%, #6ee7b7, #34d399, #059669)',
    glow: '#34d399',
    gender: 'female',
  },
  {
    id: 'af_sarah',
    name: 'Sarah',
    description: 'Professional and reassuring',
    gradient: 'radial-gradient(circle at 35% 35%, #fda4af, #fb7185, #e11d48)',
    glow: '#fb7185',
    gender: 'female',
  },
  {
    id: 'am_liam',
    name: 'Liam',
    description: 'Smooth and trustworthy',
    gradient: 'radial-gradient(circle at 35% 35%, #a5b4fc, #818cf8, #4f46e5)',
    glow: '#818cf8',
    gender: 'male',
  },
  {
    id: 'bf_lily',
    name: 'Lily',
    description: 'Polished and poised',
    gradient: 'radial-gradient(circle at 35% 35%, #f9a8d4, #f472b6, #db2777)',
    glow: '#f472b6',
    gender: 'female',
  },
  {
    id: 'bm_george',
    name: 'George',
    description: 'Distinguished and warm',
    gradient: 'radial-gradient(circle at 35% 35%, #d4d4d8, #a1a1aa, #71717a)',
    glow: '#a1a1aa',
    gender: 'male',
  },
  {
    id: 'af_jessica',
    name: 'Jessica',
    description: 'Friendly and upbeat',
    gradient: 'radial-gradient(circle at 35% 35%, #fde68a, #fbbf24, #d97706)',
    glow: '#fbbf24',
    gender: 'female',
  },
  {
    id: 'am_eric',
    name: 'Eric',
    description: 'Clear and direct',
    gradient: 'radial-gradient(circle at 35% 35%, #99f6e4, #2dd4bf, #0d9488)',
    glow: '#2dd4bf',
    gender: 'male',
  },
];

interface VoicePickerProps {
  currentVoice?: string;
  onSelect: (voiceId: string) => void;
  onPreview?: (voiceId: string) => void;
}

export function VoicePicker({ currentVoice, onSelect, onPreview }: VoicePickerProps) {
  const initialIdx = currentVoice ? Math.max(0, VOICES.findIndex(v => v.id === currentVoice)) : 0;
  const [activeIdx, setActiveIdx] = useState(initialIdx);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const voice = VOICES[activeIdx];

  const goTo = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(VOICES.length - 1, idx)));
  }, []);

  const prev = useCallback(() => goTo(activeIdx - 1), [activeIdx, goTo]);
  const next = useCallback(() => goTo(activeIdx + 1), [activeIdx, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Enter') onSelect(VOICES[activeIdx].id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIdx, prev, next, onSelect]);

  // Touch/mouse drag
  const onPointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startX.current = e.clientX;
    setDragOffset(0);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragOffset(e.clientX - startX.current);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragOffset > 60) prev();
    else if (dragOffset < -60) next();
    setDragOffset(0);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">
      {/* Title */}
      <h2 className="text-xl font-semibold text-[#fafafa] mb-2">Choose a voice</h2>
      <p className="text-sm text-[#71717a] mb-10">Swipe or use arrow keys</p>

      {/* Orb carousel */}
      <div
        ref={containerRef}
        className="relative flex items-center justify-center w-full"
        style={{ height: 280, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Left arrow */}
        {activeIdx > 0 && (
          <button
            onClick={prev}
            className="absolute left-4 z-10 rounded-full p-2 text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Orbs */}
        <div className="relative" style={{ width: 220, height: 220 }}>
          {VOICES.map((v, i) => {
            const offset = i - activeIdx;
            const isActive = i === activeIdx;
            const drag = isDragging ? dragOffset * 0.3 : 0;
            return (
              <div
                key={v.id}
                className="absolute inset-0 transition-all"
                style={{
                  transitionDuration: isDragging ? '0ms' : '400ms',
                  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: `translateX(${offset * 260 + drag}px) scale(${isActive ? 1 : 0.7})`,
                  opacity: Math.abs(offset) > 1 ? 0 : isActive ? 1 : 0.4,
                  zIndex: isActive ? 10 : 1,
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
              >
                {/* Glow */}
                <div
                  className="absolute inset-0 rounded-full blur-2xl transition-opacity duration-500"
                  style={{
                    background: v.glow,
                    opacity: isActive ? 0.3 : 0,
                    transform: 'scale(1.2)',
                  }}
                />
                {/* Orb */}
                <div
                  className="w-full h-full rounded-full shadow-2xl"
                  style={{
                    background: v.gradient,
                    boxShadow: isActive ? `0 0 60px ${v.glow}40` : 'none',
                  }}
                />
                {/* Inner highlight */}
                <div
                  className="absolute rounded-full"
                  style={{
                    top: '12%',
                    left: '18%',
                    width: '35%',
                    height: '35%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Right arrow */}
        {activeIdx < VOICES.length - 1 && (
          <button
            onClick={next}
            className="absolute right-4 z-10 rounded-full p-2 text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Voice name + description */}
      <div className="mt-8 text-center">
        <h3 className="text-2xl font-bold text-[#fafafa] mb-1">{voice.name}</h3>
        <p className="text-sm text-[#a1a1aa]">{voice.description}</p>
      </div>

      {/* Preview button */}
      {onPreview && (
        <button
          onClick={() => onPreview(voice.id)}
          className="mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
        >
          <Volume2 size={14} />
          Preview
        </button>
      )}

      {/* Dots */}
      <div className="flex items-center gap-2 mt-6">
        {VOICES.map((v, i) => (
          <button
            key={v.id}
            onClick={() => goTo(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === activeIdx ? 10 : 6,
              height: i === activeIdx ? 10 : 6,
              backgroundColor: i === activeIdx ? voice.glow : '#3f3f46',
              boxShadow: i === activeIdx ? `0 0 8px ${voice.glow}80` : 'none',
            }}
          />
        ))}
      </div>

      {/* Done button */}
      <button
        onClick={() => onSelect(voice.id)}
        className="mt-10 w-72 rounded-full py-3.5 text-base font-semibold transition-all duration-200"
        style={{
          background: `linear-gradient(135deg, ${voice.glow}30, ${voice.glow}15)`,
          border: `1px solid ${voice.glow}40`,
          color: '#fafafa',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `linear-gradient(135deg, ${voice.glow}50, ${voice.glow}25)`;
          e.currentTarget.style.boxShadow = `0 0 20px ${voice.glow}30`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = `linear-gradient(135deg, ${voice.glow}30, ${voice.glow}15)`;
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Start with {voice.name}
      </button>
    </div>
  );
}

export { VOICES };
