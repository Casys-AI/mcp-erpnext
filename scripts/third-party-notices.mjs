#!/usr/bin/env node
/**
 * Generates (and verifies) THIRD_PARTY_NOTICES.txt from what the release
 * artifacts REALLY embed — not from lockfiles, which over-approximate.
 *
 * Sources of truth (both written by the build, gitignored, never published):
 *   - UI viewers: src/ui/.build-meta/<viewer>.json, emitted by the Vite plugin
 *     in src/ui/vite.single.config.mjs (rollup chunk modules that survived
 *     tree-shaking; aliased packages such as react -> preact are excluded).
 *   - Node bundle: dist-node/esbuild-metafile.json, emitted by
 *     scripts/build-node.sh (esbuild inputs with bytesInOutput > 0).
 * Each embedded file is mapped to its npm package; the license text comes from
 * the LICENSE / NOTICE / COPYING files shipped in that package.
 *
 * Manual part: the three embedded webfonts are not npm packages. Their OFL
 * texts live in scripts/third-party-notices.fonts.txt and are appended as-is
 * (the check verifies every family declared in src/ui/shared/fonts.css is named
 * there).
 *
 * Usage (exactly one mode, no default):
 *   deno task ui:build && bash scripts/build-node.sh
 *   node scripts/third-party-notices.mjs --write   regenerate the file
 *   node scripts/third-party-notices.mjs --check   fail if the file drifted
 *
 * stdout is ONE JSON document. Exit codes: 0 ok, 1 rejected (drift, forbidden
 * license, missing font notice), 2 usage / missing or invalid build metadata.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT_FILE = "THIRD_PARTY_NOTICES.txt";
export const FONTS_FILE = "scripts/third-party-notices.fonts.txt";
export const FONTS_CSS = "src/ui/shared/fonts.css";
export const UI_META_DIR = "src/ui/.build-meta";
export const NODE_META_FILE = "dist-node/esbuild-metafile.json";

const RECOVERY_BUILD =
  "Run `deno task ui:build && bash scripts/build-node.sh` from the repository root, then retry.";

/** Copyleft-ish licenses that must never ship inside the bundles. */
const FORBIDDEN_LICENSE =
  /(^|[^A-Za-z])(A|L)?GPL|SSPL|BUSL|CC-BY-NC|Commons-Clause/i;

const MAX_LICENSE_BYTES = 200_000;

/**
 * Packages of the same maintainer (Casys AI, MIT — same holder as this
 * repository's LICENSE) whose npm tarball ships no license file. Their notice
 * reuses the repository LICENSE text; every other package without a license
 * file falls back to its package.json metadata and is reported by the run.
 */
export const OWN_PACKAGES_WITHOUT_LICENSE_FILE = ["@casys/mcp-server"];

/** Structured failure: code + context + recovery (AX machine-readable error). */
export class NoticesError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, any>} [context]
   * @param {string} [recovery]
   * @param {number} [exitCode] 1 = rejected, 2 = usage / environment
   */
  constructor(code, message, context = {}, recovery = "", exitCode = 1) {
    super(message);
    this.name = "NoticesError";
    this.code = code;
    this.context = context;
    this.recovery = recovery;
    this.exitCode = exitCode;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      recovery: this.recovery,
    };
  }
}

const normalizePath = (path) => path.replaceAll("\\", "/");

/**
 * Maps a file path to the root directory of the npm package that owns it
 * (last `node_modules/` segment wins, so nested installs resolve correctly).
 * @returns {string | null} `null` when the file is not under node_modules
 */
export function packageRootOf(filePath) {
  const path = normalizePath(filePath);
  const marker = "/node_modules/";
  const index = path.lastIndexOf(marker);
  if (index === -1) return null;
  const segments = path.slice(index + marker.length).split("/");
  const length = segments[0].startsWith("@") ? 2 : 1;
  if (segments.length < length || segments.slice(0, length).some((s) => !s)) {
    return null;
  }
  return path.slice(0, index + marker.length) +
    segments.slice(0, length).join("/");
}

/**
 * Package roots embedded in the UI viewers.
 * @param {string} metaDir directory of `<viewer>.json` reports
 * @returns {Map<string, Set<string>>} package root -> viewers using it
 */
