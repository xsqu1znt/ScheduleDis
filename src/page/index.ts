import { nextSendAt, recordRejection, recordSend, SEND_LIMIT, sendsAvailable } from "../lib/rateLimit";
import type { JobRequest, JobStatus, PageApi, QueuedMessage, Snapshot, Target } from "../lib/types";

// Runs inside Discord's page. It calls Discord's own scheduling functions rather than the HTTP API
// directly, so auth stays with Discord (this script never sees the token) and Discord's scheduled
// messages list updates live. Module ids change every build, so everything is found by the strings
// in its source. If one of those disappears the popup says so instead of guessing.

declare const __VERSION__: string;

type Factory = (...args: unknown[]) => unknown;
type WebpackRequire = { m: Record<string, Factory>; c: Record<string, { exports: unknown } | undefined> };
type Callable = (...args: unknown[]) => unknown;

interface ChunkGlobal {
  webpackChunkdiscord_app?: unknown[] & { push(chunk: unknown): void; pop(): unknown };
}

interface DiscordError {
  status?: number;
  message?: string;
  body?: { code?: number; message?: string; retry_after?: number };
}

interface RawScheduled {
  scheduledMessageId: string;
  sendAtTimestamp: string;
  state: number;
  createArgs: { channelId: string; content: string };
}

interface RawChannel {
  name?: string;
  guild_id?: string | null;
  recipients?: string[];
}

interface Internals {
  create: (args: { channelId: string; scheduledTimestamp: string; messageSendData: unknown }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  fetchAll: () => Promise<void>;
  getLimit: ((location: string) => { limit: number }) | null;
  scheduled: { getScheduledMessagesForInbox(): Record<string, RawScheduled>; getMessagesPendingRemoval(): Set<string> };
  channels: { getChannel(id: string): RawChannel | undefined };
  guilds: { getGuild(id: string): { name: string } | undefined };
  users: { getUser(id: string): { username: string; globalName?: string | null } | undefined };
}

const OPTIONS = {
  sendPaceMs: 1200,
  cancelPaceMs: 600,
  // For cancels only. Creates wait as long as Discord asks, since the run is still valid afterwards.
  rateLimitRetries: 4,
  // Only used if Discord's own limit lookup can't be found. The server still enforces the real one.
  fallbackLimit: 10,
  tooManyScheduledCode: 640003,
  stopCheckMs: 250,
  discordEpochMs: 1420070400000,
  scheduledState: 0,
} as const;

const NEEDLES = {
  actions: "SCHEDULED_MESSAGES_CREATE_START",
  limit: "Config is missing scheduled message limit",
  scheduled: 'displayName="scheduledMessageStore"',
  channels: 'displayName="ChannelStore"',
  guilds: 'displayName="GuildStore"',
  users: 'displayName="UserStore"',
} as const;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Discord runs several webpack runtimes on one chunk array, and each calls this back. Only some hold the app. */
function getRuntimes() {
  const chunks = (window as unknown as ChunkGlobal).webpackChunkdiscord_app;
  if (!chunks) return [];

  const runtimes: Partial<WebpackRequire>[] = [];
  chunks.push([[Symbol("mass-schedule")], {}, (r: Partial<WebpackRequire>) => runtimes.push(r)]);
  chunks.pop();
  return runtimes.filter((r): r is WebpackRequire => Boolean(r.m && r.c));
}

/** Maps each needle to the exports of the first loaded module whose source contains it. */
function findModules(runtimes: WebpackRequire[]) {
  const hits = new Map<string, unknown>();
  const needles = Object.values(NEEDLES);

  for (const req of runtimes) {
    for (const [id, factory] of Object.entries(req.m)) {
      const loaded = req.c[id];
      if (!loaded) continue;

      const source = Function.prototype.toString.call(factory);
      for (const n of needles) {
        if (!hits.has(n) && source.includes(n)) hits.set(n, loaded.exports);
      }
      if (hits.size === needles.length) return hits;
    }
  }
  return hits;
}

function exportsOf(module: unknown): unknown[] {
  if (module === null || typeof module !== "object") return [];
  return Object.keys(module).map(k => (module as Record<string, unknown>)[k]);
}

function findFunction(module: unknown, ...sourceHints: string[]) {
  return exportsOf(module).find(
    e => typeof e === "function" && sourceHints.every(h => Function.prototype.toString.call(e).includes(h)),
  ) as Callable | undefined;
}

function findStore(module: unknown, method: string) {
  return exportsOf(module).find(
    e => e !== null && typeof e === "object" && typeof (e as Record<string, unknown>)[method] === "function",
  );
}

let cached: Internals | null = null;
let missing: string | null = null;

/** Finds Discord's internals once the app has loaded. Returns null while it's still starting up. */
function getInternals(): Internals | null {
  if (cached) return cached;

  const runtimes = getRuntimes();
  if (runtimes.length === 0) return null;

  const modules = findModules(runtimes);
  const actions = modules.get(NEEDLES.actions);
  const parts = {
    create: findFunction(actions, "SCHEDULED_MESSAGES_CREATE_START"),
    remove: findFunction(actions, "SCHEDULED_MESSAGES_DELETE_START"),
    fetchAll: findFunction(actions, "FETCH_SCHEDULED_MESSAGES"),
    scheduled: findStore(modules.get(NEEDLES.scheduled), "getScheduledMessagesForInbox"),
    channels: findStore(modules.get(NEEDLES.channels), "getChannel"),
    guilds: findStore(modules.get(NEEDLES.guilds), "getGuild"),
    users: findStore(modules.get(NEEDLES.users), "getUser"),
  };

  const absent = Object.entries(parts).filter(([, value]) => !value);
  if (absent.length > 0) {
    // The chat UI is only up once the app has finished loading its modules. Before that a miss means "not yet".
    if (document.querySelector('[data-list-id="guildsnav"]')) missing = absent.map(([key]) => key).join(", ");
    return null;
  }

  missing = null;
  cached = {
    ...parts,
    getLimit: findFunction(modules.get(NEEDLES.limit), "TIER_2", "getConfig") ?? null,
  } as Internals;
  return cached;
}

function describeError(error: unknown) {
  const e = error as DiscordError;
  if (e?.body?.code === OPTIONS.tooManyScheduledCode) return "You've hit your scheduled message limit.";
  return e?.body?.message ?? e?.message ?? "Discord rejected the request.";
}

/** Retries Discord's rate limit responses, waiting as long as Discord asks. */
async function withRateLimitRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const e = error as DiscordError;
      if (e?.status !== 429 || attempt >= OPTIONS.rateLimitRetries) throw error;
      await sleep(((e.body?.retry_after ?? 2) + 0.5) * 1000);
    }
  }
}

