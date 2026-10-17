#!/usr/bin/env node
/**
 * Release guard for @casys/mcp-erpnext — called by .github/workflows/publish.yml.
 *
 * Decides, before anything is published, which npm dist-tag a version may
 * use. No external dependency: Node >= 20 only, so the workflow can run it
 * straight after checkout.
 *
 * Rules (each violation is a machine-readable error: code + context + recovery):
 *   - deno.json and server.ts declare the same version   (VERSION_MISMATCH)
 *   - the run comes from the tag refs/tags/v<version>      (REF_MISMATCH)
 *   - a prerelease (has a "-" suffix) publishes on `next`  (DIST_TAG_MISMATCH)
 *   - a stable version publishes on `latest` or `maintenance`
 *   - `auto` resolves to `next` (prerelease) or `latest` (stable), and `latest`
 *     NEVER moves backwards: a stable version lower than the current npm
 *     `latest` is rejected                                  (STABLE_BELOW_LATEST)
 *   - `maintenance` is the explicit channel for backports: it is only accepted
 *     for a stable version strictly lower than `latest`     (MAINTENANCE_NOT_BELOW_LATEST)
 *
 * CLI (stdout is always ONE JSON document; exit 0 = accepted, 1 = rejected,
 * 2 = usage or infrastructure error):
 *   node scripts/release-guard.mjs release --ref "$GITHUB_REF" \
 *        --requested-tag "$REQUESTED_NPM_DIST_TAG" [--github-output "$GITHUB_OUTPUT"]
 *   node scripts/release-guard.mjs tag --version 3.1.0 --tag latest
 *   (both accept --dist-tags-json <file> to skip the registry lookup, for tests)
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Dist-tags a caller may request. `auto` is resolved by {@link resolveDistTag}. */
export const REQUESTABLE_TAGS = ["auto", "next", "latest", "maintenance"];

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Structured rejection carrying the AX triplet code / context / recovery. */
export class GuardError extends Error {
  /**
   * @param {string} code stable machine-readable identifier
   * @param {string} message
   * @param {Record<string, any>} [context]
   * @param {string} [recovery] what to do next
   */
  constructor(code, message, context = {}, recovery = "") {
    super(message);
    this.name = "GuardError";
    this.code = code;
    this.context = context;
    this.recovery = recovery;
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

/**
 * Parses a strict semver 2.0.0 string.
 * @returns {{major:number, minor:number, patch:number, prerelease:string[]}}
 */
export function parseSemver(value) {
  const match = typeof value === "string" ? SEMVER.exec(value) : null;
  if (!match) {
    throw new GuardError(
      "INVALID_VERSION",
      `"${value}" is not a valid semver version`,
      { value },
      "Use MAJOR.MINOR.PATCH with an optional -prerelease suffix (e.g. 3.1.0 or 3.1.0-beta.12).",
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

const isNumericId = (id) => /^\d+$/.test(id);

/**
 * Semver 2.0.0 precedence (build metadata ignored).
 * @returns {-1|0|1} negative when a < b
 */
export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  const lp = left.prerelease;
  const rp = right.prerelease;
  // A version without prerelease outranks the same core with one.
  if (lp.length === 0 && rp.length === 0) return 0;
  if (lp.length === 0) return 1;
  if (rp.length === 0) return -1;
  for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
    if (lp[i] === undefined) return -1; // fewer identifiers = lower
    if (rp[i] === undefined) return 1;
    if (lp[i] === rp[i]) continue;
    const ln = isNumericId(lp[i]);
    const rn = isNumericId(rp[i]);
    if (ln && rn) return Number(lp[i]) < Number(rp[i]) ? -1 : 1;
    if (ln) return -1; // numeric identifiers rank below alphanumeric ones
    if (rn) return 1;
    return lp[i] < rp[i] ? -1 : 1;
  }
  return 0;
}

/** `true` when the version carries a prerelease suffix. */
export function isPrerelease(version) {
  return parseSemver(version).prerelease.length > 0;
}

/**
 * Resolves the requested tag (`auto` included) and rejects combinations that
 * the release policy forbids. Pure: the registry state is an argument.
 *
 * `distTags` may be an object or a thunk; the thunk is only called when the
 * stable channel needs the registry state.
 *
 * @param {{version:string, requestedTag?:string, distTags?:Record<string,string>|(() => Record<string,string>)}} input
 * @returns {{npmDistTag:string, channel:"prerelease"|"stable", npmLatest:string|null}}
 */
export function resolveDistTag({ version, requestedTag, distTags = {} }) {
  const requested = requestedTag && requestedTag.length > 0
    ? requestedTag
    : "auto";
  if (!REQUESTABLE_TAGS.includes(requested)) {
    throw new GuardError(
      "UNKNOWN_DIST_TAG",
      `npm dist-tag "${requested}" is not allowed`,
      { requested, allowed: REQUESTABLE_TAGS },
      `Use one of: ${REQUESTABLE_TAGS.join(", ")}.`,
    );
  }

  const prerelease = isPrerelease(version);
  const channel = prerelease ? "prerelease" : "stable";
  const tag = requested === "auto"
    ? (prerelease ? "next" : "latest")
    : requested;

  if (prerelease && tag !== "next") {
    throw new GuardError(
      "DIST_TAG_MISMATCH",
      `${version} is a prerelease and must publish with npm tag next, not ${tag}`,
      { version, channel, requested, resolved: tag, expected: "next" },
      "Re-run with npm_dist_tag=auto or next, or release a version without a prerelease suffix.",
    );
  }

  if (!prerelease && tag === "next") {
    throw new GuardError(
      "DIST_TAG_MISMATCH",
      `${version} is a stable version and must publish with npm tag latest or maintenance, not next`,
      {
        version,
        channel,
        requested,
        resolved: tag,
        expected: ["latest", "maintenance"],
      },
      "Re-run with npm_dist_tag=auto or latest (or maintenance for a backport).",
    );
  }

  // The prerelease -> next flow never reads the registry: it cannot be blocked
  // by an npm outage and has no monotonicity constraint.
  if (prerelease) return { npmDistTag: tag, channel, npmLatest: null };

  const tags = typeof distTags === "function" ? distTags() : distTags;
  const npmLatest = typeof tags?.latest === "string" ? tags.latest : null;
  if (npmLatest !== null) {
    try {
      parseSemver(npmLatest);
    } catch {
      throw new GuardError(
        "NPM_LATEST_INVALID",
        `npm dist-tag latest points to "${npmLatest}", which is not valid semver`,
        { npmLatest },
        "Inspect `npm view @casys/mcp-erpnext dist-tags` and repair the latest tag manually before releasing.",
      );
    }
  }

  if (
    tag === "latest" && npmLatest !== null &&
    compareSemver(version, npmLatest) < 0
  ) {
    throw new GuardError(
      "STABLE_BELOW_LATEST",
      `${version} is lower than the current npm latest (${npmLatest}); publishing it on latest would move latest backwards`,
      { version, npmLatest, requested, resolved: tag },
      `To ship a backport without moving latest, re-run workflow_dispatch with npm_dist_tag=maintenance. Otherwise bump the version above ${npmLatest}.`,
    );
  }

  if (
    tag === "maintenance" && npmLatest !== null &&
    compareSemver(version, npmLatest) >= 0
  ) {
    throw new GuardError(
      "MAINTENANCE_NOT_BELOW_LATEST",
      `${version} is not lower than the current npm latest (${npmLatest}); maintenance is reserved for backports`,
      { version, npmLatest, requested, resolved: tag },
      "Re-run with npm_dist_tag=auto or latest.",
    );
  }

  return { npmDistTag: tag, channel, npmLatest };
}

/** Extracts `version: "x"` from server.ts (same regex the workflow used before). */
export function extractRuntimeVersion(serverSource) {
  const match = /version:\s*"([^"]+)"/.exec(serverSource);
  if (!match) {
    throw new GuardError(
      "RUNTIME_VERSION_NOT_FOUND",
      'server.ts does not contain a `version: "..."` literal',
      { file: "server.ts" },
      "Restore the McpApp `version` field in server.ts; it must equal deno.json version.",
    );
  }
  return match[1];
}

/**
 * Full release decision: file consistency, tag ref, dist-tag, monotonicity.
 *
 * @param {{denoVersion:string, runtimeVersion:string, ref:string, requestedTag?:string,
 *          distTags?:Record<string,string>|(() => Record<string,string>)}} input
 */
export function evaluateRelease(
  { denoVersion, runtimeVersion, ref, requestedTag, distTags },
) {
  parseSemver(denoVersion);
  if (denoVersion !== runtimeVersion) {
    throw new GuardError(
      "VERSION_MISMATCH",
      `deno.json (${denoVersion}) and server.ts (${runtimeVersion}) versions differ`,
      { denoJson: denoVersion, serverTs: runtimeVersion },
      "Set the same version in deno.json and server.ts, commit, and re-tag.",
    );
  }
  const expectedRef = `refs/tags/v${denoVersion}`;
  if (ref !== expectedRef) {
    throw new GuardError(
      "REF_MISMATCH",
      `Publish must run from ${expectedRef}, got ${ref || "(empty ref)"}`,
      { expectedRef, ref: ref ?? "" },
      `Run the workflow on the tag v${denoVersion} (push the tag, then select it as the ref).`,
    );
  }
  const decision = resolveDistTag({
    version: denoVersion,
    requestedTag,
    distTags,
  });
  return { version: denoVersion, ...decision };
}

/**
 * Reads npm dist-tags for a package. A missing package (E404) yields `{}`;
 * any other failure throws so the guard fails closed instead of skipping the
 * monotonic check.
 *
 * @param {string} packageName
 * @param {(file: string, args: string[], options: object) => string | Uint8Array} [run]
 */
export function fetchDistTags(packageName, run = execFileSync) {
  let stdout;
  try {
    stdout = String(run("npm", ["view", packageName, "dist-tags", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch (error) {
    const out = String(error?.stdout ?? "");
    try {
      if (JSON.parse(out)?.error?.code === "E404") return {};
    } catch { /* fall through to the infrastructure error */ }
    throw new GuardError(
      "NPM_REGISTRY_UNAVAILABLE",
      `Could not read dist-tags of ${packageName} from the npm registry`,
      {
        packageName,
        detail: String(error?.stderr ?? error?.message ?? "").slice(0, 500),
      },
      "Retry the workflow; the monotonic latest check cannot be skipped.",
    );
  }
  try {
    const parsed = JSON.parse(stdout);
    if (parsed === null || typeof parsed !== "object") throw new Error("shape");
    return parsed;
  } catch {
    throw new GuardError(
      "NPM_REGISTRY_UNAVAILABLE",
      `Unexpected npm view output for ${packageName}`,
      { packageName, stdout: stdout.slice(0, 200) },
      "Retry the workflow; the monotonic latest check cannot be skipped.",
    );
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new GuardError(
        "USAGE",
        `Invalid arguments near "${key ?? ""}"`,
        { argv },
        "Usage: release-guard.mjs release|tag --flag value ... (see header of scripts/release-guard.mjs).",
      );
    }
    flags[key.slice(2)] = value;
  }
  return { command, flags };
}

/** Lazy provider: the registry is only queried if the guard needs it. */
function distTagsFor(flags, packageName) {
  return () => {
    if (flags["dist-tags-json"] !== undefined) {
      return JSON.parse(readFileSync(flags["dist-tags-json"], "utf8"));
    }
    return fetchDistTags(packageName);
  };
}

export function runCli(argv, { root, env }) {
  const { command, flags } = parseArgs(argv);
  const deno = JSON.parse(readFileSync(resolve(root, "deno.json"), "utf8"));

  if (command === "release") {
    const runtimeVersion = extractRuntimeVersion(
      readFileSync(resolve(root, "server.ts"), "utf8"),
    );
    const result = evaluateRelease({
      denoVersion: deno.version,
      runtimeVersion,
      ref: flags.ref ?? env.GITHUB_REF ?? "",
      requestedTag: flags["requested-tag"],
      distTags: distTagsFor(flags, deno.name),
    });
    if (flags["github-output"]) {
      appendFileSync(
        flags["github-output"],
        `version=${result.version}\nnpm_dist_tag=${result.npmDistTag}\n`,
      );
    }
    return result;
  }

  if (command === "tag") {
    if (!flags.version || !flags.tag) {
      throw new GuardError(
        "USAGE",
        "tag requires --version and --tag",
        { flags: Object.keys(flags) },
        "node scripts/release-guard.mjs tag --version 3.1.0 --tag latest",
      );
    }
    // `tag` is the explicit form: `auto` is meaningless here.
    if (flags.tag === "auto") {
      throw new GuardError(
        "UNKNOWN_DIST_TAG",
        "tag needs a resolved dist-tag, not auto",
        { requested: "auto" },
        "Pass the npm_dist_tag output of the release_guard job.",
      );
    }
    return {
      version: flags.version,
      ...resolveDistTag({
        version: flags.version,
        requestedTag: flags.tag,
        distTags: distTagsFor(flags, deno.name),
      }),
    };
  }

  throw new GuardError(
    "USAGE",
    `Unknown command "${command ?? ""}"`,
    { commands: ["release", "tag"] },
    "Usage: release-guard.mjs release|tag --flag value ...",
  );
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const result = runCli(process.argv.slice(2), { root, env: process.env });
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    const guard = error instanceof GuardError ? error : new GuardError(
      "INTERNAL",
      String(error?.message ?? error),
      {},
      "Fix the guard input or report a bug in scripts/release-guard.mjs.",
    );
    console.log(JSON.stringify({ ok: false, error: guard.toJSON() }));
    if (process.env.GITHUB_ACTIONS === "true") {
      console.log(
        `::error title=${guard.code}::${guard.message}. Recovery: ${guard.recovery}`,
      );
    }
    const infra = ["USAGE", "INTERNAL", "NPM_REGISTRY_UNAVAILABLE"];
    process.exit(infra.includes(guard.code) ? 2 : 1);
  }
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
