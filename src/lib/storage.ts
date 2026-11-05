export interface RecentRun {
  channelId: string;
  channelName: string;
  guildName: string | null;
  content: string;
  intervalMin: number;
  bufferSec: number;
}

export interface Draft {
  content: string;
  intervalMin: number;
  bufferSec: number;
  recents: RecentRun[];
}

const OPTIONS = {
  // Versioned so drafts saved with the old combined interval (and old default message) don't carry over.
  key: "draft-v2",
  maxRecents: 4,
  defaults: { content: "", intervalMin: 30, bufferSec: 60, recents: [] } satisfies Draft,
} as const;

export async function loadDraft(): Promise<Draft> {
  const stored = await chrome.storage.local.get(OPTIONS.key);
  return { ...OPTIONS.defaults, ...(stored[OPTIONS.key] as Partial<Draft> | undefined) };
}

export async function saveDraft(draft: Draft) {
  await chrome.storage.local.set({ [OPTIONS.key]: draft });
}

/** Puts a run at the front of the recents, replacing any earlier run of the same message and channel. */
export function addRecent(recents: RecentRun[], run: RecentRun) {
  const others = recents.filter(r => r.channelId !== run.channelId || r.content !== run.content);
  return [run, ...others].slice(0, OPTIONS.maxRecents);
}
