import type { QueuedMessage } from "./types";

export type StartChoice = { mode: "delay"; minutes: number } | { mode: "time"; time: string } | { mode: "after-last" };

export interface PlanInput {
  now: number;
  first: number;
  intervalMs: number;
  /** Null means as many as fit. */
  count: number | null;
  slotsFree: number;
}

export interface Plan {
  times: number[];
  /** The requested first send was too soon, so it was moved to the earliest allowed time. */
  firstMoved: boolean;
  cappedBySlots: boolean;
  cappedByHorizon: boolean;
}

const MINUTE = 60_000;

/** Discord's client-side limits, plus a margin so a batch can't drift out of them while it's sending. */
export const RULES = {
  minLeadMs: 10 * MINUTE,
  maxLeadMs: 8 * 24 * 60 * MINUTE,
  marginMs: MINUTE,
} as const;

/** Soonest wait to offer for the first send, in minutes. Anything sooner gets moved by `buildPlan` anyway. */
export const MIN_FIRST_SEND_MIN = (RULES.minLeadMs + RULES.marginMs) / MINUTE;

/** Slots on an account without Nitro. A higher limit from Discord means the account has Nitro. */
export const BASE_SLOTS = 1;

/**
 * Gap between sends: the bot's cooldown plus a buffer. Every gap includes the buffer, so it stacks:
 * 30 min + 60 sec gives 12:30, 1:01, 1:32.
 */
export function spacingMs(intervalMin: number, bufferSec: number) {
  return intervalMin * MINUTE + bufferSec * 1000;
}

function ceilToMinute(ms: number) {
  return Math.ceil(ms / MINUTE) * MINUTE;
}

function nextOccurrence(time: string, now: number) {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) return now;

  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime();
}

/** Latest pending send for this exact message in this channel, so a new run can carry on from it. */
export function lastQueuedAt(queue: QueuedMessage[], channelId: string, content: string) {
  const sends = queue
    .filter(q => !q.failed && q.channelId === channelId && q.content.trim() === content.trim())
    .map(q => q.sendAt);
  return sends.length > 0 ? Math.max(...sends) : null;
}

/**
 * Turns the "first send" choice into a timestamp.
 * @param lastQueued Result of `lastQueuedAt`, used by the `after-last` mode.
 */
export function resolveFirstSend(start: StartChoice, now: number, lastQueued: number | null, intervalMs: number) {
  if (start.mode === "time") return nextOccurrence(start.time, now);
  if (start.mode === "after-last") return lastQueued === null ? now : lastQueued + intervalMs;
  return ceilToMinute(now + start.minutes * MINUTE);
}

/** Lays out the send times, keeping them inside Discord's scheduling window and the free slots. */
export function buildPlan({ now, first, intervalMs, count, slotsFree }: PlanInput): Plan {
  const earliest = ceilToMinute(now + RULES.minLeadMs + RULES.marginMs);
  const latest = now + RULES.maxLeadMs - RULES.marginMs;
  const start = Math.max(first, earliest);
  const wanted = count ?? slotsFree;
  const allowed = Math.max(0, Math.min(wanted, slotsFree));

  const times: number[] = [];
  for (let i = 0; i < allowed; i++) {
    const at = start + i * intervalMs;
    if (at > latest) break;
    times.push(at);
  }

  return {
    times,
    firstMoved: first < earliest,
    cappedBySlots: wanted > slotsFree,
    cappedByHorizon: times.length < allowed,
  };
}
