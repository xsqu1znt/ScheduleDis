import type { ReactNode } from "react";

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  /** How far the − and + buttons move. Typing can still set any value. */
  step?: number;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, min, max, suffix, step: stepBy = 1, onChange }: StepperProps) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  const stepClass = "h-8 w-7 shrink-0 rounded-md text-muted hover:bg-field-hover hover:text-ink disabled:opacity-30";

  return (
    <div className="flex h-9 items-center gap-0.5 rounded-lg bg-field px-0.5">
      <button type="button" aria-label={`Decrease ${label}`} className={stepClass} disabled={value <= min} onClick={() => step(-stepBy)}>
        −
      </button>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const next = e.target.valueAsNumber;
          if (!Number.isNaN(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
        className="w-full min-w-0 bg-transparent text-center font-medium tabular-nums outline-none"
      />
      {suffix && <span className="text-muted pr-0.5 text-xs">{suffix}</span>}
      <button type="button" aria-label={`Increase ${label}`} className={stepClass} disabled={value >= max} onClick={() => step(stepBy)}>
        +
      </button>
    </div>
  );
}

export function FieldLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="text-muted mb-1.5 flex items-baseline justify-between text-xs font-medium">
      <span>{children}</span>
      {aside}
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
