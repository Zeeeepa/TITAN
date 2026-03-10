import { useMemo } from 'react';

interface AudioVisualizerProps {
  type?: 'bar' | 'wave' | 'radial';
  color?: string;
  active?: boolean;
}

export function AudioVisualizer({
  type = 'bar',
  color = '#6366f1',
  active = false,
}: AudioVisualizerProps) {
  if (type === 'bar') return <BarVisualizer color={color} active={active} />;
  if (type === 'wave') return <WaveVisualizer color={color} active={active} />;
  return <RadialVisualizer color={color} active={active} />;
}

function BarVisualizer({ color, active }: { color: string; active: boolean }) {
  const bars = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => ({
      delay: `${i * 0.12}s`,
      duration: `${0.8 + Math.random() * 0.6}s`,
    }));
  }, []);

  return (
    <div className="flex items-center justify-center gap-1.5" style={{ width: 200, height: 200 }}>
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{
            width: 8,
            borderRadius: 4,
            backgroundColor: color,
            height: active ? undefined : 8,
            animation: active
              ? `barBounce ${bar.duration} ease-in-out ${bar.delay} infinite`
              : 'none',
            transition: 'height 0.3s ease',
            ...(active ? { height: 8 } : {}),
          }}
        />
      ))}
      <style>{`
        @keyframes barBounce {
          0%, 100% { height: 8px; }
          25% { height: ${60 + Math.random() * 40}px; }
          50% { height: ${30 + Math.random() * 30}px; }
          75% { height: ${80 + Math.random() * 40}px; }
        }
      `}</style>
    </div>
  );
}

function WaveVisualizer({ color, active }: { color: string; active: boolean }) {
  return (
    <div className="flex items-center justify-center" style={{ width: 200, height: 200 }}>
      <svg width="180" height="80" viewBox="0 0 180 80">
        <path
          d={
            active
              ? 'M0,40 Q22.5,10 45,40 T90,40 T135,40 T180,40'
              : 'M0,40 L180,40'
          }
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            animation: active ? 'waveMove 1.5s ease-in-out infinite' : 'none',
            transition: 'd 0.3s ease',
          }}
        />
      </svg>
      <style>{`
        @keyframes waveMove {
          0% { d: path('M0,40 Q22.5,10 45,40 T90,40 T135,40 T180,40'); }
          50% { d: path('M0,40 Q22.5,70 45,40 T90,40 T135,40 T180,40'); }
          100% { d: path('M0,40 Q22.5,10 45,40 T90,40 T135,40 T180,40'); }
        }
      `}</style>
    </div>
  );
}

function RadialVisualizer({ color, active }: { color: string; active: boolean }) {
  return (
    <div className="flex items-center justify-center" style={{ width: 200, height: 200 }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          animation: active ? 'radialPulse 1.2s ease-in-out infinite' : 'none',
          opacity: active ? 1 : 0.4,
          transition: 'opacity 0.3s ease',
        }}
      />
      {active && (
        <div
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            animation: 'radialPulse 1.2s ease-in-out 0.3s infinite',
            opacity: 0.5,
          }}
        />
      )}
      <style>{`
        @keyframes radialPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
