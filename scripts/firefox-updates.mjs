// Writes updates.json for the release workflow: the file installed Firefox add-ons check for new versions.
// It always points at the release being published, so "latest" on GitHub gives Firefox the newest version.

import { readFileSync, writeFileSync } from "node:fs";

const OPTIONS = { manifest: "dist-firefox/manifest.json", output: "updates.json", xpiName: "ScheduleDis-firefox.xpi" };

const { TAG, GITHUB_REPOSITORY } = process.env;
if (!TAG || !GITHUB_REPOSITORY) throw new Error("TAG and GITHUB_REPOSITORY must be set.");

const manifest = JSON.parse(readFileSync(OPTIONS.manifest, "utf8"));
const update = {
  version: manifest.version,
  update_link: `https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/${OPTIONS.xpiName}`,
};

const id = manifest.browser_specific_settings.gecko.id;
writeFileSync(OPTIONS.output, `${JSON.stringify({ addons: { [id]: { updates: [update] } } }, null, 2)}\n`);