function describeTarget(d: Internals, channelId: string): Target {
  const channel = d.channels.getChannel(channelId);
  if (!channel) return { channelId, channelName: "Unknown channel", guildName: null };

  if (channel.guild_id) {
    return {
      channelId,
      channelName: channel.name ?? "unknown",
      guildName: d.guilds.getGuild(channel.guild_id)?.name ?? "Unknown server",
    };
  }

  const recipient = channel.recipients?.[0] ? d.users.getUser(channel.recipients[0]) : undefined;
  return {
    channelId,
    channelName: channel.name || recipient?.globalName || recipient?.username || "Direct message",
    guildName: null,
  };
}

function currentChannelId() {
  return location.pathname.match(/^\/channels\/(?:\d+|@me)\/(\d+)/)?.[1] ?? null;
}

const job: JobStatus = {
  running: false,
  total: 0,
  done: 0,
  error: null,
  finishedAt: null,
  lastSendAt: null,
  waitingUntil: null,
};
const countedIds = new Set<string>();
let stopRequested = false;
let queueLoaded = false;
let allowanceFullAt = 0;

/**
 * Counts every message seen against the rate limit, using the creation time in its id. Ids stay
 * counted after a cancel or send, since those don't give the allowance back. That includes messages
 * made in Discord itself, and earlier ones still queued after a page reload.
 */
function countCreatedMessages(d: Internals) {
  const unseen = Object.keys(d.scheduled.getScheduledMessagesForInbox()).filter(id => !countedIds.has(id));
  const createdAt = (id: string) => Number(BigInt(id) >> 22n) + OPTIONS.discordEpochMs;

  for (const id of unseen.sort((a, b) => createdAt(a) - createdAt(b))) {
    countedIds.add(id);
    allowanceFullAt = recordSend(allowanceFullAt, createdAt(id));
  }
}

