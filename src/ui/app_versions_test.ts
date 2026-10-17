/**
 * Invariant: every declared App version is a STABLE semver (x.y.z).
 *
 * Each viewer App owns its own version cycle (bump only when its contract
 * changes); it is deliberately NOT tied to the package version. What must never
 * ship, in any release, is a prerelease tag such as `3.1.0-beta.11` frozen in an
 * App identity: the Buy manifest is an external contract consumed by exact
 * version.
 */
import { assert, assertEquals } from "@std/assert";
import { BUY_VIEW_APP_VERSION } from "../buy/identities.ts";
import { BUY_VIEW_APP_MANIFEST } from "../buy/manifest.ts";

const STABLE_SEMVER = /^\d+\.\d+\.\d+$/;

async function declaredViewerAppVersions(): Promise<
  Array<{ viewer: string; version: string }>
> {
  const found: Array<{ viewer: string; version: string }> = [];
  const root = new URL("./", import.meta.url);
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory || !entry.name.endsWith("-viewer")) continue;
    const srcDir = new URL(`${entry.name}/src/`, root);
    let files: Deno.DirEntry[];
    try {
      files = await Array.fromAsync(Deno.readDir(srcDir));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.isFile || !file.name.endsWith(".tsx")) continue;
      const source = await Deno.readTextFile(new URL(file.name, srcDir));
      const match = source.match(
        /new App\(\{[^}]*?version:\s*"([^"]+)"/s,
      );
      if (match) found.push({ viewer: entry.name, version: match[1] });
    }
  }
  return found.sort((a, b) => a.viewer.localeCompare(b.viewer));
}

Deno.test("every viewer App declares a stable semver version", async () => {
  const declared = await declaredViewerAppVersions();
  // 8 generic viewers declare an App in a .tsx; the Buy viewer is checked below.
  assert(
    declared.length >= 8,
    `expected >= 8 viewer App declarations, found ${declared.length}`,
  );
  for (const { viewer, version } of declared) {
    assert(
      STABLE_SEMVER.test(version),
      `${viewer}: App version "${version}" must match ${STABLE_SEMVER}`,
    );
  }
});

Deno.test("Buy evidence App version is a stable semver, manifest included", () => {
  assert(
    STABLE_SEMVER.test(BUY_VIEW_APP_VERSION),
    `BUY_VIEW_APP_VERSION "${BUY_VIEW_APP_VERSION}" must match ${STABLE_SEMVER}`,
  );
  assertEquals(BUY_VIEW_APP_MANIFEST.app.version, BUY_VIEW_APP_VERSION);
});
