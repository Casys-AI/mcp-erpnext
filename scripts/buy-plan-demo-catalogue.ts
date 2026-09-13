/**
 * Offline demo catalogue planner CLI.
 *
 * Reads one preparation JSON file (schema `demo-catalogue/1.0`) and prints
 * the ordered proposed `erpnext_item_create` / `erpnext_doc_create` calls
 * as JSON. Read-only: no HTTP, no secret, no site, nothing applied.
 *
 * Usage:
 *   deno run --allow-read scripts/buy-plan-demo-catalogue.ts --input <path>
 */

import { exit, getArgs, readTextFile } from "../src/runtime.ts";
import {
  isDemoCatalogueError,
  parseDemoCatalogueCliArgs,
  planDemoCatalogueFromJson,
} from "../src/buy/demo-catalogue.ts";

function usage(): string {
  return "Usage: buy-plan-demo-catalogue.ts --input <preparation-json-path>";
}

async function main(): Promise<void> {
  let inputPath: string;
  try {
    const parsed = parseDemoCatalogueCliArgs(getArgs());
    if (parsed.help) {
      console.log(usage());
      return;
    }
    inputPath = parsed.inputPath;
  } catch (error) {
    if (isDemoCatalogueError(error)) {
      console.error(
        JSON.stringify({
          error: error.code,
          message: error.message,
          context: error.context,
          recovery: error.recovery,
        }),
      );
      exit(1);
    }
    throw error;
  }
  let text: string;
  try {
    text = await readTextFile(inputPath);
  } catch {
    console.error(
      JSON.stringify({
        error: "DEMO_CATALOGUE_UNREADABLE_INPUT",
        message: `Cannot read input file: ${inputPath}`,
        context: { inputPath },
        recovery: "Pass a readable preparation JSON file with --input <path>.",
      }),
    );
    exit(1);
  }
  try {
    console.log(JSON.stringify(planDemoCatalogueFromJson(text!), null, 2));
  } catch (error) {
    if (isDemoCatalogueError(error)) {
      console.error(
        JSON.stringify({
          error: error.code,
          message: error.message,
          context: error.context,
          recovery: error.recovery,
        }),
      );
      exit(1);
    }
    throw error;
  }
}

await main();
