import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { checkFolder, installZip, isNewer, parseRelease } from "./update";

const IDENTITY = { name: "ScheduleDis", version: "1.1.0" };
const manifestOf = (id: { name: string; version: string }) => strToU8(JSON.stringify(id));
const zipOf = (files: Record<string, Uint8Array>) => zipSync(files);

/** An in-memory folder that records the order files are finished in. */
function fakeFolder(files: Record<string, string> = {}) {
  const written: string[] = [];

  const folderAt = (prefix: string): unknown => ({
    getDirectoryHandle: async (name: string) => folderAt(`${prefix}${name}/`),
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const path = prefix + name;
      if (!options?.create && !(path in files)) throw new DOMException("missing", "NotFoundError");
      return {
        getFile: async () => ({ text: async () => files[path] }),
        createWritable: async () => {
          let content = "";
          return {
            write: async (bytes: Uint8Array) => void (content = new TextDecoder().decode(bytes)),
            close: async () => {
              files[path] = content;
              written.push(path);
            },
          };
        },
      };
    },
  });

  return { folder: folderAt("") as FileSystemDirectoryHandle, files, written };
}

describe("isNewer", () => {
  it("compares each part as a number", () => {
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  });

  it("is false for the same or an older version", () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("1.9.9", "1.10.0")).toBe(false);
  });

  it("is false for anything that isn't a plain version", () => {
    expect(isNewer("1.1.0-beta", "1.0.0")).toBe(false);
    expect(isNewer("1.1", "1.0.0")).toBe(false);
    expect(isNewer("1.1.0", "nightly")).toBe(false);
  });
});

describe("parseRelease", () => {
  const zip = { name: "ScheduleDis.zip", browser_download_url: "https://github.com/a.zip" };

  it("takes the version from the tag and finds the zip among the assets", () => {
    const assets = [{ name: "other.txt", browser_download_url: "https://github.com/b" }, zip];
    expect(parseRelease({ tag_name: "v1.2.3", assets })).toEqual({ version: "1.2.3", zipUrl: zip.browser_download_url });
  });

  it("is null without the zip or a usable tag", () => {
    expect(parseRelease({ tag_name: "v1.2.3", assets: [] })).toBeNull();
    expect(parseRelease({ tag_name: "latest", assets: [zip] })).toBeNull();
    expect(parseRelease({ message: "Not Found" })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe("checkFolder", () => {
  const running = { name: "ScheduleDis", version: "1.0.0" };

  it("accepts the copy that's running", async () => {
    const { folder } = fakeFolder({ "manifest.json": JSON.stringify(running) });
    await expect(checkFolder(folder, running)).resolves.toBeUndefined();
  });

  it("rejects a folder that has no manifest or another extension's", async () => {
    await expect(checkFolder(fakeFolder().folder, running)).rejects.toThrow("isn't the ScheduleDis folder");

    const other = fakeFolder({ "manifest.json": JSON.stringify({ name: "Other", version: "1.0.0" }) });
    await expect(checkFolder(other.folder, running)).rejects.toThrow("isn't the ScheduleDis folder");
  });

  it("rejects another copy on a different version", async () => {
    const { folder } = fakeFolder({ "manifest.json": JSON.stringify({ ...running, version: "0.9.0" }) });
    await expect(checkFolder(folder, running)).rejects.toThrow("different copy");
  });
});

describe("installZip", () => {
  it("writes every file, including nested ones, with the manifest last", async () => {
    const { folder, files, written } = fakeFolder();
    const zip = zipOf({ "manifest.json": manifestOf(IDENTITY), "popup.js": strToU8("new"), "icons/16.png": strToU8("icon") });

    await installZip(folder, zip, IDENTITY);

    expect(files["popup.js"]).toBe("new");
    expect(files["icons/16.png"]).toBe("icon");
    expect(written.at(-1)).toBe("manifest.json");
  });

  it("skips the folder entries that zip adds", async () => {
    const { folder, written } = fakeFolder();
    await installZip(folder, zipOf({ "icons/": new Uint8Array(), "manifest.json": manifestOf(IDENTITY) }), IDENTITY);
    expect(written).toEqual(["manifest.json"]);
  });

  it.each([
    ["no manifest", { "popup.js": strToU8("x") }, "isn't ScheduleDis"],
    ["the wrong version", { "manifest.json": manifestOf({ ...IDENTITY, version: "1.0.9" }) }, "isn't ScheduleDis"],
    ["the wrong name", { "manifest.json": manifestOf({ ...IDENTITY, name: "Other" }) }, "isn't ScheduleDis"],
    ["a path out of the folder", { "manifest.json": manifestOf(IDENTITY), "../evil.js": strToU8("x") }, "unsafe"],
  ])("writes nothing for a zip with %s", async (_, contents, message) => {
    const { folder, written } = fakeFolder();
    await expect(installZip(folder, zipOf(contents), IDENTITY)).rejects.toThrow(message);
    expect(written).toEqual([]);
  });

  it("writes nothing for a damaged zip", async () => {
    const { folder, written } = fakeFolder();
    await expect(installZip(folder, strToU8("not a zip"), IDENTITY)).rejects.toThrow("damaged");
    expect(written).toEqual([]);
  });
});
