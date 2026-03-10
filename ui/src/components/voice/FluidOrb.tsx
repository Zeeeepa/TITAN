import { useRef, useEffect, useCallback } from 'react';

interface FluidOrbProps {
  /** 0–1, drives animation intensity */
  audioLevel: number;
  /** Who is currently active */
  speaker: 'idle' | 'user' | 'assistant';
  /** Size in px */
  size?: number;
}

// Color palettes per speaker state
const COLORS = {
  idle: {
    primary: [100, 100, 140],    // muted indigo
    secondary: [80, 80, 120],
    glow: 'rgba(100, 100, 200, 0.15)',
  },
  user: {
    primary: [34, 211, 238],     // cyan
    secondary: [6, 182, 212],
    glow: 'rgba(34, 211, 238, 0.25)',
  },
  assistant: {
    primary: [139, 92, 246],     // violet/purple
    secondary: [124, 58, 237],
    glow: 'rgba(139, 92, 246, 0.3)',
  },
};

export function FluidOrb({ audioLevel, speaker, size = 240 }: FluidOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const smoothLevel = useRef(0);
  const targetColor = useRef(COLORS.idle.primary);
  const currentColor = useRef([...COLORS.idle.primary]);

  // Load logo image
  useEffect(() => {
    const img = new Image();
    img.src = '/titan-logo.png';
    img.onload = () => { logoRef.current = img; };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size * dpr;
    const h = size * dpr;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    timeRef.current += 0.016;
    const t = timeRef.current;

    // Smooth audio level
    smoothLevel.current += (audioLevel - smoothLevel.current) * 0.12;
    const level = smoothLevel.current;

    // Smooth color transitions
    const palette = COLORS[speaker];
    targetColor.current = palette.primary;
    for (let i = 0; i < 3; i++) {
      currentColor.current[i] += (targetColor.current[i] - currentColor.current[i]) * 0.04;
    }
    const [cr, cg, cb] = currentColor.current.map(Math.round);

    const cx = w / 2;
    const cy = h / 2;
    const baseR = w * 0.35;

    // === Outer glow layers ===
    for (let layer = 3; layer >= 0; layer--) {
      const layerScale = 1 + layer * 0.12 + level * layer * 0.08;
      const alpha = (0.06 - layer * 0.012) + level * 0.03;

      ctx.save();
      ctx.translate(cx, cy);

      // Create fluid blob path
      ctx.beginPath();
      const points = 120;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;

        // Multiple noise frequencies for organic movement
        const n1 = Math.sin(angle * 3 + t * 1.2 + layer) * 0.08;
        const n2 = Math.sin(angle * 5 - t * 0.8 + layer * 2) * 0.05;
        const n3 = Math.sin(angle * 7 + t * 2.1) * 0.03 * level;
        const audioWobble = Math.sin(angle * 2 + t * 3) * level * 0.12;

        const r = baseR * layerScale * (1 + n1 + n2 + n3 + audioWobble);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseR * layerScale * 1.2);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 2})`);
      grad.addColorStop(0.6, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
      grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    // === Main orb body ===
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    const mainPoints = 150;
    for (let i = 0; i <= mainPoints; i++) {
      const angle = (i / mainPoints) * Math.PI * 2;
      const n1 = Math.sin(angle * 3 + t * 1.5) * 0.04;
      const n2 = Math.sin(angle * 5 - t * 1.0) * 0.025;
      const audioWobble = Math.sin(angle * 4 + t * 3.5) * level * 0.06;
      const breathe = Math.sin(t * 0.8) * 0.02;

      const r = baseR * (1 + n1 + n2 + audioWobble + breathe);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Gradient fill
    const mainGrad = ctx.createRadialGradient(
      -baseR * 0.2, -baseR * 0.2, baseR * 0.1,
      0, 0, baseR * 1.1,
    );
    mainGrad.addColorStop(0, `rgba(${Math.min(255, cr + 80)}, ${Math.min(255, cg + 80)}, ${Math.min(255, cb + 80)}, 0.95)`);
    mainGrad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.85)`);
    mainGrad.addColorStop(1, `rgba(${Math.max(0, cr - 40)}, ${Math.max(0, cg - 40)}, ${Math.max(0, cb - 40)}, 0.8)`);
    ctx.fillStyle = mainGrad;
    ctx.fill();

    // Inner highlight (specular)
    const highlightGrad = ctx.createRadialGradient(
      -baseR * 0.25, -baseR * 0.3, 0,
      -baseR * 0.1, -baseR * 0.15, baseR * 0.5,
    );
    highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlightGrad;
    ctx.fill();
    ctx.restore();

    // === TITAN logo in center ===
    if (logoRef.current) {
      const logoSize = baseR * 0.8;
      const logoX = cx - logoSize / 2;
      const logoY = cy - logoSize / 2;

      // Subtle float
      const floatY = Math.sin(t * 1.2) * 3 * dpr;
      const floatX = Math.cos(t * 0.9) * 2 * dpr;

      ctx.save();
      ctx.globalAlpha = 0.9 + level * 0.1;

      // Logo glow
      ctx.shadowColor = `rgba(${cr}, ${cg}, ${cb}, ${0.4 + level * 0.3})`;
      ctx.shadowBlur = 20 + level * 30;

      // Clip to circle for clean edges
      ctx.beginPath();
      ctx.arc(cx + floatX, cy + floatY, logoSize / 2 + 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        logoRef.current,
        logoX + floatX,
        logoY + floatY,
        logoSize,
        logoSize,
      );
      ctx.restore();
    }

    // === Floating particles ===
    if (level > 0.1) {
      const particleCount = Math.floor(level * 12);
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + t * 0.3;
        const dist = baseR * (1.2 + Math.sin(t * 2 + i * 1.7) * 0.3 + level * 0.2);
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        const pSize = (1.5 + Math.sin(t * 3 + i) * 1) * dpr;
        const pAlpha = 0.3 + Math.sin(t * 2 + i * 0.5) * 0.2;

        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${pAlpha})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [audioLevel, speaker, size]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 0 ${20 + audioLevel * 40}px ${COLORS[speaker].glow})`,
        transition: 'filter 0.3s ease',
      }}
    />
  );
}
