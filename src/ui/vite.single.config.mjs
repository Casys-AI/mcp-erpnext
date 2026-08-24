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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiName = process.env.UI_NAME;
if (!uiName) {
  throw new Error("UI_NAME environment variable is required");
}

export default defineConfig({
  plugins: [tailwindcss(), preact(), viteSingleFile()],
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
