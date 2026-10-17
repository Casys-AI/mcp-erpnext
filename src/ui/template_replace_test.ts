import { assert, assertEquals } from "@std/assert";

/**
 * Les libellés ERP sont des données : passés comme chaîne de remplacement,
 * `$&`, `$1` ou `$$` y seraient interprétés par `String.replace`. Tout
 * gabarit `{clé}` du dossier UI doit donc passer par `fillTemplate`
 * (`shared/jumps.ts`) ou par une fonction de remplacement.
 */
const TEMPLATE_REPLACE = /\.replace\(\s*\/\\\{\w+\\\}\/g\s*,\s*([^\n]*)/g;
/** Forme fonction : `() => valeur`, `(m) => valeur` ou `function () {}`. */
const FUNCTION_REPLACEMENT = /^(?:\([^)]*\)|\w+)\s*=>|^function\b/;

async function* uiSources(directory: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(directory)) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const child = new URL(
      entry.isDirectory ? `${entry.name}/` : entry.name,
      directory,
    );
    if (entry.isDirectory) yield* uiSources(child);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith("_test.ts")) {
      yield child;
    }
  }
}

Deno.test("UI sources never feed data to replace() as a replacement string", async () => {
  const offenders: string[] = [];
  let scanned = 0;
  for await (const file of uiSources(new URL("./", import.meta.url))) {
    scanned++;
    const source = await Deno.readTextFile(file);
    for (const match of source.matchAll(TEMPLATE_REPLACE)) {
      // Seule la forme fonction est sûre : la valeur n'y est pas interprétée.
      if (!FUNCTION_REPLACEMENT.test(match[1].trim())) {
        offenders.push(`${file.pathname.split("/src/ui/")[1]}: ${match[0]}`);
      }
    }
  }
  assert(scanned > 0, "aucune source UI analysée");
  assertEquals(offenders, []);
});
