/**
 * Build only the immutable Buy evidence viewer through the published UI
 * pipeline. Existing src/ui/package.json packages are reused.
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(__dirname, "..");

execSync("npx vite build --config vite.single.config.mjs", {
  cwd: uiRoot,
  stdio: "inherit",
  env: { ...process.env, UI_NAME: "buy-evidence-viewer" },
});
