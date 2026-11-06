import { describe, expect, it } from "vitest";
import { isPresetSaved, togglePreset, upgradeDraft, type Preset } from "./storage";

const preset: Preset = { channelId: "c1", channelName: "general", guildName: "Server", content: ".tot", count: 25, intervalMin: 30, bufferSec: 60 };

describe("upgradeDraft", () => {
  it("keeps a buffer the user had, snapped onto the slider and capped at its maximum", () => {
    expect(upgradeDraft({ bufferSec: 62 })).toMatchObject({ bufferOn: true, bufferSec: 60 });
    expect(upgradeDraft({ bufferSec: 600 })).toMatchObject({ bufferOn: true, bufferSec: 120 });
  });

  it("leaves the buffer off when the old draft had none", () => {
    expect(upgradeDraft({ bufferSec: 0 })).toMatchObject({ bufferOn: false, bufferSec: 30 });
  });
});

describe("togglePreset", () => {
  it("saves a new preset, then removes it when toggled again unchanged", () => {
    const saved = togglePreset([], preset);
    expect(saved).toEqual([preset]);
    expect(togglePreset(saved, preset)).toEqual([]);
  });

  it("overwrites the preset for the same message and channel when its settings changed", () => {
    const changed = { ...preset, count: 10 };
    expect(isPresetSaved([preset], changed)).toBe(false);
    expect(togglePreset([preset], changed)).toEqual([changed]);
  });

  it("keeps presets for other channels", () => {
    const other = { ...preset, channelId: "c2" };
    expect(togglePreset([other], preset)).toEqual([preset, other]);
  });
});
