/**
 * Vite config for building a single UI viewer.
 *
 * Used by build-all.mjs to build each UI individually.
 * UI_NAME env var specifies which UI to build.
 *
 * Stack: Preact + Tailwind v4 + vite-plugin-singlefile.
 */

import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiName = process.env.UI_NAME;
if (!uiName) {
  throw new Error("UI_NAME environment variable is required");
}

/**
 * Records which node_modules files actually end up in this viewer's bundle.
 *
 * Output: src/ui/.build-meta/<viewer>.json (gitignored, never published).
 * `scripts/third-party-notices.mjs` reads it to generate THIRD_PARTY_NOTICES.txt
 * from what is really embedded — tree-shaken modules (renderedLength 0) and
 * aliased packages (react -> preact/compat) are correctly left out.
 */
function bundledModulesReport() {
  const cssIds = new Set();
  // Rollup prefixes virtual ids (commonjs proxies) with \0 and may add ?query.
  const clean = (id) =>
    id.replace(/^\0/, "").split("?")[0].replaceAll("\\", "/");
  return {
    name: "erpnext-bundled-modules-report",
    apply: "build",
    transform(_code, id) {
      const file = clean(id);
      if (file.endsWith(".css") && file.includes("/node_modules/")) {
        cssIds.add(file);
      }
    },
    generateBundle(_options, bundle) {
      const modules = new Set(cssIds);
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const [id, info] of Object.entries(chunk.modules)) {
          const file = clean(id);
          if (info.renderedLength > 0 && file.includes("/node_modules/")) {
            modules.add(file);
          }
        }
      }
      const dir = resolve(__dirname, ".build-meta");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, `${uiName}.json`),
        JSON.stringify(
          { version: 1, viewer: uiName, modules: [...modules].sort() },
          null,
          2,
        ) + "\n",
      );
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), preact(), viteSingleFile(), bundledModulesReport()],
  root: resolve(__dirname, uiName),
  resolve: {
    alias: {
      "~": resolve(__dirname, "."),
      // Vite teste les alias dans l'ordre d'insertion et compare en préfixe :
      // les entrées "preact/*" doivent donc précéder le "preact" nu, sinon
      // celui-ci les capture toutes et réécrit vers des chemins inexistants.
      "preact/hooks": resolve(__dirname, "node_modules/preact/hooks"),
      "preact/jsx-runtime": resolve(
        __dirname,
        "node_modules/preact/jsx-runtime",
      ),
      // Le mode dev compile en jsxDEV, que preact exporte depuis le même dist
      // que jsx-runtime — il n'existe pas de dossier jsx-dev-runtime.
      "preact/jsx-dev-runtime": resolve(
        __dirname,
        "node_modules/preact/jsx-runtime",
      ),
      "preact/debug": resolve(__dirname, "node_modules/preact/debug"),
      "preact/devtools": resolve(__dirname, "node_modules/preact/devtools"),
      "preact/compat": resolve(__dirname, "node_modules/preact/compat"),
      "preact": resolve(__dirname, "node_modules/preact"),
      "react-dom/client": resolve(
        __dirname,
        "node_modules/preact/compat/client",
      ),
      "react-dom": resolve(__dirname, "node_modules/preact/compat"),
      "react": resolve(__dirname, "node_modules/preact/compat"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist", uiName),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: resolve(__dirname, uiName, "index.html"),
    },
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    minify: true,
  },
});
