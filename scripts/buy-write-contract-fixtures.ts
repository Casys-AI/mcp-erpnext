/**
 * Write synthetic Buy contract fixtures for the Digital Thread worker.
 */

import { writeBuyContractFixtures } from "../src/buy/write_contract_fixtures.ts";

const [outputRoot] = Deno.args;
if (!outputRoot) {
  throw new Error(
    "Usage: deno run -A scripts/buy-write-contract-fixtures.ts <output-directory>",
  );
}

const written = await writeBuyContractFixtures({
  mkdir: (path) => Deno.mkdir(path, { recursive: true }),
  writeTextFile: Deno.writeTextFile,
}, outputRoot);
console.log(
  `wrote ${written.files.length} fixtures to ${written.manifestPath}`,
);
