import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import baseManifest from "./public/manifest.json" with { type: "json" };
import packageJson from "./package.json" with { type: "json" };

const FIREFOX_SETTINGS = {
  gecko: {
    // Firefox identifies the add-on by this for storage and updates, so it can't change once published.
    id: "scheduledis@xsqu1znt.github.io",
    // 128 added MAIN world scripts. 140 is the first to understand data_collection_permissions.
    strict_min_version: "140.0",
    // Firefox checks this itself and installs new versions. scripts/firefox-updates.mjs writes the file.
    update_url: "https://github.com/xsqu1znt/ScheduleDis/releases/latest/download/updates.json",
    data_collection_permissions: { required: ["none"] },
  },
} as const;

/**
 * Wraps the page script in its own scope. It's injected as a classic script every time the popup
 * opens, so top-level consts would otherwise collide on the second injection.
 */
function isolatePageScript(): Plugin {
  return {
    name: "isolate-page-script",
    generateBundle(_, bundle) {
      const chunk = bundle["page.js"];
      if (chunk?.type === "chunk") chunk.code = `(()=>{${chunk.code}})();`;
    },
  };
}

/**
 * Replaces the manifest copied from public with Firefox's version. It adds the add-on's identity and
 * drops the GitHub hosts, which only the in-app updater needs. Firefox updates add-ons by itself.
 */
function firefoxManifest(): Plugin {
  return {
    name: "firefox-manifest",
    generateBundle() {
      const manifest = {
        ...baseManifest,
        host_permissions: baseManifest.host_permissions.filter(h => !h.includes("github")),
        browser_specific_settings: FIREFOX_SETTINGS,
      };
      this.emitFile({ type: "asset", fileName: "manifest.json", source: `${JSON.stringify(manifest, null, 2)}\n` });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isFirefox = mode === "firefox";

  return {
    base: "",
    define: { __VERSION__: JSON.stringify(packageJson.version), __TARGET__: JSON.stringify(isFirefox ? "firefox" : "chrome") },
    plugins: [react(), tailwindcss(), isolatePageScript(), ...(isFirefox ? [firefoxManifest()] : [])],
    build: {
      outDir: isFirefox ? "dist-firefox" : "dist",
      modulePreload: false,
      rolldownOptions: {
        input: { popup: "popup.html", page: "src/page/index.ts", ...(isFirefox ? {} : { update: "update.html" }) },
        output: { entryFileNames: "[name].js", chunkFileNames: "[name].js", assetFileNames: "[name][extname]" },
      },
    },
  };
});
