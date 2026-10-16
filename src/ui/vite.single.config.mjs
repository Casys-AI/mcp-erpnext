/**
 * Vite config for building a single UI viewer.
 *
 * Used by build-all.mjs to build each UI individually.
 * UI_NAME env var specifies which UI to build.
 *
 * KPI and funnel use Preact + Tailwind; other viewers remain on React 18.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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

const usesContextView = ["kpi-viewer", "funnel-viewer"].includes(uiName);

function bundledModulesReport() {
  const cssIds = new Set();
  const renderedModules = new Set();
  // Rollup prefixes virtual ids (commonjs proxies) with \0 and may add ?query.
  const clean = (id) =>
    id.replace(/^\0/, "").split("?")[0].replaceAll("\\", "/");
  return {
    name: "erpnext-bundled-modules-report",
    apply: "build",
    enforce: "post",
    transform(_code, id) {
      const file = clean(id);
      if (file.endsWith(".css") && file.includes("/node_modules/")) {
        cssIds.add(file);
      }
    },
    renderChunk(_code, chunk) {
      // singlefile removes JS chunks during generateBundle; capture provenance first.
      for (const [id, info] of Object.entries(chunk.modules)) {
        const file = clean(id);
        if (info.renderedLength > 0 && file.includes("/node_modules/")) {
          renderedModules.add(file);
        }
      }
      return null;
    },
    generateBundle(_options, bundle) {
      const modules = new Set([...cssIds, ...renderedModules]);
      // Tailwind resolves its CSS imports internally, outside Rollup's module graph.
      // Attribute its license only when its banner survives in the emitted CSS/HTML.
      const embedsTailwind = Object.values(bundle).some((output) => {
        const source = output.type === "chunk" ? output.code : output.source;
        return typeof source === "string" &&
          source.includes("/*! tailwindcss v");
      });
      if (embedsTailwind) {
        modules.add(resolve(__dirname, "node_modules/tailwindcss/index.css"));
      }
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
  plugins: [
    ...(usesContextView ? [tailwindcss(), preact()] : [react()]),
    viteSingleFile(),
    bundledModulesReport(),
  ],
  root: resolve(__dirname, uiName),
  resolve: {
    alias: {
      "~": resolve(__dirname),
      ...(usesContextView
        ? {
          // Keep subpaths before bare package aliases: Vite matches prefixes.
          "preact/hooks": resolve(__dirname, "node_modules/preact/hooks"),
          "preact/jsx-runtime": resolve(
            __dirname,
            "node_modules/preact/jsx-runtime",
          ),
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
        }
        : {}),
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
