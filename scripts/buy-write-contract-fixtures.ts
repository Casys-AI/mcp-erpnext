/**
 * Write synthetic Buy contract fixtures for the Digital Thread worker.
 */

import { writeBuyContractFixtures } from "../src/buy/write_contract_fixtures.ts";

const written = await writeBuyContractFixtures({
  mkdir: (path) => Deno.mkdir(path, { recursive: true }),
  writeTextFile: Deno.writeTextFile,
});
console.log(
  `wrote ${written.files.length} fixtures to ${written.manifestPath}`,
);
