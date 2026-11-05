import type { PageApi } from "./types";

export const DISCORD_APP_URL = "https://discord.com/app";
const DISCORD_TABS = ["https://discord.com/*", "https://ptb.discord.com/*", "https://canary.discord.com/*"];

/** Prefers the tab you're looking at, then whichever Discord tab was used last. */
export async function findDiscordTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true, url: DISCORD_TABS });
  if (active?.id !== undefined) return active.id;

  const tabs = await chrome.tabs.query({ url: DISCORD_TABS });
  tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return tabs[0]?.id ?? null;
}

export async function injectPageScript(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["page.js"] });
}

/** Calls a page script method inside Discord's tab and returns its result. */
export async function callPage<M extends keyof PageApi>(tabId: number, method: M, ...args: Parameters<PageApi[M]>) {
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (name: string, params: unknown[]) => {
      const api = window.__massSchedule as unknown as Record<string, (...a: unknown[]) => unknown>;
      return api[name]!(...params);
    },
    args: [method, args as unknown[]],
  });
  return frame?.result as Awaited<ReturnType<PageApi[M]>>;
}
