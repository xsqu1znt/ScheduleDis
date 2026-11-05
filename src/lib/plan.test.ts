import { describe, expect, it } from "vitest";
import { buildPlan, lastQueuedAt, resolveFirstSend, RULES, spacingMs } from "./plan";
import type { QueuedMessage } from "./types";

const MIN = 60_000;
const NOW = new Date(2026, 10, 5, 10, 7, 23).getTime();
const EARLIEST = new Date(2026, 10, 5, 10, 19, 0).getTime();

function queued(overrides: Partial<QueuedMessage>): QueuedMessage {
  return {
    id: "1",
    channelId: "c1",
    channelName: "general",
    guildName: "Server",
    content: ".tot",
    sendAt: NOW + 60 * MIN,
    failed: false,
    ...overrides,
  };
}

describe("resolveFirstSend", () => {
  it("rounds a delay up to the minute so the shown time is never early", () => {
    const first = resolveFirstSend({ mode: "delay", minutes: 31 }, NOW, null, 31 * MIN);
    expect(first).toBe(new Date(2026, 10, 5, 10, 39, 0).getTime());
  });

  it("uses today for a clock time still ahead", () => {
    const first = resolveFirstSend({ mode: "time", time: "11:00" }, NOW, null, 31 * MIN);
    expect(first).toBe(new Date(2026, 10, 5, 11, 0, 0).getTime());
  });

  it("rolls a clock time already past over to tomorrow", () => {
    const first = resolveFirstSend({ mode: "time", time: "09:00" }, NOW, null, 31 * MIN);
    expect(first).toBe(new Date(2026, 10, 6, 9, 0, 0).getTime());
  });

  it("continues one interval after the last queued send", () => {
    const last = NOW + 100 * MIN;
    expect(resolveFirstSend({ mode: "after-last" }, NOW, last, 31 * MIN)).toBe(last + 31 * MIN);
  });
});

describe("buildPlan", () => {
  const base = { now: NOW, first: NOW + 31 * MIN, intervalMs: 31 * MIN, count: null, slotsFree: 10 };

  it("spaces sends by the interval and fills free slots by default", () => {
    const plan = buildPlan(base);
    expect(plan.times).toHaveLength(10);
    expect(plan.times[1]! - plan.times[0]!).toBe(31 * MIN);
    expect(plan).toMatchObject({ firstMoved: false, cappedBySlots: false, cappedByHorizon: false });
  });

  it("moves a too-soon start to the earliest allowed minute", () => {
    const plan = buildPlan({ ...base, first: NOW + 2 * MIN, count: 1 });
    expect(plan.times).toEqual([EARLIEST]);
    expect(plan.firstMoved).toBe(true);
  });

  it("keeps a start exactly on the earliest allowed minute", () => {
    expect(buildPlan({ ...base, first: EARLIEST, count: 1 }).firstMoved).toBe(false);
  });

  it("flags a request for more than the free slots", () => {
    const plan = buildPlan({ ...base, count: 8, slotsFree: 3 });
    expect(plan.times).toHaveLength(3);
    expect(plan.cappedBySlots).toBe(true);
  });

  it("returns nothing when no slots are free", () => {
    expect(buildPlan({ ...base, slotsFree: 0 }).times).toEqual([]);
  });

  it("stops at Discord's 8 day horizon", () => {
    const plan = buildPlan({ ...base, intervalMs: 3 * 24 * 60 * MIN, slotsFree: 10 });
    expect(plan.times).toHaveLength(3);
    expect(plan.cappedByHorizon).toBe(true);
    expect(plan.times.at(-1)!).toBeLessThanOrEqual(NOW + RULES.maxLeadMs);
  });
});

describe("spacingMs", () => {
  const first = new Date(2026, 10, 5, 12, 30, 0).getTime();
  const at = (minute: number, second = 0) => new Date(2026, 10, 5, 12, minute, second).getTime();
  const timesWith = (bufferSec: number) =>
    buildPlan({ now: NOW, first, intervalMs: spacingMs(30, bufferSec), count: 3, slotsFree: 25 }).times;

  it("stacks a minute of buffer onto every send", () => {
    expect(timesWith(60)).toEqual([first, at(61), at(92)]);
  });

  it("stacks a buffer of a few seconds too", () => {
    expect(timesWith(10)).toEqual([first, at(60, 10), at(90, 20)]);
  });
});

describe("lastQueuedAt", () => {
  it("only considers pending sends of the same message in the same channel", () => {
    const latest = NOW + 90 * MIN;
    const queue = [
      queued({ sendAt: NOW + 30 * MIN }),
      queued({ sendAt: latest }),
      queued({ sendAt: NOW + 200 * MIN, channelId: "other" }),
      queued({ sendAt: NOW + 300 * MIN, content: ".daily" }),
      queued({ sendAt: NOW + 400 * MIN, failed: true }),
    ];
    expect(lastQueuedAt(queue, "c1", ".tot")).toBe(latest);
  });

  it("returns null when nothing matches", () => {
    expect(lastQueuedAt([], "c1", ".tot")).toBeNull();
  });
});
