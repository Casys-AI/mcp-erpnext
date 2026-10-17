/**
 * Espacement de lettres : la règle RTL de global.css ne remet à zéro que des
 * jetons. Ces gardes empêchent qu'un label contourne les jetons (valeur
 * arbitraire ou style inline) et garde alors son espacement en ourdou.
 */

import { assert, assertEquals } from "@std/assert";

const UI_ROOT = new URL("../", import.meta.url);

async function* sourceFiles(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* sourceFiles(child);
    else if (entry.name.endsWith(".tsx")) yield child;
  }
}

function positiveTrackingTokens(css: string): string[] {
  return [...css.matchAll(/^\s*(--tracking-[a-z-]+):\s*([^;]+);/gm)]
    .filter(([, , value]) => !value.trim().startsWith("-"))
    .map(([, name]) => name);
}

Deno.test("tracking : global.css remet à zéro en RTL chaque jeton d'espacement positif", async () => {
  const tokens = positiveTrackingTokens(
    await Deno.readTextFile(new URL("shared/tokens.css", UI_ROOT)),
  );
  assert(tokens.length >= 5, "les jetons --tracking-* positifs existent");
  const global = await Deno.readTextFile(new URL("global.css", UI_ROOT));
  const block = /:root\[dir="rtl"\]\s*\{([^}]*)\}/.exec(global)?.[1];
  assert(block, 'global.css : bloc :root[dir="rtl"] absent');
  for (const token of tokens) {
    assert(
      new RegExp(`${token}:\\s*0\\s*;`).test(block),
      `${token} n'est pas remis à zéro en RTL`,
    );
  }
  // Les jetons négatifs (serrage de chiffres latins) ne sont pas touchés.
  assertEquals(block.includes("--tracking-title"), false);
  assertEquals(block.includes("--tracking-metric"), false);
});

Deno.test("tracking : aucun espacement positif hors jetons dans les viewers", async () => {
  const offenders: string[] = [];
  for await (const file of sourceFiles(UI_ROOT)) {
    const source = await Deno.readTextFile(file);
    const positive = source.match(
      /tracking-\[\+?\d|letterSpacing:\s*["']\+?\d|letterSpacing:\s*\d/g,
    );
    if (positive) offenders.push(`${file.pathname} : ${positive.join(", ")}`);
  }
  assertEquals(
    offenders,
    [],
    "utiliser tracking-mono/chip/live/label/eyebrow (ou var(--tracking-…))",
  );
});
