/**
 * Executable documentation of scripts/third-party-notices.mjs.
 * Run with: deno task test:scripts
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildEntries,
  collectJsrPackages,
  collectNodePackages,
  collectUiPackages,
  declaredLicense,
  DENO_MIT_LICENSE,
  diffNotices,
  FONTS_FILE,
  forbiddenEntries,
  JSR_SCOPE_LICENSES,
  jsrPackageOf,
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

// --- JSR packages vendored inside npm dependencies (deps/jsr.io) -------------

const VENDOR = "esm/deps/jsr.io";

/** An esbuild metafile whose inputs are `{ path: bytesInOutput }`. */
function metafileOf(inputs: Record<string, number>): string {
  return JSON.stringify({
    outputs: {
      "bin/mcp-erpnext.mjs": {
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([path, bytesInOutput]) => [path, {
            bytesInOutput,
          }]),
        ),
      },
    },
  });
}

/** Adds a dnt-style npm carrier (package.json + its own LICENSE) to dist-node. */
function carrier(
  write: (path: string, content: string) => void,
  name: string,
  version = "0.29.0",
) {
  const dir = `dist-node/node_modules/${name}`;
  write(
    `${dir}/package.json`,
    JSON.stringify({ name, version, license: "MIT" }),
  );
  write(`${dir}/LICENSE`, "Carrier terms (Casys AI)");
}

Deno.test("jsrPackageOf resolves the vendored JSR package and its npm carrier", () => {
  assertEquals(
    jsrPackageOf(
      `/r/node_modules/@mcpview/server/${VENDOR}/@std/yaml/1.3.0/_type/int.js`,
    ),
    {
      scope: "@std",
      name: "@std/yaml",
      version: "1.3.0",
      root: `/r/node_modules/@mcpview/server/${VENDOR}/@std/yaml/1.3.0`,
      carrier: "/r/node_modules/@mcpview/server",
    },
  );
  const windows = jsrPackageOf(
    `C:\\r\\node_modules\\pkg\\${
      VENDOR.replaceAll("/", "\\")
    }\\@std\\path\\1.0.0-rc.1\\mod.js`,
  );
  assertEquals(windows?.name, "@std/path");
  assertEquals(windows?.version, "1.0.0-rc.1");
  assertEquals(windows?.carrier, "C:/r/node_modules/pkg");
  // Outside node_modules the package is still detected, without a carrier.
  assertEquals(
    jsrPackageOf(`/r/${VENDOR}/@std/yaml/1.3.0/a.js`)?.carrier,
    null,
  );
});

Deno.test("jsrPackageOf ignores npm files and paths that are not a vendored version dir", () => {
  for (
    const path of [
      "/r/node_modules/preact/dist/preact.js",
      "/r/src/deps/jsr.io.ts",
      `/r/${VENDOR}/@std/yaml/1.3.0`, // the directory itself, no file
      `/r/${VENDOR}/@std/yaml/mod.js`, // no version segment
      `/r/${VENDOR}/@std/yaml/latest/mod.js`, // not a version
      `/r/${VENDOR}/std/yaml/1.3.0/mod.js`, // not a scope
      `/r/${VENDOR}/@/yaml/1.3.0/mod.js`,
    ]
  ) {
    assertEquals(jsrPackageOf(path), null, path);
  }
});

