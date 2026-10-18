#!/usr/bin/env node
/**
 * Alignement du dist-tag npm `next` après la publication d'une version stable
 * — appelé par .github/workflows/publish.yml.
 *
 * Une version stable remplace les prereleases de sa propre ligne : `next` ne
 * doit pas rester sur une bêta plus ancienne. Une prerelease d'une ligne plus
 * récente (3.3.0-beta.1 pendant que 3.2.1 sort) n'est jamais rétrogradée.
 *
 * Trois cas, selon la lecture des dist-tags (`npm view ... dist-tags --json`) :
 *   - la lecture échoue ou rend un JSON inattendu : `keep` / READ_FAILED. Rien
 *     n'est écrit : on ne peut pas savoir où pointe `next`.
 *   - le JSON n'a pas de `next`                    : `align` / NEXT_ABSENT.
 *   - `next` existe : `align` / NEXT_NOT_NEWER_LINE si sa ligne
 *     (major.minor.patch, suffixe de prerelease ignoré) est inférieure ou
 *     égale à la version publiée, sinon `keep` / NEXT_NEWER_LINE. Un `next`
 *     qui n'est pas un semver est laissé en l'état : `keep` / NEXT_INVALID.
 *
 * CLI : stdout est UN document JSON `{action, reason, version, next, ...}`.
 * Code 0 dès qu'une décision est rendue, y compris `keep` / READ_FAILED : un
 * registre muet ne doit pas faire échouer une publication déjà faite. Code 2
 * pour une erreur d'usage ou une version invalide.
 *   node scripts/align-next-dist-tag.mjs --version 3.2.1 \
 *        [--package @casys/mcp-erpnext] [--dist-tags-json <fichier>]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GuardError, parseSemver } from "./release-guard.mjs";

const DEFAULT_PACKAGE = "@casys/mcp-erpnext";

/**
 * @typedef {object} NextAlignment
 * @property {"align"|"keep"} action
 * @property {"READ_FAILED"|"NEXT_ABSENT"|"NEXT_NOT_NEWER_LINE"|"NEXT_NEWER_LINE"|"NEXT_INVALID"} reason
 * @property {string} version version stable qui vient d'être publiée
 * @property {string|null} next valeur lue de `next`, `null` si absente ou illisible
 * @property {string} [detail] précision lisible (erreur de lecture, valeur rejetée)
 */

/** Ligne d'une version : [major, minor, patch], prerelease ignorée. */
function lineOf(version) {
  const { major, minor, patch } = parseSemver(version);
  return [major, minor, patch];
}

/** Négatif, nul ou positif selon que la ligne de `a` précède, égale ou suit celle de `b`. */
function compareLines(a, b) {
  const [left, right] = [lineOf(a), lineOf(b)];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/**
 * Décide s'il faut aligner `next` sur `version`. Pure : l'état du registre est
 * un argument, `readError` (échec de lecture) prime sur `distTagsJson`.
 *
 * @param {{version: string, distTagsJson?: string, readError?: string}} input
 * @returns {NextAlignment}
 */
export function decideNextAlignment({ version, distTagsJson, readError }) {
  parseSemver(version); // version invalide : erreur d'usage, pas une décision

  /** @returns {NextAlignment} */
  const keepUnread = (/** @type {string} */ detail) => ({
    action: "keep",
    reason: "READ_FAILED",
    version,
    next: null,
    detail,
  });

  if (readError !== undefined) return keepUnread(String(readError));

  /** @type {unknown} */
  let distTags;
  try {
    distTags = JSON.parse(String(distTagsJson));
  } catch {
    return keepUnread(
      `unreadable dist-tags output: ${String(distTagsJson).slice(0, 200)}`,
    );
  }
  if (
    distTags === null || typeof distTags !== "object" ||
    Array.isArray(distTags)
  ) {
    return keepUnread(
      `unexpected dist-tags output: ${String(distTagsJson).slice(0, 200)}`,
    );
  }

  const tags = /** @type {Record<string, unknown>} */ (distTags);
  if (!("next" in tags)) {
    return { action: "align", reason: "NEXT_ABSENT", version, next: null };
  }

  const next = tags.next;
  let comparison = null;
  try {
    if (typeof next === "string") comparison = compareLines(next, version);
  } catch { /* semver illisible : comparison reste null */ }
  if (comparison === null) {
    return {
      action: "keep",
      reason: "NEXT_INVALID",
      version,
      next: typeof next === "string" ? next : null,
      detail: `next is not a semver version: ${JSON.stringify(next)}`,
    };
  }
  return comparison <= 0
    ? {
      action: "align",
      reason: "NEXT_NOT_NEWER_LINE",
      version,
      next: String(next),
    }
    : {
      action: "keep",
      reason: "NEXT_NEWER_LINE",
      version,
      next: String(next),
    };
}

/**
 * Lit les dist-tags du paquet sur le registre npm. Ne lève jamais : un échec
 * devient `readError`, que {@link decideNextAlignment} traduit en `keep`.
 *
 * @param {string} packageName
 * @param {(...args: any[]) => unknown} [run]
 * @returns {{distTagsJson?: string, readError?: string}}
 */
export function readDistTags(packageName, run = execFileSync) {
  try {
    return {
      distTagsJson: String(
        run("npm", ["view", packageName, "dist-tags", "--json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      ),
    };
  } catch (error) {
    const err = /** @type {any} */ (error);
    return {
      readError: String(err?.stderr || err?.message || err).slice(0, 500),
    };
  }
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (!key?.startsWith("--") || value === undefined) {
      throw new GuardError(
        "USAGE",
        `Invalid arguments near "${key ?? ""}"`,
        { argv },
        "Usage: align-next-dist-tag.mjs --version 3.2.1 [--package name] [--dist-tags-json file]",
      );
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

/**
 * @param {string[]} argv
 * @param {{run?: (...args: any[]) => unknown}} [deps]
 * @returns {NextAlignment}
 */
export function runCli(argv, { run = execFileSync } = {}) {
  const flags = parseFlags(argv);
  if (!flags.version) {
    throw new GuardError(
      "USAGE",
      "--version is required",
      { flags: Object.keys(flags) },
      "Pass the stable version that was just published, e.g. --version 3.2.1.",
    );
  }
  const source = flags["dist-tags-json"] !== undefined
    ? { distTagsJson: readFileSync(flags["dist-tags-json"], "utf8") }
    : readDistTags(flags.package ?? DEFAULT_PACKAGE, run);
  return decideNextAlignment({ version: flags.version, ...source });
}

function main() {
  try {
    console.log(JSON.stringify(runCli(process.argv.slice(2))));
  } catch (error) {
    const guard = error instanceof GuardError ? error : new GuardError(
      "INTERNAL",
      String(error?.message ?? error),
      {},
      "Fix the input or report a bug in scripts/align-next-dist-tag.mjs.",
    );
    console.log(JSON.stringify({ ok: false, error: guard.toJSON() }));
    process.exit(2);
  }
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