/** Sleeps until the time given, or until a stop is requested. */
async function waitUntil(at: number) {
  if (at <= Date.now()) return;

  job.waitingUntil = at;
  while (Date.now() < at && !stopRequested) await sleep(OPTIONS.stopCheckMs);
  job.waitingUntil = null;
}

/** Creates one message once the rate limit allows it. Returns false if stopped first. */
async function createWhenAllowed(d: Internals, channelId: string, content: string, at: number) {
  while (!stopRequested) {
    countCreatedMessages(d);
    await waitUntil(nextSendAt(allowanceFullAt, Date.now()));
    if (stopRequested) return false;

    try {
      await d.create({
        channelId,
        scheduledTimestamp: new Date(at).toISOString(),
        messageSendData: { content, flags: 0, attachments: [] },
      });
      countCreatedMessages(d);
      return true;
    } catch (error) {
      const e = error as DiscordError;
      if (e?.status !== 429) throw error;
      allowanceFullAt = recordRejection(allowanceFullAt, Date.now(), (e.body?.retry_after ?? 5) * 1000);
    }
  }
  return false;
}

async function runJob(d: Internals, { channelId, content, times }: JobRequest) {
  try {
    for (const [i, at] of times.entries()) {
      if (!(await createWhenAllowed(d, channelId, content, at))) break;
      job.done++;
      job.lastSendAt = at;
      if (i < times.length - 1) await sleep(OPTIONS.sendPaceMs);
    }
  } catch (error) {
    job.error = describeError(error);
  }
  job.running = false;
  job.finishedAt = Date.now();
}

const api: PageApi = {
  version: () => __VERSION__,

  snapshot(): Snapshot {
    const d = getInternals();
    if (!d) return missing ? { status: "unsupported", missing } : { status: "loading" };

    const pending = d.scheduled.getMessagesPendingRemoval();
    const queue = Object.values(d.scheduled.getScheduledMessagesForInbox())
      .filter(m => !pending.has(m.scheduledMessageId))
      .map(
        (m): QueuedMessage => ({
          ...describeTarget(d, m.createArgs.channelId),
          id: m.scheduledMessageId,
          content: m.createArgs.content,
          sendAt: new Date(m.sendAtTimestamp).getTime(),
          failed: m.state !== OPTIONS.scheduledState,
        }),
      )
      .sort((a, b) => a.sendAt - b.sendAt);

    countCreatedMessages(d);

    const channelId = currentChannelId();
    return {
      status: "ready",
      limit: d.getLimit?.("ScheduledMessagesCreateRoadblock").limit ?? OPTIONS.fallbackLimit,
      current: channelId ? describeTarget(d, channelId) : null,
      queue,
      queueLoaded,
      job: { ...job },
      sendsAvailable: sendsAvailable(allowanceFullAt, Date.now()),
      refillMs: SEND_LIMIT.refillMs,
    };
  },

  async refresh() {
    const d = getInternals();
    if (!d) return;
    await d.fetchAll();
    queueLoaded = true;
  },

  start(request) {
    const d = getInternals();
    if (!d || job.running) return;

    Object.assign(job, {
      running: true,
      total: request.times.length,
      done: 0,
      error: null,
      finishedAt: null,
      lastSendAt: null,
      waitingUntil: null,
    });
    stopRequested = false;
    void runJob(d, request);
  },

  stop() {
    stopRequested = true;
  },

  /** Returns an error message, or null if everything was cancelled. */
  async cancel(ids) {
    const d = getInternals();
    if (!d) return "Discord isn't ready yet.";

    for (const [i, id] of ids.entries()) {
      try {
        await withRateLimitRetry(() => d.remove(id));
      } catch (error) {
        return describeError(error);
      }
      if (i < ids.length - 1) await sleep(OPTIONS.cancelPaceMs);
    }
    return null;
  },
};

function isRunningJob(instance: PageApi) {
  const snapshot = instance.snapshot();
  return snapshot.status === "ready" && snapshot.job.running;
}

// Re-injected on every poll so a reloaded tab recovers by itself. The first instance stays, since it holds the job,
// until an update changes the version. Then this one takes over as soon as no job is running, without a tab reload.
const existing = window.__massSchedule;
if (!existing || (existing.version() !== api.version() && !isRunningJob(existing))) window.__massSchedule = api;
