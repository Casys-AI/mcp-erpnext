/**
 * Vite config for building a single UI viewer.
 *
 * Used by build-all.mjs to build each UI individually.
 * UI_NAME env var specifies which UI to build.
 *
 * Stack: React 18 + vite-plugin-singlefile (inline everything)
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiName = process.env.UI_NAME;

if (!uiName) {
  throw new Error("UI_NAME environment variable is required");
}

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: resolve(__dirname, uiName),
  resolve: {
    alias: {
      "~": resolve(__dirname),
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
