import { useEffect, useRef, type RefObject } from "react";

interface NitroFxProps {
  /** 0 to 1 for how far past the base slots the run goes, or -1 for off. */
  level: number;
  /** The chat bar. Sparkles start from its top edge, and the glow rises from behind it. */
  barRef: RefObject<HTMLElement | null>;
  /** Changing this sends up a burst of sparkles. */
  burstKey: number;
}

interface Spark {
  x: number;
  y: number;
  age: number;
  life: number;
  speed: number;
  size: number;
  star: boolean;
  sway: number;
  spin: number;
  color: string;
}

const OPTIONS = {
  baseRisePx: 110,
  extraRisePx: 210,
  baseRate: 7,
  extraRate: 26,
  burstCount: 70,
  colors: ["#ffffff", "#f3d9ff", "#c9a2ff", "#ffb3d9"],
} as const;

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** The gradient and sparkles behind the form when a run goes past the base slots. Fills the nearest positioned ancestor. */
export function NitroFx({ level, barRef, burstKey }: NitroFxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const live = useRef({ level, sparks: [] as Spark[], barTop: 0, width: 0 });
  const reduced = useRef(matchMedia("(prefers-reduced-motion: reduce)").matches);

  const spawn = (boost = 0) => {
    const { barTop, width, level: current } = live.current;
    const star = Math.random() < 0.3;
    live.current.sparks.push({
      x: Math.random() * width,
      y: barTop + 8 + Math.random() * 6,
      age: 0,
      life: 1.2 + Math.random() * 1.8,
      speed: 34 + Math.random() * 42 + boost * 90 + Math.max(0, current) * 18,
      size: star ? 3.5 + Math.random() * 3 : 1 + Math.random() * 1.6,
      star,
      sway: Math.random() * 6.28,
      spin: Math.random() * 6.28,
      color: OPTIONS.colors[Math.floor(Math.random() * OPTIONS.colors.length)]!,
    });
  };

  const layout = () => {
    const canvas = canvasRef.current;
    const parent = glowRef.current?.offsetParent;
    const bar = barRef.current;
    if (!canvas || !parent || !bar) return;

    const box = parent.getBoundingClientRect();
    const ratio = devicePixelRatio || 1;
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    const barTop = bar.getBoundingClientRect().top - box.top;
    live.current.barTop = barTop;
    live.current.width = box.width;

    const { level: current } = live.current;
    if (glowRef.current) {
      const rise = OPTIONS.baseRisePx + OPTIONS.extraRisePx * current;
      glowRef.current.style.height = current < 0 ? "0" : `${box.height - barTop + rise}px`;
    }
  };

  useEffect(() => {
    live.current.level = level;
    layout();
  }, [level]);

  useEffect(() => {
    if (burstKey === 0 || live.current.level < 0 || reduced.current) return;
    for (let i = 0; i < OPTIONS.burstCount; i++) spawn(Math.random());
  }, [burstKey]);

  useEffect(() => {
    const parent = glowRef.current?.offsetParent;
    const ctx = canvasRef.current?.getContext("2d");
    if (!parent || !ctx) return;

    const observer = new ResizeObserver(layout);
    observer.observe(parent);
    layout();
    if (reduced.current) return () => observer.disconnect();

    let frame = 0;
    let last = 0;
    let carry = 0;

    const draw = (ms: number) => {
      const dt = Math.min(0.05, (ms - last) / 1000 || 0);
      last = ms;
      const state = live.current;
      ctx.clearRect(0, 0, parent.clientWidth, parent.clientHeight);

      if (state.level >= 0) {
        carry += dt * (OPTIONS.baseRate + OPTIONS.extraRate * state.level);
        for (; carry >= 1; carry--) spawn();
      }

      state.sparks = state.sparks.filter(s => (s.age += dt) < s.life);
      for (const s of state.sparks) {
        s.y -= s.speed * dt;
        s.x += Math.sin(s.sway + s.age * 2.4) * 12 * dt;
        const progress = s.age / s.life;
        const twinkle = s.star ? 0.55 + 0.45 * Math.sin(s.spin + s.age * 9) : 1;
        ctx.globalAlpha = Math.max(0, Math.min(1, progress * 6) * (1 - progress) * twinkle);
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = s.star ? 8 : 4;
        if (s.star) {
          drawStar(ctx, s.x, s.y, s.size);
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size / 2, 0, 6.3);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={glowRef} className="nitro-glow" style={{ opacity: level < 0 ? 0 : 1 }} aria-hidden />
      <canvas ref={canvasRef} className="nitro-sparks" aria-hidden />
    </>
  );
}
