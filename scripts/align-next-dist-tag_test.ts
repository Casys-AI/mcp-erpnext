/**
 * Documentation exécutable de la décision d'alignement de `next`
 * (scripts/align-next-dist-tag.mjs), appelée par .github/workflows/publish.yml
 * après la publication d'une version stable.
 * Lancer avec : deno task test:scripts
 */

import { assert, assertEquals } from "@std/assert";
import { parse } from "@std/yaml";
import { fileURLToPath } from "node:url";
import { GuardError } from "./release-guard.mjs";
import {
  decideNextAlignment,
  readDistTags,
  runCli,
} from "./align-next-dist-tag.mjs";

const tags = (value: Record<string, unknown>) => JSON.stringify(value);

function decide(next: string, version: string) {
  return decideNextAlignment({
    version,
    distTagsJson: tags({ latest: version, next }),
  });
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof GuardError) return error.code;
    throw error;
  }
  throw new Error("expected a GuardError");
}

// ── Cas (a) : lecture impossible → ne rien toucher ────────────────────────────

Deno.test("une lecture npm en échec ne touche à rien (scénario 3.3.0-beta.1 vs 3.2.1)", () => {
  // `next` vaut en réalité 3.3.0-beta.1, mais la lecture a échoué : on l'ignore.
  const decision = decideNextAlignment({
    version: "3.2.1",
    readError: "npm ERR! network request failed",
  });
  assertEquals(decision.action, "keep");
  assertEquals(decision.reason, "READ_FAILED");
  assertEquals(decision.next, null);
  assert(String(decision.detail).includes("network request failed"));
});

Deno.test("un JSON de dist-tags illisible ou inattendu est une lecture en échec", () => {
  for (const distTagsJson of ["", "not json", "null", "[]", '"3.2.1"', "42"]) {
    const decision = decideNextAlignment({ version: "3.2.1", distTagsJson });
    assertEquals(decision.action, "keep", distTagsJson);
    assertEquals(decision.reason, "READ_FAILED", distTagsJson);
  }
});

Deno.test("sans JSON ni erreur, la lecture est tenue pour échouée", () => {
  assertEquals(
    decideNextAlignment({ version: "3.2.1" }).reason,
    "READ_FAILED",
  );
});

// ── Cas (b) : `next` absent → aligner ─────────────────────────────────────────

Deno.test("un dist-tag next absent est aligné", () => {
  const decision = decideNextAlignment({
    version: "3.2.1",
    distTagsJson: tags({ latest: "3.2.0" }),
  });
  assertEquals(decision.action, "align");
  assertEquals(decision.reason, "NEXT_ABSENT");
  assertEquals(decision.next, null);
});

Deno.test("un objet de dist-tags vide est aligné", () => {
  const decision = decideNextAlignment({
    version: "3.2.1",
    distTagsJson: "{}",
  });
  assertEquals(decision.action, "align");
  assertEquals(decision.reason, "NEXT_ABSENT");
});

// ── Cas (c) : `next` existe → règle de la ligne ───────────────────────────────

Deno.test("la bêta de la ligne publiée est alignée (3.2.0-beta.1 vs 3.2.1)", () => {
  const decision = decide("3.2.0-beta.1", "3.2.1");
  assertEquals(decision.action, "align");
  assertEquals(decision.reason, "NEXT_NOT_NEWER_LINE");
  assertEquals(decision.next, "3.2.0-beta.1");
  assertEquals(decision.version, "3.2.1");
});

Deno.test("la bêta d'une ligne plus récente est conservée (3.3.0-beta.1 vs 3.2.1)", () => {
  const decision = decide("3.3.0-beta.1", "3.2.1");
  assertEquals(decision.action, "keep");
  assertEquals(decision.reason, "NEXT_NEWER_LINE");
  assertEquals(decision.next, "3.3.0-beta.1");
});

Deno.test("next déjà à la version publiée est réaligné (3.2.1 vs 3.2.1)", () => {
  assertEquals(decide("3.2.1", "3.2.1").action, "align");
});

Deno.test("une release candidate d'une ligne majeure suivante est conservée (4.0.0-rc.1 vs 3.9.0)", () => {
  const decision = decide("4.0.0-rc.1", "3.9.0");
  assertEquals(decision.action, "keep");
  assertEquals(decision.reason, "NEXT_NEWER_LINE");
});

