/**
 * Discord's limit on creating scheduled messages, measured from live responses since it sends no
 * rate limit headers here: a burst of 10, then one more roughly every 3 minutes (a 429 came with
 * retry-after 177 two seconds after a successful create). The refill is slightly padded.
 *
 * Staying under it matters beyond avoiding errors. After a 429, Discord's HTTP client holds every
 * request to that URL, including the one that loads its own scheduled messages list.
 */
export const SEND_LIMIT = { burst: 10, refillMs: 182_000 } as const;

const FULL_BURST_MS = (SEND_LIMIT.burst - 1) * SEND_LIMIT.refillMs;

/**
 * Tracks the limit as a single timestamp: when the allowance will be fully refilled.
 * @returns The new timestamp, after a message was created at `createdAt`.
 */
export function recordSend(fullAt: number, createdAt: number) {
  return Math.max(fullAt, createdAt) + SEND_LIMIT.refillMs;
}

/** Discord said to wait, so the allowance is empty whatever we'd estimated. */
export function recordRejection(fullAt: number, now: number, retryAfterMs: number) {
  return Math.max(fullAt, now + retryAfterMs + FULL_BURST_MS);
}

/** Earliest time the next create should go out. */
export function nextSendAt(fullAt: number, now: number) {
  return Math.max(now, fullAt - FULL_BURST_MS);
}

/** How many creates can go out right now without waiting. */
export function sendsAvailable(fullAt: number, now: number) {
  const used = Math.ceil(Math.max(0, fullAt - now) / SEND_LIMIT.refillMs);
  return Math.max(0, SEND_LIMIT.burst - used);
}
