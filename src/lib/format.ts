const MINUTE = 60_000;

/** Short duration like "31m", "4h 39m" or "2d 3h". */
export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`;
}

/** Exact gap between sends, keeping seconds: "31m", "30m 10s", "1h 5m". */
export function formatInterval(ms: number) {
  const total = Math.round(ms / 1000);
  const parts = [
    [Math.floor(total / 3600), "h"],
    [Math.floor(total / 60) % 60, "m"],
    [total % 60, "s"],
  ] as const;
  return parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ");
}

/** Clock time. Seconds only appear when they aren't zero, so a seconds buffer shows the real send time. */
export function formatClock(at: number) {
  const hasSeconds = new Date(at).getSeconds() !== 0;
  return new Date(at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    ...(hasSeconds && { second: "2-digit" }),
  });
}

/** Which day a time falls on, relative to now: "Today", "Tomorrow" or "Sat". */
export function formatDay(at: number, now: number) {
  const dayStart = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const days = Math.round((dayStart(at) - dayStart(now)) / (24 * 60 * MINUTE));

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Date(at).toLocaleDateString([], { weekday: "short" });
}

/** Clock time, with the day added when it isn't today: "3:42 PM", "Tomorrow 3:42 PM", "Sat 3:42 PM". */
export function formatSendTime(at: number, now: number) {
  const day = formatDay(at, now);
  return day === "Today" ? formatClock(at) : `${day} ${formatClock(at)}`;
}