Deno.test("la ligne se compare sur major.minor.patch, sans le suffixe de prerelease", () => {
  // Même ligne que la version stable : la stable la remplace.
  assertEquals(decide("3.2.1-beta.7", "3.2.1").action, "align");
  assertEquals(decide("3.2.1-rc.1", "3.2.1").action, "align");
  // Le patch suivant est une ligne plus récente.
  assertEquals(decide("3.2.2-beta.1", "3.2.1").action, "keep");
});

Deno.test("la comparaison est numérique, jamais lexicale", () => {
  assertEquals(decide("3.10.0-beta.1", "3.9.0").action, "keep");
  assertEquals(decide("3.9.0-beta.1", "3.10.0").action, "align");
  assertEquals(decide("3.2.10-beta.1", "3.2.9").action, "keep");
});

Deno.test("un next illisible n'est pas touché", () => {
  for (const next of ["", "latest", "v3.2.1", "3.2", 7, null, ["3.2.1"]]) {
    const decision = decideNextAlignment({
      version: "3.2.1",
      distTagsJson: tags({ next }),
    });
    assertEquals(decision.action, "keep", String(next));
    assertEquals(decision.reason, "NEXT_INVALID", String(next));
  }
});

Deno.test("une version publiée invalide est une erreur d'usage, pas une décision", () => {
  assertEquals(
    codeOf(() =>
      decideNextAlignment({ version: "3.2", distTagsJson: tags({}) })
    ),
    "INVALID_VERSION",
  );
});

Deno.test("la décision est déterministe", () => {
  const input = {
    version: "3.2.1",
    distTagsJson: tags({ next: "3.2.0-beta.1" }),
  };
  assertEquals(decideNextAlignment(input), decideNextAlignment(input));
});

// ── Lecture npm et CLI ────────────────────────────────────────────────────────

Deno.test("readDistTags interroge `npm view <paquet> dist-tags --json`", () => {
  let seen: unknown[] = [];
  const result = readDistTags("@casys/x", (...args: unknown[]) => {
    seen = args;
    return '{"latest":"3.2.1"}\n';
  });
  assertEquals(result, { distTagsJson: '{"latest":"3.2.1"}\n' });
  assertEquals(seen[0], "npm");
  assertEquals(seen[1], ["view", "@casys/x", "dist-tags", "--json"]);
});

Deno.test("readDistTags transforme tout échec de npm en readError, sans lever", () => {
  const offline = () => {
    throw Object.assign(new Error("spawn failed"), {
      stderr: "npm ERR! code ENOTFOUND",
    });
  };
  const result = readDistTags("@casys/x", offline);
  assertEquals("distTagsJson" in result, false);
  assert(String(result.readError).includes("ENOTFOUND"));
});

Deno.test("runCli : l'échec de npm rend keep/READ_FAILED, jamais une erreur", () => {
  const decision = runCli(["--version", "3.2.1"], {
    run: () => {
      throw new Error("registry unreachable");
    },
  });
  assertEquals(decision.action, "keep");
  assertEquals(decision.reason, "READ_FAILED");
});

Deno.test("runCli : lit les dist-tags npm et décide", () => {
  const run = () => tags({ latest: "3.2.1", next: "3.2.0-beta.1" });
  const decision = runCli(["--version", "3.2.1"], { run });
  assertEquals(decision.action, "align");
  assertEquals(decision.reason, "NEXT_NOT_NEWER_LINE");
});

Deno.test("runCli : --dist-tags-json court-circuite le registre", () => {
  const file = Deno.makeTempFileSync({ suffix: ".json" });
  try {
    Deno.writeTextFileSync(file, tags({ next: "3.3.0-beta.1" }));
    const decision = runCli(
      ["--version", "3.2.1", "--dist-tags-json", file],
      {
        run: () => {
          throw new Error("le registre ne doit pas être lu");
        },
      },
    );
    assertEquals(decision.action, "keep");
    assertEquals(decision.reason, "NEXT_NEWER_LINE");
  } finally {
    Deno.removeSync(file);
  }
});

Deno.test("runCli : --version est obligatoire et validée", () => {
  assertEquals(codeOf(() => runCli([], { run: () => "{}" })), "USAGE");
  assertEquals(
    codeOf(() => runCli(["--version"], { run: () => "{}" })),
    "USAGE",
  );
  assertEquals(
    codeOf(() => runCli(["--version", "3.2"], { run: () => "{}" })),
    "INVALID_VERSION",
  );
});

