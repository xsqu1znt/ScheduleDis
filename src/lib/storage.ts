export interface Preset {
  channelId: string;
  channelName: string;
  guildName: string | null;
  content: string;
  count: number;
  intervalMin: number;
  /** Zero means no buffer. */
  bufferSec: number;
}

export interface Draft {
  content: string;
  intervalMin: number;
  /** Kept while the buffer is off, so turning it back on restores the last value. */
  bufferSec: number;
  bufferOn: boolean;
  presets: Preset[];
}

const OPTIONS = {
  key: "draft-v3",
  legacyKey: "draft-v2",
  defaults: { content: "", intervalMin: 30, bufferSec: 30, bufferOn: false, presets: [] } satisfies Draft,
} as const;

export const BUFFER = { minSec: 5, maxSec: 120, stepSec: 5 } as const;

/** Moves a saved buffer onto the slider's steps. */
function snapBuffer(sec: number) {
  const snapped = Math.round(sec / BUFFER.stepSec) * BUFFER.stepSec;
  return Math.min(BUFFER.maxSec, Math.max(BUFFER.minSec, snapped));
}

/** Carries over what a v2 draft has in common. Its recents are dropped: presets are saved on purpose. */
export function upgradeDraft(legacy: { content?: string; intervalMin?: number; bufferSec?: number }): Draft {
  const bufferSec = legacy.bufferSec ?? 0;
  return {
    ...OPTIONS.defaults,
    content: legacy.content ?? OPTIONS.defaults.content,
    intervalMin: legacy.intervalMin ?? OPTIONS.defaults.intervalMin,
    bufferSec: bufferSec > 0 ? snapBuffer(bufferSec) : OPTIONS.defaults.bufferSec,
    bufferOn: bufferSec > 0,
  };
}

export async function loadDraft(): Promise<Draft> {
  const stored = await chrome.storage.local.get([OPTIONS.key, OPTIONS.legacyKey]);
  const current = stored[OPTIONS.key] as Partial<Draft> | undefined;
  if (current) return { ...OPTIONS.defaults, ...current };

  const legacy = stored[OPTIONS.legacyKey] as Parameters<typeof upgradeDraft>[0] | undefined;
  return legacy ? upgradeDraft(legacy) : { ...OPTIONS.defaults };
}

export async function saveDraft(draft: Draft) {
  await chrome.storage.local.set({ [OPTIONS.key]: draft });
}

const sameRun = (a: Preset, b: Preset) => a.channelId === b.channelId && a.content === b.content;

/** True only when every setting matches a saved preset, so the star shows whether this exact setup is saved. */
export function isPresetSaved(presets: Preset[], preset: Preset) {
  return presets.some(
    p => sameRun(p, preset) && p.count === preset.count && p.intervalMin === preset.intervalMin && p.bufferSec === preset.bufferSec,
  );
}

/** Saves a preset at the front, replacing any for the same message and channel, or removes it if it's already saved as is. */
export function togglePreset(presets: Preset[], preset: Preset) {
  const others = presets.filter(p => !sameRun(p, preset));
  return isPresetSaved(presets, preset) ? others : [preset, ...others];
}
