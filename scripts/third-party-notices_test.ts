/**
 * Executable documentation of scripts/third-party-notices.mjs.
 * Run with: deno task test:scripts
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildEntries,
  collectNodePackages,
  collectUiPackages,
  declaredLicense,
  diffNotices,
  FONTS_FILE,
  forbiddenEntries,
  missingFontNotices,
  NoticesError,
  packageRootOf,
  parseIndex,
  parseMode,
  readLicenseText,
  renderNotices,
  run,
} from "./third-party-notices.mjs";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof NoticesError) return error.code;
    throw error;
  }
  throw new Error("expected a NoticesError");
}

const MIT =
  "MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is hereby granted";

/** Builds a throwaway repository with two viewers and a Node bundle. */
function fixture() {
  const root = Deno.makeTempDirSync();
  const write = (path: string, content: string) => {
    const full = `${root}/${path}`;
    Deno.mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    Deno.writeTextFileSync(full, content);
  };
  const pkg = (
    base: string,
    name: string,
    version: string,
    license: string | null = MIT,
  ) => {
    write(
      `${base}/node_modules/${name}/package.json`,
      JSON.stringify({ name, version, license: "MIT" }),
    );
    if (license !== null) {
      write(`${base}/node_modules/${name}/LICENSE`, license);
    }
  };
  pkg("src/ui", "preact", "10.0.0");
  pkg("src/ui", "@scope/kit", "1.2.3");
  pkg("dist-node", "hono", "4.0.0");
  pkg("dist-node", "preact", "10.0.0");
  write(
    "src/ui/.build-meta/a-viewer.json",
    JSON.stringify({
      version: 1,
      viewer: "a-viewer",
      modules: [
        `${root}/src/ui/node_modules/preact/dist/preact.js`,
        `${root}/src/ui/node_modules/@scope/kit/dist/index.js`,
      ],
    }),
  );
  write(
    "src/ui/.build-meta/b-viewer.json",
    JSON.stringify({
      version: 1,
      viewer: "b-viewer",
      modules: [`${root}/src/ui/node_modules/preact/dist/preact.js`],
    }),
  );
  write(
    "dist-node/esbuild-metafile.json",
    JSON.stringify({
      outputs: {
        "bin/mcp-erpnext.mjs": {
          inputs: {
            "node_modules/hono/dist/index.js": { bytesInOutput: 120 },
            "node_modules/preact/dist/preact.js": { bytesInOutput: 40 },
            "node_modules/tree-shaken/index.js": { bytesInOutput: 0 },
            "src/tools/sales.ts": { bytesInOutput: 900 },
          },
        },
      },
    }),
  );
  write("LICENSE", "MIT License\n\nCopyright (c) 2026 Casys AI\n\nRepo terms");
  write(
    FONTS_FILE,
    "Space Grotesk\nCopyright 2020 The Space Grotesk Project\nOFL text",
  );
  write(
    "src/ui/shared/fonts.css",
    '@font-face { font-family: "Space Grotesk"; src: url(x); }',
  );
  return { root, write };
}

Deno.test("packageRootOf resolves scoped, plain and nested packages", () => {
  assertEquals(
    packageRootOf("/r/node_modules/preact/dist/preact.js"),
    "/r/node_modules/preact",
  );
  assertEquals(
    packageRootOf("/r/node_modules/@scope/kit/dist/index.js"),
    "/r/node_modules/@scope/kit",
  );
  assertEquals(
    packageRootOf("/r/node_modules/a/node_modules/b/index.js"),
    "/r/node_modules/a/node_modules/b",
  );
  assertEquals(
    packageRootOf("C:\\r\\node_modules\\preact\\index.js"),
    "C:/r/node_modules/preact",
  );
});

Deno.test("packageRootOf ignores repository sources and degenerate paths", () => {
  assertEquals(packageRootOf("/r/src/ui/shared/ui.tsx"), null);
  assertEquals(packageRootOf("/r/node_modules/@scope"), null);
  assertEquals(packageRootOf("/r/node_modules/"), null);
});

Deno.test("declaredLicense normalizes string, object and legacy array forms", () => {
  assertEquals(declaredLicense({ license: "ISC" }), "ISC");
  assertEquals(
    declaredLicense({ license: { type: "BSD-3-Clause" } }),
    "BSD-3-Clause",
  );
  assertEquals(
    declaredLicense({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }),
    "MIT OR Apache-2.0",
  );
  assertEquals(declaredLicense({}), "UNKNOWN");
});