// ── Le pas du workflow, exécuté tel quel avec un faux `npm` ───────────────────

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STEP_NAME = "Align next with a newer stable release";

function alignStep(): { run: string; if?: string } {
  const workflow = parse(
    Deno.readTextFileSync(`${ROOT}.github/workflows/publish.yml`),
  ) as { jobs: Record<string, { steps: Array<Record<string, unknown>> }> };
  for (const job of Object.values(workflow.jobs)) {
    const step = job.steps.find((candidate) => candidate.name === STEP_NAME);
    if (step) return step as { run: string; if?: string };
  }
  throw new Error(`step "${STEP_NAME}" not found in publish.yml`);
}

/**
 * Exécute le `run:` du workflow (`bash -e`, comme GitHub) avec un `npm` factice
 * qui consigne ses appels. `view` rend `view` tel quel, ou échoue si `null`.
 */
function runAlignStep(view: string | null, version = "3.2.1") {
  const dir = Deno.makeTempDirSync();
  try {
    const log = `${dir}/npm.log`;
    Deno.writeTextFileSync(
      `${dir}/npm`,
      `#!/bin/sh
echo "$@" >> "$NPM_LOG"
if [ "$1" = "view" ]; then
  if [ -z "$FAKE_NPM_VIEW" ]; then echo "npm ERR! network" >&2; exit 1; fi
  echo "$FAKE_NPM_VIEW"
fi
`,
      { mode: 0o755 },
    );
    Deno.writeTextFileSync(log, "");
    const output = new Deno.Command("bash", {
      args: ["-e", "-c", alignStep().run],
      cwd: ROOT,
      env: {
        PATH: `${dir}:${Deno.env.get("PATH")}`,
        NPM_LOG: log,
        FAKE_NPM_VIEW: view ?? "",
        RELEASE_VERSION: version,
      },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    return {
      code: output.code,
      stdout: new TextDecoder().decode(output.stdout),
      npmCalls: Deno.readTextFileSync(log).split("\n").filter(Boolean),
    };
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
}

const ADD_NEXT = "dist-tag add @casys/mcp-erpnext@3.2.1 next";

Deno.test("workflow : le pas ne tourne que pour une publication latest", () => {
  assertEquals(
    alignStep().if,
    "needs.release_guard.outputs.npm_dist_tag == 'latest'",
  );
});

Deno.test("workflow : lecture npm en échec → avertissement, code 0, next intact", () => {
  const result = runAlignStep(null);
  assertEquals(result.code, 0);
  assert(result.stdout.includes("::warning"), result.stdout);
  assertEquals(
    result.npmCalls.some((call) => call.startsWith("dist-tag")),
    false,
  );
});

Deno.test("workflow : next absent → aligné", () => {
  const result = runAlignStep('{"latest":"3.2.0"}');
  assertEquals(result.code, 0);
  assertEquals(result.stdout.includes("::warning"), false);
  assert(result.npmCalls.includes(ADD_NEXT), result.npmCalls.join("\n"));
});

Deno.test("workflow : next d'une ligne plus récente → conservé sans avertissement", () => {
  const result = runAlignStep('{"latest":"3.2.0","next":"3.3.0-beta.1"}');
  assertEquals(result.code, 0);
  assertEquals(result.stdout.includes("::warning"), false);
  assertEquals(
    result.npmCalls.some((call) => call.startsWith("dist-tag")),
    false,
  );
});

Deno.test("workflow : next plus ancien ou de la même ligne → aligné", () => {
  for (const next of ["3.2.0-beta.1", "3.2.1-beta.4", "3.2.1"]) {
    const result = runAlignStep(`{"latest":"3.2.0","next":"${next}"}`);
    assertEquals(result.code, 0, next);
    assert(result.npmCalls.includes(ADD_NEXT), next);
  }
});

Deno.test("workflow : une version publiée invalide fait échouer le pas, sans rien écrire", () => {
  const result = runAlignStep('{"next":"3.2.0-beta.1"}', "oops");
  assertEquals(result.code !== 0, true);
  assertEquals(
    result.npmCalls.some((call) => call.startsWith("dist-tag")),
    false,
  );
});
