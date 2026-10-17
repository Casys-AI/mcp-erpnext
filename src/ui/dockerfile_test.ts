/**
 * Invariant: the Dockerfile `ui-builder` stage can build every viewer.
 *
 * That stage only sees what it COPYs. A viewer that imports a module outside
 * `src/ui` (e.g. buy-evidence-viewer -> ../../../buy/*.ts) breaks
 * `docker build` unless that top-level `src/<dir>/` is copied as well.
 * This test derives the required directories from the real imports.
 */
import { assert, assertEquals } from "@std/assert";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UI_ROOT = fileURLToPath(new URL("./", import.meta.url)).replace(
  /\/$/,
  "",
);
const SRC_ROOT = dirname(UI_ROOT);
const REPO_ROOT = dirname(SRC_ROOT);

const SKIPPED_DIRS = new Set(["node_modules", "dist"]);
const BUILD_SOURCE = /\.(ts|tsx|mjs|css)$/;
// Dev-only files never bundled into a viewer (not part of the vite graph).
const NOT_BUNDLED = /(_test\.ts|\.test\.ts|\/test\.ts|\/check-bundle\.ts)$/;
const RELATIVE_IMPORT =
  /(?:from\s+|import\s*\(?\s*|@import\s+)["'](\.{1,2}\/[^"']+)["']/g;

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory) yield* walk(path);
    else if (BUILD_SOURCE.test(entry.name)) yield path;
  }
}

async function externalSrcDirsImportedByViewers(): Promise<string[]> {
  const dirs = new Set<string>();
  for await (const file of walk(UI_ROOT)) {
    // Only viewers and shared/ feed the vite build.
    const rel = relative(UI_ROOT, file);
    if (!rel.includes("/")) continue;
    if (NOT_BUNDLED.test(file)) continue;
    const source = await Deno.readTextFile(file);
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const target = resolve(dirname(file), match[1]);
      if (target === UI_ROOT || target.startsWith(`${UI_ROOT}/`)) continue;
      const fromSrc = relative(SRC_ROOT, target);
      assert(
        !fromSrc.startsWith(".."),
        `${relative(REPO_ROOT, file)} imports ${match[1]} outside src/`,
      );
      dirs.add(fromSrc.split("/")[0]);
    }
  }
  return [...dirs].sort();
}

Deno.test("Dockerfile ui-builder copies every src/ directory a viewer imports", async () => {
  const dockerfile = await Deno.readTextFile(resolve(REPO_ROOT, "Dockerfile"));
  const uiBuilder = dockerfile.split(/^FROM /m).find((stage) =>
    stage.includes("AS ui-builder")
  );
  assert(uiBuilder, "Dockerfile has no ui-builder stage");

  const copied = [...uiBuilder.matchAll(/^COPY\s+(?!--)(\S+)\s+\S+/gm)].map((
    m,
  ) => m[1]);
  const required = await externalSrcDirsImportedByViewers();
  assert(
    required.includes("buy"),
    "expected buy-evidence-viewer to import src/buy (scanner sanity check)",
  );

  const missing = required.filter((dir) =>
    !copied.some((source) => source.replace(/\/$/, "") === `src/${dir}`)
  );
  assertEquals(
    missing,
    [],
    `ui-builder must COPY src/<dir>/ for: ${missing.join(", ")}`,
  );
});