Deno.test("collectUiPackages merges viewers per package and fails without a build", () => {
  const { root } = fixture();
  try {
    const roots = collectUiPackages(`${root}/src/ui/.build-meta`);
    assertEquals(roots.size, 2);
    assertEquals(
      [...roots.get(`${root}/src/ui/node_modules/preact`)!].sort(),
      ["a-viewer", "b-viewer"],
    );
    assertEquals(
      codeOf(() => collectUiPackages(`${root}/nowhere`)),
      "META_MISSING",
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("collectUiPackages rejects an unknown report version", () => {
  const { root, write } = fixture();
  try {
    write("bad/x.json", JSON.stringify({ version: 2, modules: [] }));
    assertEquals(
      codeOf(() => collectUiPackages(`${root}/bad`)),
      "META_INVALID",
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("collectNodePackages keeps only inputs that reached the output", () => {
  const { root } = fixture();
  try {
    const roots = collectNodePackages(
      `${root}/dist-node/esbuild-metafile.json`,
      `${root}/dist-node`,
    );
    assertEquals([...roots].sort(), [
      `${root}/dist-node/node_modules/hono`,
      `${root}/dist-node/node_modules/preact`,
    ]);
    assertEquals(
      codeOf(() => collectNodePackages(`${root}/missing.json`, root)),
      "META_MISSING",
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("readLicenseText orders LICENSE before NOTICE and reports absence", () => {
  const { root, write } = fixture();
  try {
    write("p/NOTICE", "Notice body");
    write("p/LICENSE.md", "License body");
    write("p/README.md", "not a license");
    assertEquals(
      readLicenseText(`${root}/p`),
      "[LICENSE.md]\n\nLicense body\n\n[NOTICE]\n\nNotice body",
    );
    write("empty/README.md", "x");
    assertEquals(readLicenseText(`${root}/empty`), null);
    assertEquals(readLicenseText(`${root}/does-not-exist`), null);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("renderNotices is deterministic, groups identical texts and hides paths", () => {
  const { root } = fixture();
  try {
    const ui = collectUiPackages(`${root}/src/ui/.build-meta`);
    const node = collectNodePackages(
      `${root}/dist-node/esbuild-metafile.json`,
      `${root}/dist-node`,
    );
    const entries = buildEntries(ui, node);
    // preact is shared by ui and node but is a single name@version entry.
    assertEquals(
      entries.map((e: { name: string }) => e.name),
      ["@scope/kit", "hono", "preact"],
    );
    const fonts = "Space Grotesk\nOFL";
    const text = renderNotices(entries, fonts);
    assertEquals(text, renderNotices(entries, fonts));
    assertStringIncludes(text, "- preact@10.0.0 (MIT) [node, ui]");
    assertStringIncludes(text, "- hono@4.0.0 (MIT) [node]");
    assertEquals(text.split("Permission is hereby granted").length - 1, 1);
    assert(!text.includes(root));
    assertEquals(text.endsWith("\n"), true);
    assertEquals(
      parseIndex(text),
      new Set(["@scope/kit@1.2.3", "hono@4.0.0", "preact@10.0.0"]),
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("packages without a license file get an explicit fallback notice", () => {
  const { root } = fixture();
  try {
    Deno.removeSync(`${root}/dist-node/node_modules/hono/LICENSE`);
    const entries = buildEntries(
      new Map(),
      new Set([`${root}/dist-node/node_modules/hono`]),
    );
    assertEquals(entries[0].hasLicenseText, false);
    assertStringIncludes(
      renderNotices(entries, "x"),
      "No license file is distributed with this package.",
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("an own package shipping no license file reuses the repository LICENSE", () => {
  const { root, write } = fixture();
  try {
    write(
      "dist-node/node_modules/@mcpview/server/package.json",
      JSON.stringify({
        name: "@mcpview/server",
        version: "0.29.0",
        license: "MIT",
      }),
    );
    const roots = new Set([
      `${root}/dist-node/node_modules/@mcpview/server`,
    ]);
    const entries = buildEntries(new Map(), roots, "Repo terms");
    assertEquals(entries[0].hasLicenseText, true);
    assertStringIncludes(renderNotices(entries, "x"), "Repo terms");
    // Without the fallback (or for any other package) the gap is reported.
    assertEquals(buildEntries(new Map(), roots)[0].hasLicenseText, false);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("forbiddenEntries flags copyleft and non-commercial licenses only", () => {
  const entry = (license: string) => ({ name: "x", version: "1", license });
  const flagged = forbiddenEntries([
    entry("GPL-3.0-only"),
    entry("AGPL-3.0"),
    entry("LGPL-2.1"),
    entry("SSPL-1.0"),
    entry("MIT"),
    entry("MPL-2.0"),
    entry("Apache-2.0"),
    entry("ISC"),
    entry("(MIT OR Apache-2.0)"),
  ]).map((e: { license: string }) => e.license);
  assertEquals(flagged, ["GPL-3.0-only", "AGPL-3.0", "LGPL-2.1", "SSPL-1.0"]);
});

Deno.test("diffNotices reports missing and stale packages", () => {
  const file = (...keys: string[]) =>
    keys.map((k) => `- ${k} (MIT) [ui]`).join("\n");
  assertEquals(diffNotices(file("a@1"), file("a@1")), null);
  assertEquals(diffNotices(file("a@1", "old@1"), file("a@1", "new@2")), {
    missing: ["new@2"],
    stale: ["old@1"],
    textChanged: true,
  });
});

Deno.test("missingFontNotices names families without a notice", () => {
  const css = "@font-face{font-family:\"A B\";} @font-face{font-family: 'C';}";
  assertEquals(missingFontNotices(css, "A B licensed"), ["C"]);
  assertEquals(missingFontNotices(css, "A B and C"), []);
});

Deno.test("parseMode demands exactly one explicit mode", () => {
  assertEquals(parseMode(["--write"]), "write");
  assertEquals(parseMode(["--check"]), "check");
  for (const argv of [[], ["--write", "--check"], ["--dry"]]) {
    assertEquals(codeOf(() => parseMode(argv)), "USAGE");
  }
});

Deno.test("run: --write then --check passes, drift is reported with recovery", () => {
  const { root, write } = fixture();
  try {
    const written = run("write", root);
    assertEquals(written.changed, true);
    assertEquals(written.packages, { total: 3, ui: 2, node: 2 });
    assertEquals(run("write", root).changed, false);
    assertEquals(run("check", root).changed, false);

    // A new package reaches the Node bundle without regenerating the notices.
    write(
      "dist-node/node_modules/jose/package.json",
      JSON.stringify({ name: "jose", version: "6.0.0", license: "MIT" }),
    );
    write("dist-node/node_modules/jose/LICENSE", MIT);
    write(
      "dist-node/esbuild-metafile.json",
      JSON.stringify({
        outputs: {
          "bin/mcp-erpnext.mjs": {
            inputs: {
              "node_modules/hono/dist/index.js": { bytesInOutput: 120 },
              "node_modules/preact/dist/preact.js": { bytesInOutput: 40 },
              "node_modules/jose/dist/index.js": { bytesInOutput: 10 },
            },
          },
        },
      }),
    );
    try {
      run("check", root);
      throw new Error("expected NOTICES_DRIFT");
    } catch (error) {
      assert(error instanceof NoticesError, String(error));
      assertEquals(error.code, "NOTICES_DRIFT");
      assertEquals(error.context.missing, ["jose@6.0.0"]);
      assertStringIncludes(error.recovery, "--write");
      assertEquals(error.exitCode, 1);
    }
    // ... and --write repairs it.
    run("write", root);
    assertEquals(run("check", root).changed, false);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("run: a missing build fails fast with exit code 2", () => {
  const root = Deno.makeTempDirSync();
  try {
    try {
      run("check", root);
      throw new Error("expected META_MISSING");
    } catch (error) {
      assert(error instanceof NoticesError, String(error));
      assertEquals(error.code, "META_MISSING");
      assertEquals(error.exitCode, 2);
      assertStringIncludes(error.recovery, "ui:build");
    }
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("run: rejects a copyleft dependency and an undocumented font", () => {
  const { root, write } = fixture();
  try {
    write(
      "dist-node/node_modules/hono/package.json",
      JSON.stringify({ name: "hono", version: "4.0.0", license: "AGPL-3.0" }),
    );
    assertEquals(codeOf(() => run("write", root)), "FORBIDDEN_LICENSE");
    write(
      "dist-node/node_modules/hono/package.json",
      JSON.stringify({ name: "hono", version: "4.0.0", license: "MIT" }),
    );
    write(
      "src/ui/shared/fonts.css",
      '@font-face{font-family:"Space Grotesk";} @font-face{font-family:"New Font";}',
    );
    assertEquals(codeOf(() => run("check", root)), "FONT_NOTICE_MISSING");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});
