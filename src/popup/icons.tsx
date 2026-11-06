const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"} strokeWidth="2">
      <path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.4 9.8l6-.8z" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.4 20.6 21 12 3.4 3.4 3.4 10l11 2-11 2z" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  );
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" {...stroke} strokeWidth="2.5">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...stroke} strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} strokeWidth="2">
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} strokeWidth="2.5">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...stroke} strokeWidth="2.5">
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}
