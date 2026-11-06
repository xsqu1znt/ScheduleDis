export interface Target {
  channelId: string;
  channelName: string;
  /** Null for DMs and group DMs. */
  guildName: string | null;
}

export interface QueuedMessage extends Target {
  id: string;
  content: string;
  sendAt: number;
  /** Discord tried to send it and couldn't, or can no longer send it. */
  failed: boolean;
}

export interface JobRequest {
  channelId: string;
  content: string;
  times: number[];
}

export interface JobStatus {
  running: boolean;
  total: number;
  done: number;
  error: string | null;
  finishedAt: number | null;
  lastSendAt: number | null;
  /** Set while holding back for Discord's rate limit. */
  waitingUntil: number | null;
}

export type Snapshot =
  | { status: "loading" }
  | { status: "unsupported"; missing: string }
  | {
      status: "ready";
      /** Zero when scheduled messages aren't enabled on this account. */
      limit: number;
      current: Target | null;
      queue: QueuedMessage[];
      queueLoaded: boolean;
      job: JobStatus;
      /** Messages that can be created right now before the rate limit applies. */
      sendsAvailable: number;
      /** Time between creates once those run out. */
      refillMs: number;
    };

/** What the page script exposes on `window.__massSchedule`. Everything must be JSON-serializable. */
export interface PageApi {
  version(): string;
  snapshot(): Snapshot;
  refresh(): Promise<void>;
  start(job: JobRequest): void;
  stop(): void;
  cancel(ids: string[]): Promise<string | null>;
}

declare global {
  interface Window {
    __massSchedule?: PageApi;
  }
}
