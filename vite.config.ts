import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import packageJson from "./package.json" with { type: "json" };

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

export default defineConfig({
  base: "",
  define: { __VERSION__: JSON.stringify(packageJson.version) },
  plugins: [react(), tailwindcss(), isolatePageScript()],
  build: {
    modulePreload: false,
    rolldownOptions: {
      input: { popup: "popup.html", update: "update.html", page: "src/page/index.ts" },
      output: { entryFileNames: "[name].js", chunkFileNames: "[name].js", assetFileNames: "[name][extname]" },
    },
  },
});
