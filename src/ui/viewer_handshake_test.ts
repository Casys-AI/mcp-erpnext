import { assert, assertEquals } from "@std/assert";
import { UI_VIEWERS } from "./viewers.ts";

/**
 * Les viewers qui parlent à l'hôte via `new App(...)` + `app.connect()`.
 *
 * La liste est déduite de `UI_VIEWERS` et des sources : ajouter un viewer à
 * `viewers.ts` l'ajoute automatiquement à ces garde-fous. Les viewers qui
 * passent par un autre runtime (la surface d'achat) sont listés à part, de
 * façon explicite, pour qu'un viewer ne sorte jamais du contrôle en silence.
 */
const SURFACE_RUNTIME_VIEWERS = ["buy-evidence-viewer"];

/** Handlers que tout viewer doit brancher avant `connect()`. */
const REQUIRED_HANDLERS = ["ontoolresult", "ontoolinputpartial"];

interface ViewerHandshakeFixture {
  directory: string;
  /** Fichier source qui contient `new App(`. */
  file: string;
  source: string;
  appName: string;
  /** Tous les `app.on…=` de la source : chacun doit précéder `connect()`. */
  handlers: string[];
}

async function sourceFiles(directory: string): Promise<string[]> {
  const names: string[] = [];
  for await (
    const entry of Deno.readDir(
      new URL(`./${directory}/src/`, import.meta.url),
    )
  ) {
    if (
      entry.isFile && /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith("_test.ts")
    ) names.push(entry.name);
  }
  return names.sort();
}

async function discoverViewers(): Promise<{
  connecting: ViewerHandshakeFixture[];
  withoutApp: string[];
}> {
  const connecting: ViewerHandshakeFixture[] = [];
  const withoutApp: string[] = [];
  for (const directory of UI_VIEWERS) {
    let found: ViewerHandshakeFixture | undefined;
    for (const file of await sourceFiles(directory)) {
      const source = await Deno.readTextFile(
        new URL(`./${directory}/src/${file}`, import.meta.url),
      );
      const declaration = /new App\(\{\s*name:\s*"([^"]+)"/.exec(source);
      if (!declaration) continue;
      assert(!found, `${directory}: plusieurs fichiers contiennent new App(`);
      const handlers = [
        ...new Set(
          [...source.matchAll(/\bapp\.(on[a-z]+)\s*=/g)].map((m) => m[1]),
        ),
      ];
      found = {
        directory,
        file,
        source,
        appName: declaration[1],
        handlers,
      };
    }
    if (found) connecting.push(found);
    else withoutApp.push(directory);
  }
  return { connecting, withoutApp };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertBeforeConnect(
  source: string,
  viewer: string,
  appIdentifier: string,
  handlers: string[],
): void {
  const connectIndex = source.indexOf(`${appIdentifier}.connect(`);
  assert(connectIndex >= 0, `${viewer}: app.connect() is missing`);

  for (const handler of handlers) {
    const assignment = new RegExp(
      `${escapeRegExp(appIdentifier)}\\.${handler}\\s*=`,
    ).exec(source);
    const handlerIndex = assignment?.index ?? -1;
    assert(handlerIndex >= 0, `${viewer}: app.${handler} is missing`);
    assert(
      handlerIndex < connectIndex,
      `${viewer}: app.${handler} must be registered before app.connect()`,
    );
  }
}

Deno.test("ERPNext viewer discovery covers every UI_VIEWERS entry", async () => {
  const { connecting, withoutApp } = await discoverViewers();
  assert(connecting.length > 0, "aucun viewer ne se connecte à l'hôte");
  assertEquals(
    [...connecting.map((viewer) => viewer.directory), ...withoutApp].sort(),
    [...UI_VIEWERS].sort(),
  );
  // Seul un viewer au runtime de surface peut ne pas appeler new App(.
  assertEquals(withoutApp, SURFACE_RUNTIME_VIEWERS);
  assert(
    connecting.some((viewer) => viewer.directory === "doc-viewer"),
    "doc-viewer doit être couvert par le contrôle du handshake",
  );
  for (const viewer of connecting) {
    for (const handler of REQUIRED_HANDLERS) {
      assert(
        viewer.handlers.includes(handler),
        `${viewer.directory}: app.${handler} is missing`,
      );
    }
  }
});

Deno.test("ERPNext viewer sources register MCP handlers before connect", async () => {
  const { connecting } = await discoverViewers();
  for (const viewer of connecting) {
    assertBeforeConnect(
      viewer.source,
      viewer.directory,
      "app",
      viewer.handlers,
    );
  }
});

Deno.test("ERPNext viewer sources surface a failed connect to the user", async () => {
  const { connecting } = await discoverViewers();
  for (const viewer of connecting) {
    // Un catch vide laisserait un écran vide, sans explication.
    assertEquals(
      /\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(viewer.source),
      false,
      `${viewer.directory}: connect() failure is swallowed by an empty catch`,
    );
    assert(
      viewer.source.includes('t("common.error.connect_failed")'),
      `${viewer.directory}: connect() failure must show common.error.connect_failed`,
    );
  }
});

Deno.test("ERPNext viewer bundles preserve handler-before-connect ordering", async () => {
  const { connecting } = await discoverViewers();
  const builtViewers = await Promise.all(connecting.map(async (viewer) => {
    try {
      const bundle = await Deno.readTextFile(
        new URL(`./dist/${viewer.directory}/index.html`, import.meta.url),
      );
      return { viewer, bundle };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return undefined;
      throw error;
    }
  }));
  const present = builtViewers.filter((entry) => entry !== undefined);
  if (present.length === 0) return;
  assertEquals(
    present.length,
    connecting.length,
    "Either all viewer bundles must be built or none of them",
  );

  for (const { viewer, bundle } of present) {
    const declaration = bundle.match(
      new RegExp(
        `const\\s+([A-Za-z_$][\\w$]*)=new\\s+[A-Za-z_$][\\w$]*\\(\\{name:"${
          escapeRegExp(viewer.appName)
        }"`,
      ),
    );
    assert(declaration, `${viewer.directory}: MCP App declaration is missing`);
    const appIdentifier = declaration[1];
    assertBeforeConnect(
      bundle.slice(declaration.index),
      viewer.directory,
      appIdentifier,
      viewer.handlers,
    );
  }
});