export function collectUiPackages(metaDir) {
  let files;
  try {
    files = readdirSync(metaDir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    throw new NoticesError(
      "META_MISSING",
      `No UI build report found in ${metaDir}`,
      { metaDir },
      RECOVERY_BUILD,
      2,
    );
  }
  const roots = new Map();
  for (const file of files) {
    const report = readJson(resolve(metaDir, file), "META_INVALID");
    if (report?.version !== 1 || !Array.isArray(report.modules)) {
      throw new NoticesError(
        "META_INVALID",
        `${file} is not a version 1 UI build report`,
        { file },
        RECOVERY_BUILD,
        2,
      );
    }
    for (const module of report.modules) {
      const root = packageRootOf(module);
      if (!root) continue;
      if (!roots.has(root)) roots.set(root, new Set());
      roots.get(root).add(report.viewer ?? file.replace(/\.json$/, ""));
    }
  }
  return roots;
}

/**
 * Package roots embedded in the Node bundle (esbuild metafile).
 * @param {string} metafilePath
 * @param {string} baseDir directory esbuild ran in (metafile paths are relative to it)
 * @returns {Set<string>}
 */
export function collectNodePackages(metafilePath, baseDir) {
  const meta = readJson(metafilePath, "META_MISSING");
  if (!meta || typeof meta.outputs !== "object" || meta.outputs === null) {
    throw new NoticesError(
      "META_INVALID",
      `${metafilePath} is not an esbuild metafile`,
      { metafilePath },
      RECOVERY_BUILD,
      2,
    );
  }
  const roots = new Set();
  for (const output of Object.values(meta.outputs)) {
    for (const [input, info] of Object.entries(output.inputs ?? {})) {
      if (!(info.bytesInOutput > 0)) continue;
      const root = packageRootOf(resolve(baseDir, input));
      if (root) roots.add(root);
    }
  }
  return roots;
}

function readJson(path, missingCode) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new NoticesError(
      missingCode,
      `Cannot read ${path}`,
      { path },
      RECOVERY_BUILD,
      2,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new NoticesError(
      "META_INVALID",
      `${path} is not valid JSON`,
      { path },
      RECOVERY_BUILD,
      2,
    );
  }
}

/** Normalizes the many shapes of package.json `license` into one string. */
export function declaredLicense(pkg) {
  const one = (value) => typeof value === "string" ? value : value?.type;
  if (pkg.license !== undefined) return one(pkg.license) ?? "UNKNOWN";
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map(one).filter(Boolean).join(" OR ") || "UNKNOWN";
  }
  return "UNKNOWN";
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-._].*)?$/i;

/**
 * Concatenates the LICENSE / NOTICE files shipped in a package directory.
 * @returns {string | null} `null` when the package ships none
 */
export function readLicenseText(root) {
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return null;
  }
  const files = names
    .filter((name) => LICENSE_FILE.test(name))
    .filter((name) => {
      const stat = statSync(resolve(root, name));
      return stat.isFile() && stat.size <= MAX_LICENSE_BYTES;
    })
    // LICENSE first, then COPYING, NOTICE, ... deterministic.
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  if (files.length === 0) return null;
  const texts = files.map((name) =>
    normalizeText(readFileSync(resolve(root, name), "utf8"))
  );
  if (files.length === 1) return texts[0];
  return files.map((name, i) => `[${name}]\n\n${texts[i]}`).join("\n\n");
}

function rank(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("licen")) return 0;
  if (lower.startsWith("copying")) return 1;
  if (lower.startsWith("unlicense")) return 2;
  return 3; // NOTICE
}

const normalizeText = (text) =>
  text.replaceAll("\r\n", "\n").split("\n").map((l) => l.trimEnd()).join("\n")
    .trim();

/**
 * Resolves package roots into notice entries (deduplicated by name@version).
 * @param {Map<string, Set<string>>} ui roots -> viewers
 * @param {Set<string>} node roots
 * @param {string | null} [repositoryLicense] text used for
 *   {@link OWN_PACKAGES_WITHOUT_LICENSE_FILE} when the package ships none
 */
