import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlan } from "../lib/plan";

interface TestModule {
  marker: string;
  exports: Record<string, unknown>;
}

// Direct lookup and hook sources from Discord's scheduled-message utilities, November 2026.
const LIMIT_SOURCES = {
  direct: "function(){return C((0,A.ki)(u.default.getCurrentUser(),p.PremiumTypes.TIER_2))}",
  hook: "function(){return C((0,s.bG)([u.default],()=>(0,A.ki)(u.default.getCurrentUser(),p.PremiumTypes.TIER_2)))}",
} as const;

function installDiscord(premiumType: number, withLimit = true) {
  const user = { premiumType };
  const hook = vi.fn(() => { throw new Error("React hooks cannot run outside a component"); });
  const limitExports = Object.fromEntries(Object.entries(LIMIT_SOURCES).reverse().map(([key, source]) => [
    key,
    new Function("C", "A", "u", "p", "s", `return (${source});`)(
      (nitro: boolean) => nitro ? { limit: 25, isUpgradable: false } : { limit: 1, isUpgradable: true },
      { ki: (current: typeof user, tier: number) => current.premiumType === tier },
      { default: { getCurrentUser: () => user } },
      { PremiumTypes: { TIER_2: 2 } },
      { bG: hook },
    ) as unknown,
  ]));
  const queue = Object.fromEntries(["1", "2", "3", "4"].map(id => [id, {
    scheduledMessageId: id,
    sendAtTimestamp: new Date(Date.now() + 60 * 60_000).toISOString(),
    state: 0,
    createArgs: { channelId: "123", content: "test" },
  }]));
  const modules: TestModule[] = [
    {
      marker: "SCHEDULED_MESSAGES_CREATE_START",
      exports: {
        create: () => "SCHEDULED_MESSAGES_CREATE_START",
        remove: () => "SCHEDULED_MESSAGES_DELETE_START",
        fetchAll: () => "FETCH_SCHEDULED_MESSAGES",
      },
    },
    { marker: 'displayName="scheduledMessageStore"', exports: { store: {
      getScheduledMessagesForInbox: () => queue,
      getMessagesPendingRemoval: () => new Set<string>(),
    } } },
    { marker: 'displayName="ChannelStore"', exports: { store: { getChannel: () => ({ name: "test" }) } } },
    { marker: 'displayName="GuildStore"', exports: { store: { getGuild: () => undefined } } },
    { marker: 'displayName="UserStore"', exports: { store: { getUser: () => undefined } } },
    { marker: "SCHEDULED_MESSAGE_TIME_PICKER_OPENED", exports: withLimit ? limitExports : {} },
  ];
  const runtime = {
    m: Object.fromEntries(modules.map((m, i) => [i, new Function(`/* ${m.marker} */`) as unknown])),
    c: Object.fromEntries(modules.map((m, i) => [i, { exports: m.exports }])),
  };
  const chunks: unknown[] = [];
  vi.spyOn(chunks, "push").mockImplementation((...items) => {
    const chunk = items[0] as [unknown, unknown, (r: typeof runtime) => void];
    chunk[2](runtime);
    return Array.prototype.push.apply(chunks, items) as number;
  });
  vi.stubGlobal("window", { webpackChunkdiscord_app: chunks });
  vi.stubGlobal("document", { querySelector: () => ({}) });
  vi.stubGlobal("location", { pathname: "/channels/@me/123" });
  vi.stubGlobal("__VERSION__", "test");
  return { user, hook };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Discord scheduled-message limit", () => {
  it("detects 25 Nitro slots and leaves 21 available with four queued messages", async () => {
    const { hook } = installDiscord(2);
    await import("./index");
    const snapshot = window.__massSchedule!.snapshot();
    expect(snapshot).toMatchObject({ status: "ready", limit: 25 });
    if (snapshot.status !== "ready") throw new Error("Discord was not ready");
    const now = Date.now();
    const plan = buildPlan({ now, first: now + 60 * 60_000, intervalMs: 31 * 60_000, count: 25, slotsFree: snapshot.limit - snapshot.queue.length });
    expect(plan.times).toHaveLength(21);
    expect(hook).not.toHaveBeenCalled();
  });

  it.each([0, 1, 3])("uses Discord's non-Nitro limit for premium type %i", async premiumType => {
    installDiscord(premiumType);
    await import("./index");
    expect(window.__massSchedule!.snapshot()).toMatchObject({ status: "ready", limit: 1 });
  });

  it("reads subscription changes after the internals have been cached", async () => {
    const { user } = installDiscord(0);
    await import("./index");
    expect(window.__massSchedule!.snapshot()).toMatchObject({ limit: 1 });
    user.premiumType = 2;
    expect(window.__massSchedule!.snapshot()).toMatchObject({ limit: 25 });
    user.premiumType = 0;
    expect(window.__massSchedule!.snapshot()).toMatchObject({ limit: 1 });
  });

  it("reports a missing limit lookup instead of guessing ten slots", async () => {
    installDiscord(2, false);
    await import("./index");
    expect(window.__massSchedule!.snapshot()).toEqual({ status: "unsupported", missing: "getLimit" });
  });
});
