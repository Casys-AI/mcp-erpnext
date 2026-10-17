/**
 * Invariant: the JSR package never excludes a module the runtime imports.
 *
 * `deno.json` `publish.exclude` strips dev code and fixtures (dev-host, viewer
 * sources bundled into src/ui/dist, Buy synthetic fixtures...) from the
 * package. Excluding a module reachable from `mod.ts` or `server.ts` would
 * publish a broken package, so this test walks the real import graph
 * (`deno info`) and checks every local module against the exclude globs.
 */
import { assert, assertEquals } from "@std/assert";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("./", import.meta.url)));
const ENTRYPOINTS = ["mod.ts", "server.ts"];

/** Minimal glob to RegExp for the forms used in deno.json (`**`, `*`). */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

async function runtimeModules(entry: string): Promise<string[]> {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["info", "--json", entry],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert(output.success, new TextDecoder().decode(output.stderr));
  const graph = JSON.parse(new TextDecoder().decode(output.stdout)) as {
    modules: Array<{ specifier: string }>;
  };
  return graph.modules
    .map((m) => m.specifier)
    .filter((s) => s.startsWith("file://"))
    .map((s) => relative(ROOT, fileURLToPath(s)));
}

Deno.test("JSR publish.exclude never removes a module imported by the runtime", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(resolve(ROOT, "deno.json")),
  ) as { publish: { exclude: string[] } };
  const excludes = config.publish.exclude.map((glob) => ({
    glob,
    re: globToRegExp(glob),
  }));

  const modules = new Set<string>();
  for (const entry of ENTRYPOINTS) {
    for (const path of await runtimeModules(entry)) modules.add(path);
  }
  assert(modules.size > 50, `runtime graph looks empty (${modules.size})`);

  const wronglyExcluded = [...modules].filter((path) =>
    excludes.some(({ re }) => re.test(path))
  );
  assertEquals(
    wronglyExcluded,
    [],
    "publish.exclude removes modules the runtime imports",
  );
});

Deno.test("JSR publish.exclude keeps stripping dev-only code", () => {
  const dev = [
    "src/ui/dev-host/src/main.ts",
    "src/ui/kpi-viewer/src/fixture.ts",
    "src/ui/buy-evidence-viewer/test.ts",
    "src/ui/buy-evidence-viewer/check-bundle.ts",
    "src/buy/synthetic.ts",
    "src/buy/write_contract_fixtures.ts",
  ];
  const config = JSON.parse(
    Deno.readTextFileSync(resolve(ROOT, "deno.json")),
  ) as { publish: { exclude: string[] } };
  const excludes = config.publish.exclude.map(globToRegExp);
  for (const path of dev) {
    assert(
      excludes.some((re) => re.test(path)),
      `${path} must be excluded from the JSR package`,
    );
  }
});