export function buildEntries(ui, node, repositoryLicense = null) {
  const byKey = new Map();
  const add = (root, source) => {
    const pkg = readJson(resolve(root, "package.json"), "PACKAGE_UNREADABLE");
    if (typeof pkg.name !== "string" || typeof pkg.version !== "string") {
      throw new NoticesError(
        "PACKAGE_UNREADABLE",
        `${root}/package.json has no name or version`,
        { root },
        "Reinstall dependencies (`npm ci`) and rebuild.",
        2,
      );
    }
    const key = `${pkg.name}@${pkg.version}`;
    if (!byKey.has(key)) {
      let licenseText = readLicenseText(root);
      if (
        licenseText === null && repositoryLicense !== null &&
        OWN_PACKAGES_WITHOUT_LICENSE_FILE.includes(pkg.name)
      ) {
        licenseText = repositoryLicense;
      }
      byKey.set(key, {
        name: pkg.name,
        version: pkg.version,
        license: declaredLicense(pkg),
        licenseText,
        hasLicenseText: licenseText !== null,
        author: authorOf(pkg),
        repository: repositoryOf(pkg),
        sources: new Set(),
      });
    }
    byKey.get(key).sources.add(source);
  };
  for (const root of [...ui.keys()].sort()) add(root, "ui");
  for (const root of [...node].sort()) add(root, "node");
  return [...byKey.values()].sort(compareEntries);
}

function compareEntries(a, b) {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
}

function authorOf(pkg) {
  const author = pkg.author;
  if (typeof author === "string") return author;
  return author?.name ?? "";
}

function repositoryOf(pkg) {
  const repo = typeof pkg.repository === "string"
    ? pkg.repository
    : pkg.repository?.url;
  return (repo ?? pkg.homepage ?? "").replace(/^git\+/, "");
}

/** Entries whose declared license must not ship (copyleft / non-commercial). */
export function forbiddenEntries(entries) {
  return entries.filter((e) => FORBIDDEN_LICENSE.test(e.license));
}

function fallbackText(entry) {
  const lines = [
    "No license file is distributed with this package.",
    `Declared license (package.json): ${entry.license}`,
  ];
  if (entry.author) lines.push(`Author: ${entry.author}`);
  if (entry.repository) lines.push(`Repository: ${entry.repository}`);
  return lines.join("\n");
}

const RULE = "=".repeat(78);

/**
 * Renders THIRD_PARTY_NOTICES.txt. Pure and deterministic: the same entries
 * and fonts text always produce the same bytes (no path, no date).
 * @param {ReturnType<typeof buildEntries>} entries
 * @param {string} fontsText
 */
export function renderNotices(entries, fontsText) {
  const where = (e) => [...e.sources].sort().join(", ");
  const groups = new Map();
  for (const entry of entries) {
    const text = entry.licenseText ?? fallbackText(entry);
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(entry);
  }
  const orderedGroups = [...groups.entries()].sort(
    ([, a], [, b]) => compareEntries(a[0], b[0]),
  );

  const out = [];
  out.push(
    "Third-party notices for @casys/mcp-erpnext",
    RULE,
    "",
    "This package embeds the third-party software listed below: the interactive",
    "viewers (ui) and the bundled Node.js server (node). Each license text is",
    "reproduced as shipped by the package's authors.",
    "",
    "Generated by scripts/third-party-notices.mjs from the build metadata of the",
    "viewers and of the Node bundle. Do not edit by hand; regenerate with:",
    "  deno task ui:build && bash scripts/build-node.sh",
    "  node scripts/third-party-notices.mjs --write",
    "",
    "The embedded webfonts are maintained by hand (section 3).",
    "",
    `1. Package index (${entries.length} packages)`,
    "-".repeat(78),
    "",
  );
  for (const e of entries) {
    out.push(`- ${e.name}@${e.version} (${e.license}) [${where(e)}]`);
  }
  out.push("", "", "2. License texts", "-".repeat(78), "");
  for (const [text, group] of orderedGroups) {
    const licenses = [...new Set(group.map((e) => e.license))].sort().join(
      " / ",
    );
    out.push(RULE, licenses, "Applies to:");
    for (const e of group) out.push(`  ${e.name}@${e.version}`);
    out.push("", text, "", "");
  }
  out.push(
    "3. Embedded fonts",
    "-".repeat(78),
    "",
    normalizeText(fontsText),
    "",
  );
  return out.join("\n");
}

/** Package keys listed in the index of a rendered notices file. */
export function parseIndex(text) {
  const keys = new Set();
  const re = /^- (\S+@\S+) \(/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) keys.add(m[1]);
  return keys;
}

/**
 * Compares a committed notices file with the freshly generated one.
 * @returns {null | {missing:string[], stale:string[], textChanged:boolean}}
 */
