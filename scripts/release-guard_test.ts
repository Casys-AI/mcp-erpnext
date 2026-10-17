/**
 * Executable documentation of the publish guard (scripts/release-guard.mjs).
 * Run with: deno task test:scripts
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  compareSemver,
  evaluateRelease,
  extractRuntimeVersion,
  fetchDistTags,
  GuardError,
  isPrerelease,
  parseSemver,
  REQUESTABLE_TAGS,
  resolveDistTag,
  runCli,
} from "./release-guard.mjs";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof GuardError) return error.code;
    throw error;
  }
  throw new Error("expected a GuardError");
}

Deno.test("compareSemver follows the semver 2.0.0 precedence chain", () => {
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "1.0.1",
    "1.1.0",
    "2.0.0",
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    assertEquals(compareSemver(ordered[i], ordered[i + 1]), -1, ordered[i]);
    assertEquals(compareSemver(ordered[i + 1], ordered[i]), 1, ordered[i]);
  }
});

Deno.test("compareSemver compares numerically, never lexically", () => {
  assertEquals(compareSemver("3.10.0", "3.9.0"), 1);
  assertEquals(compareSemver("3.0.10", "3.0.9"), 1);
  assertEquals(compareSemver("3.1.0", "3.0.4"), 1);
  assertEquals(compareSemver("3.0.4", "3.1.0-beta.11"), -1);
});

Deno.test("compareSemver ignores build metadata and equal versions tie", () => {
  assertEquals(compareSemver("3.1.0+build.1", "3.1.0+build.2"), 0);
  assertEquals(compareSemver("3.1.0", "3.1.0"), 0);
});

Deno.test("parseSemver rejects malformed versions with a structured error", () => {
  for (const bad of ["3.1", "v3.1.0", "3.1.0-", "03.1.0", "", "3.1.0-01"]) {
    assertEquals(codeOf(() => parseSemver(bad)), "INVALID_VERSION", bad);
  }
  assertThrows(() => parseSemver(undefined as unknown as string), GuardError);
});

Deno.test("isPrerelease is true only for a suffixed version", () => {
  assert(isPrerelease("3.1.0-beta.11"));
  assert(!isPrerelease("3.1.0"));
  assert(!isPrerelease("3.1.0+build.5"));
});

Deno.test("requestable tags expose the explicit maintenance channel", () => {
  assertEquals(REQUESTABLE_TAGS, ["auto", "next", "latest", "maintenance"]);
});

Deno.test("prerelease auto and next publish on next without reading the registry", () => {
  const explode = () => {
    throw new Error("registry must not be read for prereleases");
  };
  for (const requestedTag of [undefined, "", "auto", "next"]) {
    const result = resolveDistTag({
      version: "3.1.0-beta.12",
      requestedTag,
      distTags: explode,
    });
    assertEquals(result.npmDistTag, "next");
    assertEquals(result.channel, "prerelease");
  }
});

Deno.test("prerelease is rejected on latest and on maintenance", () => {
  for (const requestedTag of ["latest", "maintenance"]) {
    assertEquals(
      codeOf(() => resolveDistTag({ version: "3.1.0-beta.12", requestedTag })),
      "DIST_TAG_MISMATCH",
    );
  }
});

Deno.test("stable is rejected on next", () => {
  assertEquals(
    codeOf(() => resolveDistTag({ version: "3.1.0", requestedTag: "next" })),
    "DIST_TAG_MISMATCH",
  );
});

Deno.test("stable auto resolves to latest when it moves latest forward", () => {
  const result = resolveDistTag({
    version: "3.1.0",
    requestedTag: "auto",
    distTags: { latest: "3.0.4", next: "3.1.0-beta.11" },
  });
  assertEquals(result, {
    npmDistTag: "latest",
    channel: "stable",
    npmLatest: "3.0.4",
  });
});

Deno.test("stable equal to latest passes (idempotent re-run)", () => {
  const result = resolveDistTag({
    version: "3.1.0",
    requestedTag: "auto",
    distTags: { latest: "3.1.0" },
  });
  assertEquals(result.npmDistTag, "latest");
});

Deno.test("first publish (no latest tag) is allowed", () => {
  assertEquals(
    resolveDistTag({ version: "1.0.0", requestedTag: "auto", distTags: {} })
      .npmDistTag,
    "latest",
  );
});

Deno.test("auto never moves latest backwards", () => {
  for (const requestedTag of ["auto", "latest"]) {
    try {
      resolveDistTag({
        version: "3.0.5",
        requestedTag,
        distTags: { latest: "3.1.0" },
      });
      throw new Error("expected STABLE_BELOW_LATEST");
    } catch (error) {
      assert(error instanceof GuardError, String(error));
      assertEquals(error.code, "STABLE_BELOW_LATEST");
      assertEquals(error.context.npmLatest, "3.1.0");
      assertEquals(error.context.version, "3.0.5");
      assert(error.recovery.includes("maintenance"));
    }
  }
});

Deno.test("latest is compared numerically: 3.9.9 is below 3.10.0", () => {
  assertEquals(
    codeOf(() =>
      resolveDistTag({
        version: "3.9.9",
        requestedTag: "auto",
        distTags: { latest: "3.10.0" },
      })
    ),
    "STABLE_BELOW_LATEST",
  );
});

Deno.test("a stable is above a prerelease latest of the same core", () => {
  assertEquals(
    resolveDistTag({
      version: "3.1.0",
      requestedTag: "latest",
      distTags: { latest: "3.1.0-rc.1" },
    }).npmDistTag,
    "latest",
  );
});

Deno.test("maintenance publishes a backport below latest", () => {
  const result = resolveDistTag({
    version: "3.0.5",
    requestedTag: "maintenance",
    distTags: { latest: "3.1.0" },
  });
  assertEquals(result.npmDistTag, "maintenance");
  assertEquals(result.channel, "stable");
});

Deno.test("maintenance is rejected for a version that is not a backport", () => {
  for (const version of ["3.1.0", "3.2.0"]) {
    assertEquals(
      codeOf(() =>
        resolveDistTag({
          version,
          requestedTag: "maintenance",
          distTags: { latest: "3.1.0" },
        })
      ),
      "MAINTENANCE_NOT_BELOW_LATEST",
    );
  }
});

Deno.test("unknown tag and invalid latest fail fast", () => {
  assertEquals(
    codeOf(() => resolveDistTag({ version: "3.1.0", requestedTag: "beta" })),
    "UNKNOWN_DIST_TAG",
  );
  assertEquals(
    codeOf(() =>
      resolveDistTag({
        version: "3.1.0",
        requestedTag: "auto",
        distTags: { latest: "not-a-version" },
      })
    ),
    "NPM_LATEST_INVALID",
  );
});

Deno.test("errors carry code, context and recovery as data", () => {
  try {
    resolveDistTag({
      version: "3.0.5",
      requestedTag: "auto",
      distTags: { latest: "3.1.0" },
    });
  } catch (error) {
    const json = (error as GuardError).toJSON();
    assertEquals(Object.keys(json).sort(), [
      "code",
      "context",
      "message",
      "recovery",
    ]);
    assert(json.recovery.length > 0);
    return;
  }
  throw new Error("expected a GuardError");
});

Deno.test("extractRuntimeVersion reads the McpApp version literal", () => {
  assertEquals(
    extractRuntimeVersion('new McpApp({ name: "x", version: "3.1.0" })'),
    "3.1.0",
  );
  assertEquals(
    codeOf(() => extractRuntimeVersion("no version here")),
    "RUNTIME_VERSION_NOT_FOUND",
  );
});

Deno.test("evaluateRelease keeps the deno.json == server.ts check", () => {
  assertEquals(
    codeOf(() =>
      evaluateRelease({
        denoVersion: "3.1.0",
        runtimeVersion: "3.0.4",
        ref: "refs/tags/v3.1.0",
        requestedTag: "auto",
        distTags: { latest: "3.0.4" },
      })
    ),
    "VERSION_MISMATCH",
  );
});

Deno.test("evaluateRelease requires the matching tag ref", () => {
  for (const ref of ["refs/heads/main", "refs/tags/v3.0.4", ""]) {
    assertEquals(
      codeOf(() =>
        evaluateRelease({
          denoVersion: "3.1.0",
          runtimeVersion: "3.1.0",
          ref,
          requestedTag: "auto",
          distTags: { latest: "3.0.4" },
        })
      ),
      "REF_MISMATCH",
      ref,
    );
  }
});

Deno.test("evaluateRelease accepts the promotion beta.11 -> 3.1.0", () => {
  assertEquals(
    evaluateRelease({
      denoVersion: "3.1.0",
      runtimeVersion: "3.1.0",
      ref: "refs/tags/v3.1.0",
      requestedTag: "auto",
      distTags: { latest: "3.0.4", next: "3.1.0-beta.11" },
    }),
    {
      version: "3.1.0",
      npmDistTag: "latest",
      channel: "stable",
      npmLatest: "3.0.4",
    },
  );
});

Deno.test("evaluateRelease keeps the prerelease -> next flow untouched", () => {
  const result = evaluateRelease({
    denoVersion: "3.2.0-beta.1",
    runtimeVersion: "3.2.0-beta.1",
    ref: "refs/tags/v3.2.0-beta.1",
    requestedTag: "auto",
    distTags: () => {
      throw new Error("no registry access for prereleases");
    },
  });
  assertEquals(result.npmDistTag, "next");
});

Deno.test("fetchDistTags: E404 means first publish, other failures fail closed", () => {
  const notFound = () => {
    throw Object.assign(new Error("404"), {
      stdout: JSON.stringify({ error: { code: "E404" } }),
    });
  };
  assertEquals(fetchDistTags("@casys/x", notFound), {});

  const offline = () => {
    throw Object.assign(new Error("ENOTFOUND"), {
      stdout: "",
      stderr: "network",
    });
  };
  assertEquals(
    codeOf(() => fetchDistTags("@casys/x", offline)),
    "NPM_REGISTRY_UNAVAILABLE",
  );

  assertEquals(
    fetchDistTags(
      "@casys/x",
      () => '{"latest":"3.0.4","next":"3.1.0-beta.11"}',
    ),
    { latest: "3.0.4", next: "3.1.0-beta.11" },
  );
  assertEquals(
    codeOf(() => fetchDistTags("@casys/x", () => "not json")),
    "NPM_REGISTRY_UNAVAILABLE",
  );
});

Deno.test("CLI release writes GITHUB_OUTPUT and rejects a regression", () => {
  const dir = Deno.makeTempDirSync();
  try {
    Deno.writeTextFileSync(
      `${dir}/deno.json`,
      JSON.stringify({ name: "@casys/mcp-erpnext", version: "3.0.5" }),
    );
    Deno.writeTextFileSync(
      `${dir}/server.ts`,
      'export const app = { name: "x", version: "3.0.5" };',
    );
    Deno.writeTextFileSync(
      `${dir}/tags.json`,
      JSON.stringify({ latest: "3.1.0", next: "3.2.0-beta.1" }),
    );
    const base = [
      "release",
      "--ref",
      "refs/tags/v3.0.5",
      "--dist-tags-json",
      `${dir}/tags.json`,
    ];

    let error: GuardError | undefined;
    try {
      runCli([...base, "--requested-tag", "auto"], { root: dir, env: {} });
    } catch (e) {
      error = e as GuardError;
    }
    assertEquals(error?.code, "STABLE_BELOW_LATEST");

    const out = `${dir}/github_output`;
    const result = runCli(
      [...base, "--requested-tag", "maintenance", "--github-output", out],
      { root: dir, env: {} },
    );
    assertEquals(result.npmDistTag, "maintenance");
    assertEquals(
      Deno.readTextFileSync(out),
      "version=3.0.5\nnpm_dist_tag=maintenance\n",
    );

    assertEquals(
      codeOf(() => runCli(["nope"], { root: dir, env: {} })),
      "USAGE",
    );
    assertEquals(
      codeOf(() =>
        runCli(["tag", "--version", "3.0.5"], { root: dir, env: {} })
      ),
      "USAGE",
    );
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("publish.yml wires the guard and exposes the maintenance choice", () => {
  const workflow = Deno.readTextFileSync(
    new URL("../.github/workflows/publish.yml", import.meta.url),
  );
  assert(workflow.includes("node scripts/release-guard.mjs release"));
  assert(workflow.includes("node scripts/release-guard.mjs tag"));
  assert(workflow.includes("- maintenance"));
  // The tag re-check must run before the npm publish / dist-tag commands.
  const recheck = workflow.indexOf("release-guard.mjs tag");
  assert(recheck > 0);
  assert(recheck < workflow.indexOf("npm dist-tag add"));
  assert(recheck < workflow.indexOf("npm publish --access public"));
});
