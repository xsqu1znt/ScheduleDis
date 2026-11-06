import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Thumb diameter in px. */
  thumb?: number;
  /** Past this value the fill turns Nitro-coloured, with a tick marking where. */
  nitroFrom?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const OPTIONS = { holdMs: 1400 } as const;

/** A number input with − and + buttons. Typing only applies on blur or Enter, so a minimum can't fight the keystrokes. */
export function Stepper({ label, value, min, max, suffix, onChange }: StepperProps) {
  const [typed, setTyped] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const stepClass = "h-8 w-[30px] shrink-0 rounded-md text-muted hover:bg-field-hover hover:text-ink disabled:opacity-30";

  const commit = () => {
    if (typed === null) return;
    const next = Number(typed);
    if (typed.trim() !== "" && !Number.isNaN(next)) onChange(clamp(Math.round(next)));
    setTyped(null);
  };

  return (
    <div className="bg-field flex h-9 min-w-0 flex-1 items-center rounded-lg px-0.5">
      <button type="button" aria-label={`Decrease ${label}`} className={stepClass} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={typed ?? value}
        onChange={e => setTyped(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === "Enter" && commit()}
        className="w-full min-w-0 bg-transparent text-center font-medium tabular-nums outline-none"
      />
      {suffix && <span className="text-muted pr-0.5 text-xs">{suffix}</span>}
      <button type="button" aria-label={`Increase ${label}`} className={stepClass} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

/** Styled range input. The fill ends under the thumb's centre rather than at the raw percentage. */
export function Slider({ label, value, min, max, step = 1, thumb = 16, nitroFrom, disabled, onChange }: SliderProps) {
  const toFraction = (v: number) => (v - min) / (max - min);
  const toPosition = (fraction: number) => `calc(${thumb / 2}px + (100% - ${thumb}px) * ${fraction})`;

  const fraction = toFraction(value);
  const hasZone = nitroFrom !== undefined && max > nitroFrom;
  const zoneStart = hasZone ? toFraction(nitroFrom) : 1;
  const baseWidth = value === 0 ? "0" : toPosition(Math.min(fraction, zoneStart));

  return (
    <div className="slider" style={{ "--thumb": `${thumb}px` } as CSSProperties}>
      <div className="slider-track bg-field inset-x-0" />
      <div className="slider-track bg-accent left-0" style={{ width: baseWidth }} />
      {hasZone && fraction > zoneStart && (
        <div className="slider-track slider-nitro" style={{ left: toPosition(zoneStart), right: `calc(100% - ${toPosition(fraction)})` }} />
      )}
      {hasZone && <div className="slider-tick bg-faint" style={{ left: toPosition(zoneStart) }} />}
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Animates its children open and closed by height, sliding down from the edge above.
 * @param extension Styles it as a strip growing out from under the control above it.
 */
export function Reveal({ open, extension, children }: { open: boolean; extension?: boolean; children: ReactNode }) {
  return (
    <div className={`reveal ${extension ? "reveal-extension" : ""} ${open ? "open" : ""}`} inert={!open}>
      <div className="reveal-clip">
        <div className="reveal-content">{children}</div>
      </div>
    </div>
  );
}

/** A destructive button that needs holding to confirm. A fill sweeps across while held and drains back if let go early. */
export function HoldButton({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const release = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };

  const press = () => {
    if (disabled || holding) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, OPTIONS.holdMs);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      aria-label={`Hold to ${label}`}
      disabled={disabled}
      className={`hold-button ${holding ? "holding" : ""}`}
      style={{ "--hold-ms": `${OPTIONS.holdMs}ms` } as CSSProperties}
      onPointerDown={e => e.button === 0 && press()}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={e => {
        if ((e.key !== " " && e.key !== "Enter") || e.repeat) return;
        e.preventDefault();
        press();
      }}
      onKeyUp={release}
      onBlur={release}
    >
      <span className="hold-sweep" />
      <span className="hold-text hold-main">Hold to {label}</span>
      <span className="hold-text hold-alt">Keep holding…</span>
    </button>
  );
}

export function FieldLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="text-muted mb-1.5 flex min-h-[17px] items-baseline justify-between gap-2 text-xs font-medium">
      <span>{children}</span>
      {aside && <span className="font-normal tabular-nums">{aside}</span>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "good" | "warn" | "bad"; children: ReactNode }) {
  const color = { good: "border-good", warn: "border-warn", bad: "border-bad" }[tone];
  return <p className={`bg-panel text-ink rounded-r-md border-l-2 ${color} px-2.5 py-1.5 text-xs leading-relaxed`}>{children}</p>;
}

export function TargetName({ channelName, guildName }: { channelName: string; guildName: string | null }) {
  return (
    <span className="truncate">
      {guildName ? "#" : "@"}
      {channelName}
    </span>
  );
}