export function diffNotices(committed, generated) {
  if (committed === generated) return null;
  const have = parseIndex(committed);
  const want = parseIndex(generated);
  return {
    missing: [...want].filter((k) => !have.has(k)).sort(),
    stale: [...have].filter((k) => !want.has(k)).sort(),
    textChanged: true,
  };
}

/** Font families declared in shared/fonts.css that the fonts notice omits. */
export function missingFontNotices(fontsCss, fontsText) {
  const families = new Set();
  const re = /font-family:\s*["']?([^"';]+?)["']?\s*;/g;
  for (let m = re.exec(fontsCss); m; m = re.exec(fontsCss)) {
    families.add(m[1].trim());
  }
  return [...families].filter((family) => !fontsText.includes(family)).sort();
}

/**
 * Full run. Returns the JSON report; throws NoticesError on rejection.
 * @param {"write"|"check"} mode
 * @param {string} root repository root
 */
export function run(mode, root) {
  const ui = collectUiPackages(resolve(root, UI_META_DIR));
  const nodeBase = resolve(root, dirname(NODE_META_FILE));
  const node = collectNodePackages(resolve(root, NODE_META_FILE), nodeBase);
  const repositoryLicense = normalizeText(
    readFileSync(resolve(root, "LICENSE"), "utf8"),
  );
  const entries = buildEntries(ui, node, repositoryLicense);

  const forbidden = forbiddenEntries(entries);
  if (forbidden.length > 0) {
    throw new NoticesError(
      "FORBIDDEN_LICENSE",
      "A copyleft or non-commercial license is embedded in the bundles",
      {
        packages: forbidden.map((e) => `${e.name}@${e.version} (${e.license})`),
      },
      "Remove or replace the dependency before releasing.",
    );
  }

  const fontsText = readFileSync(resolve(root, FONTS_FILE), "utf8");
  const missingFonts = missingFontNotices(
    readFileSync(resolve(root, FONTS_CSS), "utf8"),
    fontsText,
  );
  if (missingFonts.length > 0) {
    throw new NoticesError(
      "FONT_NOTICE_MISSING",
      "A font embedded in src/ui/shared/fonts.css has no notice",
      { families: missingFonts, file: FONTS_FILE },
      `Add the family's copyright line and OFL text to ${FONTS_FILE}, then run --write.`,
    );
  }

  const generated = renderNotices(entries, fontsText);
  const outputPath = resolve(root, OUTPUT_FILE);
  const report = {
    mode,
    output: OUTPUT_FILE,
    packages: {
      total: entries.length,
      ui: entries.filter((e) => e.sources.has("ui")).length,
      node: entries.filter((e) => e.sources.has("node")).length,
    },
    without_license_text: entries
      .filter((e) => !e.hasLicenseText)
      .map((e) => `${e.name}@${e.version} (${e.license})`),
  };

  if (mode === "write") {
    let current = null;
    try {
      current = readFileSync(outputPath, "utf8");
    } catch { /* first generation */ }
    if (current !== generated) writeFileSync(outputPath, generated);
    return { ...report, changed: current !== generated };
  }

  let committed;
  try {
    committed = readFileSync(outputPath, "utf8");
  } catch {
    committed = "";
  }
  const drift = diffNotices(committed, generated);
  if (drift) {
    throw new NoticesError(
      "NOTICES_DRIFT",
      `${OUTPUT_FILE} does not match what the bundles embed`,
      { ...drift, ...report },
      "Run `node scripts/third-party-notices.mjs --write` (after `deno task ui:build && bash scripts/build-node.sh`) and commit the result.",
    );
  }
  return { ...report, changed: false };
}

export function parseMode(argv) {
  const modes = argv.filter((a) => a === "--write" || a === "--check");
  if (argv.length !== 1 || modes.length !== 1) {
    throw new NoticesError(
      "USAGE",
      "Exactly one of --write or --check is required",
      { argv },
      "node scripts/third-party-notices.mjs --write | --check",
      2,
    );
  }
  return modes[0] === "--write" ? "write" : "check";
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const report = run(parseMode(process.argv.slice(2)), root);
    console.log(JSON.stringify({ ok: true, ...report }));
  } catch (error) {
    const failure = error instanceof NoticesError ? error : new NoticesError(
      "INTERNAL",
      String(error?.message ?? error),
      {},
      "Report a bug in scripts/third-party-notices.mjs.",
      2,
    );
    console.log(JSON.stringify({ ok: false, error: failure.toJSON() }));
    process.exit(failure.exitCode);
  }
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
