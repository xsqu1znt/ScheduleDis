import { unzipSync } from "fflate";

export interface Release {
  version: string;
  zipUrl: string;
}

interface Identity {
  name: string;
  version: string;
}

interface CachedCheck {
  release: Release | null;
  checkedAt: number;
}

const OPTIONS = {
  latestReleaseUrl: "https://api.github.com/repos/xsqu1znt/ScheduleDis/releases/latest",
  // The release workflow publishes the zip under this name.
  zipName: "ScheduleDis.zip",
  manifestName: "manifest.json",
  cacheKey: "update-check",
  // GitHub allows 60 unauthenticated requests an hour, and the popup can be opened far more often than that.
  checkEveryMs: 60 * 60 * 1000,
} as const;

/** A problem to show the user as written, as opposed to an unexpected failure. */
export class UpdateError extends Error {}

function parseVersion(version: string) {
  const parts = version.split(".").map(Number);
  return parts.length === 3 && parts.every(p => Number.isInteger(p) && p >= 0) ? parts : null;
}

/** True when `candidate` is a later version than `current`. Anything that isn't like 1.2.3 is never newer. */
export function isNewer(candidate: string, current: string) {
  const [a, b] = [parseVersion(candidate), parseVersion(current)];
  if (!a || !b) return false;

  const i = a.findIndex((part, i) => part !== b[i]);
  return i !== -1 && a[i]! > b[i]!;
}

/** Reads GitHub's "latest release" response. Returns null if it has no usable tag or zip. */
export function parseRelease(data: unknown): Release | null {
  const { tag_name: tag, assets } = (data ?? {}) as { tag_name?: unknown; assets?: unknown };
  if (typeof tag !== "string" || !Array.isArray(assets)) return null;

  const zip = (assets as { name?: unknown; browser_download_url?: unknown }[]).find(a => a?.name === OPTIONS.zipName);
  if (typeof zip?.browser_download_url !== "string") return null;

  const version = tag.replace(/^v/, "");
  return parseVersion(version) ? { version, zipUrl: zip.browser_download_url } : null;
}

async function fetchLatestRelease() {
  const response = await fetch(OPTIONS.latestReleaseUrl, { headers: { Accept: "application/vnd.github+json" } });
  // GitHub answers 404 until the first release exists.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return parseRelease(await response.json());
}

/**
 * Finds a release newer than the running version, asking GitHub at most once an hour.
 * If GitHub can't be reached, this answers from the last check.
 */
export async function findUpdate() {
  const stored = await chrome.storage.local.get(OPTIONS.cacheKey);
  const cached = stored[OPTIONS.cacheKey] as CachedCheck | undefined;
  let release = cached?.release ?? null;

  if (!cached || Date.now() - cached.checkedAt >= OPTIONS.checkEveryMs) {
    try {
      release = await fetchLatestRelease();
      await chrome.storage.local.set({ [OPTIONS.cacheKey]: { release, checkedAt: Date.now() } satisfies CachedCheck });
    } catch {
      // Being offline shouldn't show as anything. The next popup open tries again.
    }
  }

  return release && isNewer(release.version, chrome.runtime.getManifest().version) ? release : null;
}

function parseManifest(text: string) {
  try {
    return JSON.parse(text) as Partial<Identity>;
  } catch {
    return null;
  }
}

async function readFolderManifest(folder: FileSystemDirectoryHandle) {
  try {
    const handle = await folder.getFileHandle(OPTIONS.manifestName);
    return parseManifest(await (await handle.getFile()).text());
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

/**
 * Makes sure a folder is the copy the browser is running, since updating any other copy would change nothing.
 * @throws UpdateError saying what's wrong with the folder.
 */
export async function checkFolder(folder: FileSystemDirectoryHandle, running: Identity) {
  const manifest = await readFolderManifest(folder);
  if (manifest?.name !== running.name) {
    throw new UpdateError(`That isn't the ${running.name} folder. Choose the folder that has manifest.json directly inside it.`);
  }
  if (manifest.version !== running.version) {
    throw new UpdateError(
      `That's a different copy of ${running.name} (v${manifest.version}, and you're running v${running.version}). Choose the folder you loaded in the extensions page.`,
    );
  }
}

async function writeFile(folder: FileSystemDirectoryHandle, path: string, bytes: Uint8Array<ArrayBuffer>) {
  const parts = path.split("/");
  const name = parts.pop()!;

  let parent = folder;
  for (const part of parts) parent = await parent.getDirectoryHandle(part, { create: true });

  const writable = await (await parent.getFileHandle(name, { create: true })).createWritable();
  await writable.write(bytes);
  await writable.close();
}

function unzip(zip: Uint8Array) {
  try {
    return unzipSync(zip);
  } catch {
    throw new UpdateError("The download was damaged. Try again.");
  }
}

/**
 * Checks a release zip, then writes its files over the folder. The manifest goes last, so a failed
 * write leaves the old version number in place and the update can simply be run again.
 * @param expected What the zip's manifest must say.
 * @throws UpdateError if the zip isn't the expected release. Nothing has been written in that case.
 */
export async function installZip(folder: FileSystemDirectoryHandle, zip: Uint8Array, expected: Identity) {
  const files = Object.entries(unzip(zip)).filter(([path]) => !path.endsWith("/"));

  const manifest = files.find(([path]) => path === OPTIONS.manifestName);
  const parsed = manifest && parseManifest(new TextDecoder().decode(manifest[1]));
  if (parsed?.name !== expected.name || parsed.version !== expected.version) {
    throw new UpdateError(`The download isn't ${expected.name} v${expected.version}, so nothing was changed.`);
  }
  if (files.some(([path]) => path.split("/").some(part => part === "" || part === "." || part === ".."))) {
    throw new UpdateError("The download has an unsafe file path, so nothing was changed.");
  }

  const others = files.filter(([path]) => path !== OPTIONS.manifestName);
  for (const [path, bytes] of [...others, manifest!]) await writeFile(folder, path, bytes as Uint8Array<ArrayBuffer>);
}