Deno.test("collectJsrPackages keeps embedded inputs and deduplicates per vendored version", () => {
  const { root, write } = fixture();
  try {
    const at = (carrierName: string, pkg: string, file: string) =>
      `node_modules/${carrierName}/${VENDOR}/${pkg}/${file}`;
    write(
      "dist-node/esbuild-metafile.json",
      metafileOf({
        [at("@mcpview/server", "@std/yaml/1.3.0", "parse.js")]: 591,
        [at("@mcpview/server", "@std/yaml/1.3.0", "_type/int.js")]: 3662,
        [at("@mcpview/server", "@std/yaml/1.3.0", "mod.js")]: 0,
        // Same package in a second carrier: its own vendored sub-tree.
        [at("other", "@std/yaml/1.3.0", "parse.js")]: 10,
        // Another version of the same package.
        [at("other", "@std/yaml/1.2.5", "parse.js")]: 10,
        // Fully tree-shaken: not embedded.
        [at("other", "@std/path/1.0.0", "join.js")]: 0,
        "node_modules/hono/dist/index.js": 120,
      }),
    );
    const packages = collectJsrPackages(
      `${root}/dist-node/esbuild-metafile.json`,
      `${root}/dist-node`,
    );
    assertEquals(
      [...packages.values()].map((p) => `${p.name}@${p.version}`).sort(),
      ["@std/yaml@1.2.5", "@std/yaml@1.3.0", "@std/yaml@1.3.0"],
    );
    assertEquals(packages.size, 3);
    assertEquals(
      codeOf(() => collectJsrPackages(`${root}/missing.json`, root)),
      "META_MISSING",
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("a vendored @std package gets the fixed MIT text, never the carrier LICENSE", () => {
  const { root, write } = fixture();
  try {
    carrier(write, "@mcpview/server");
    write(
      "dist-node/esbuild-metafile.json",
      metafileOf({
        [`node_modules/@mcpview/server/${VENDOR}/@std/yaml/1.3.0/parse.js`]:
          591,
      }),
    );
    const meta = `${root}/dist-node/esbuild-metafile.json`;
    const base = `${root}/dist-node`;
    const entries = buildEntries(
      new Map(),
      collectNodePackages(meta, base),
      null,
      collectJsrPackages(meta, base),
    );
    assertEquals(
      entries.map((e: { name: string }) => e.name),
      ["@mcpview/server", "@std/yaml"],
    );
    const yaml = entries[1];
    assertEquals(yaml.license, "MIT");
    assertEquals(yaml.licenseText, DENO_MIT_LICENSE);
    assertEquals(yaml.jsr, {
      licenseSource: "scope-table",
      vendoredIn: "@mcpview/server@0.29.0",
    });
    assertEquals(entries[0].jsr, undefined);
    assertStringIncludes(
      yaml.licenseText,
      "Copyright 2018-2026 the Deno authors",
    );
    assertEquals(
      JSR_SCOPE_LICENSES.get("@std")?.text,
      DENO_MIT_LICENSE,
    );

    const text = renderNotices(entries, "x");
    assertStringIncludes(text, "- @std/yaml@1.3.0 (MIT) [node]");
    assertStringIncludes(text, "Copyright 2018-2026 the Deno authors");
    // The carrier keeps its own text; nothing leaks from one to the other.
    assertEquals(text.split("Carrier terms (Casys AI)").length - 1, 1);
    assert(!text.includes(root));
    assertEquals(
      parseIndex(text),
      new Set(["@mcpview/server@0.29.0", "@std/yaml@1.3.0"]),
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("a LICENSE file inside the vendored sub-tree wins over the scope table", () => {
  const { root, write } = fixture();
  try {
    const dir = `dist-node/node_modules/pkg/${VENDOR}/@std/yaml/1.3.0`;
    write(`${dir}/LICENSE`, "Vendored terms");
    write(
      "dist-node/node_modules/pkg/package.json",
      JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT" }),
    );
    const jsr = collectJsrPackages(
      (write(
        "dist-node/m.json",
        metafileOf({
          [`node_modules/pkg/${VENDOR}/@std/yaml/1.3.0/parse.js`]: 5,
        }),
      ),
        `${root}/dist-node/m.json`),
      `${root}/dist-node`,
    );
    const [entry] = buildEntries(new Map(), new Set(), null, jsr);
    assertEquals(entry.licenseText, "Vendored terms");
    assertEquals(entry.jsr.licenseSource, "vendored-file");
    assertEquals(entry.license, "MIT");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("a vendored package outside @std without a license file fails with a structured error", () => {
  const { root, write } = fixture();
  try {
    carrier(write, "pkg", "1.0.0");
    write(
      "dist-node/esbuild-metafile.json",
      metafileOf({
        [`node_modules/pkg/${VENDOR}/@acme/lib/2.0.0/mod.js`]: 5,
        [`node_modules/pkg/${VENDOR}/@std/yaml/1.3.0/parse.js`]: 5,
      }),
    );
    const meta = `${root}/dist-node/esbuild-metafile.json`;
    const jsr = collectJsrPackages(meta, `${root}/dist-node`);
    try {
      buildEntries(new Map(), new Set(), null, jsr);
      throw new Error("expected JSR_LICENSE_MISSING");
    } catch (error) {
      assert(error instanceof NoticesError, String(error));
      assertEquals(error.code, "JSR_LICENSE_MISSING");
      assertEquals(error.exitCode, 1);
      assertEquals(error.context, {
        package: "@acme/lib@2.0.0",
        scope: "@acme",
        vendoredIn: "pkg@1.0.0",
        path: `${VENDOR}/@acme/lib/2.0.0`,
        knownScopes: ["@std"],
      });
      assertStringIncludes(error.recovery, "JSR_SCOPE_LICENSES");
      assertStringIncludes(error.recovery, "@acme");
      assertEquals(Object.keys(error.toJSON()).sort(), [
        "code",
        "context",
        "message",
        "recovery",
      ]);
    }
    // The same package is accepted as soon as it ships its own license text.
    write(`dist-node/node_modules/pkg/${VENDOR}/@acme/lib/2.0.0/LICENSE`, MIT);
    const entries = buildEntries(new Map(), new Set(), null, jsr);
    const acme = entries.find((e: { name: string }) => e.name === "@acme/lib");
    assertEquals(acme.license, "UNKNOWN");
    assertEquals(acme.licenseText, MIT);
    assertEquals(acme.repository, "https://jsr.io/@acme/lib");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("a copyleft license file vendored with a JSR package is rejected", () => {
  const { root, write } = fixture();
  try {
    write(
      `dist-node/node_modules/pkg/${VENDOR}/@acme/lib/2.0.0/LICENSE`,
      "GNU GENERAL PUBLIC LICENSE\nVersion 3",
    );
    write(
      "dist-node/esbuild-metafile.json",
      metafileOf({
        [`node_modules/pkg/${VENDOR}/@acme/lib/2.0.0/mod.js`]: 5,
      }),
    );
    write(
      "dist-node/node_modules/pkg/package.json",
      JSON.stringify({ name: "pkg", version: "1.0.0", license: "MIT" }),
    );
    assertEquals(codeOf(() => run("write", root)), "FORBIDDEN_LICENSE");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("multiple versions list one entry each and a shared version a single one", () => {
  const { root, write } = fixture();
  try {
    carrier(write, "a");
    carrier(write, "b", "2.0.0");
    const yaml = (carrierName: string, version: string) =>
      `node_modules/${carrierName}/${VENDOR}/@std/yaml/${version}/parse.js`;
    write(
      "dist-node/esbuild-metafile.json",
      metafileOf({
        [yaml("a", "1.3.0")]: 5,
        [yaml("b", "1.3.0")]: 5,
        [yaml("b", "1.2.5")]: 5,
      }),
    );
    const meta = `${root}/dist-node/esbuild-metafile.json`;
    const base = `${root}/dist-node`;
    const entries = buildEntries(
      new Map(),
      collectNodePackages(meta, base),
      null,
      collectJsrPackages(meta, base),
    );
    assertEquals(
      entries.map((e: { name: string; version: string }) =>
        `${e.name}@${e.version}`
      ),
      ["@std/yaml@1.2.5", "@std/yaml@1.3.0", "a@0.29.0", "b@2.0.0"],
    );
    // One MIT group, listing both versions, and the text appears once.
    const text = renderNotices(entries, "x");
    assertEquals(
      text.split("Copyright 2018-2026 the Deno authors").length - 1,
      1,
    );
    assertStringIncludes(text, "  @std/yaml@1.2.5\n  @std/yaml@1.3.0\n");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("run: vendored JSR packages are reported, then drift when a new one appears", () => {
  const { root, write } = fixture();
  try {
    carrier(write, "@mcpview/server");
    const inputs = {
      "node_modules/hono/dist/index.js": 120,
      "node_modules/preact/dist/preact.js": 40,
      [`node_modules/@mcpview/server/${VENDOR}/@std/yaml/1.3.0/parse.js`]: 591,
    };
    write("dist-node/esbuild-metafile.json", metafileOf(inputs));
    const written = run("write", root);
    assertEquals(written.packages, { total: 5, ui: 2, node: 4 });
    assertEquals(written.jsr_packages, [{
      package: "@std/yaml@1.3.0",
      license: "MIT",
      license_source: "scope-table",
      vendored_in: "@mcpview/server@0.29.0",
    }]);
    assertEquals(run("check", root).changed, false);

    write(
      "dist-node/esbuild-metafile.json",
      metafileOf({
        ...inputs,
        [`node_modules/@mcpview/server/${VENDOR}/@std/path/1.0.0/join.js`]: 9,
      }),
    );
    try {
      run("check", root);
      throw new Error("expected NOTICES_DRIFT");
    } catch (error) {
      assert(error instanceof NoticesError, String(error));
      assertEquals(error.code, "NOTICES_DRIFT");
      assertEquals(error.context.missing, ["@std/path@1.0.0"]);
    }
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});
