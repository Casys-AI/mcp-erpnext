/**
 * Tool selection config — CLI flags and environment variables.
 *
 * | Option               | CLI flag                 | Environment variable         |
 * | -------------------- | ------------------------ | ---------------------------- |
 * | categories (allow)   | `--categories=a,b`       | `ERPNEXT_CATEGORIES`         |
 * | excludeCategories    | `--exclude-categories=a` | `ERPNEXT_EXCLUDE_CATEGORIES` |
 * | excludeTools         | `--exclude-tools=x,y`    | `ERPNEXT_EXCLUDE_TOOLS`      |
 *
 * Rules (explicit over implicit, fail fast):
 * - Per option, the CLI wins over the environment.
 * - A blank or missing environment variable is "not set" (like
 *   `ERPNEXT_METHOD_ALLOWLIST`); a blank CLI value is an error.
 * - An exclusion flag without `=` (`--exclude-tools foo`) is an error, never
 *   silently ignored: an ignored exclusion would leave a tool exposed.
 * - Legacy `--categories` without `=` stays ignored, as in 3.0.x, and now
 *   reports a warning. A valid CLI value or the environment still applies.
 * - Repeating an exclusion flag is an error. Repeating the historical
 *   `--categories` keeps its first-wins behaviour, with a warning.
 *
 * @module lib/erpnext/tools/selection-config
 */

import { env as runtimeEnv } from "../runtime.ts";
import {
  formatToolFilterMessage,
  TOOL_FILTER_ERROR_CODE,
  ToolFilterError,
  type ToolFilterWarning,
} from "./selection.ts";

export type ToolFilterSource = "cli" | "env";

export interface ToolFilterOption {
  readonly key: "categories" | "excludeCategories" | "excludeTools";
  readonly flag: string;
  readonly envVar: string;
}

export const TOOL_FILTER_OPTIONS: readonly ToolFilterOption[] = [
  {
    key: "categories",
    flag: "--categories",
    envVar: "ERPNEXT_CATEGORIES",
  },
  {
    key: "excludeCategories",
    flag: "--exclude-categories",
    envVar: "ERPNEXT_EXCLUDE_CATEGORIES",
  },
  {
    key: "excludeTools",
    flag: "--exclude-tools",
    envVar: "ERPNEXT_EXCLUDE_TOOLS",
  },
];

export interface ToolSelectionConfig {
  categories?: string[];
  excludeCategories?: string[];
  excludeTools?: string[];
  /** Where each defined option came from. */
  sources: Partial<Record<ToolFilterOption["key"], ToolFilterSource>>;
  /** Non-fatal findings (the caller logs them on stderr). */
  warnings: ToolFilterWarning[];
}

function splitList(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

function emptyValue(
  option: ToolFilterOption,
  source: ToolFilterSource,
  received: string,
): ToolFilterError {
  const where = source === "cli" ? option.flag : option.envVar;
  return new ToolFilterError(
    "EMPTY_VALUE",
    `${where} is set but contains no value`,
    {
      context: { option: option.key, source, received },
      recovery: source === "cli"
        ? `use ${option.flag}=a,b or remove the flag`
        : `set ${option.envVar}=a,b or unset it`,
    },
  );
}

/**
 * Read the three tool filters from CLI arguments and the environment.
 * Pure given its inputs: `getEnv` defaults to the runtime adapter.
 */
export function readSelectionConfig(
  args: readonly string[],
  getEnv: (key: string) => string | undefined = runtimeEnv,
): ToolSelectionConfig {
  const config: ToolSelectionConfig = { sources: {}, warnings: [] };

  for (const option of TOOL_FILTER_OPTIONS) {
    const bareIndex = args.indexOf(option.flag);
    if (bareIndex !== -1) {
      const next = args[bareIndex + 1];
      const received = next !== undefined && !next.startsWith("-")
        ? `${option.flag} ${next}`
        : option.flag;
      const detail =
        `${option.flag} needs a value in the form ${option.flag}=a,b`;
      const recovery =
        `write ${option.flag}=a,b (an equals sign, no space); the flag was not applied`;
      const context = { option: option.key, flag: option.flag, received };
      if (option.key !== "categories") {
        throw new ToolFilterError("MALFORMED_FLAG", detail, {
          context,
          recovery,
        });
      }
      config.warnings.push({
        code: TOOL_FILTER_ERROR_CODE,
        reason: "MALFORMED_FLAG",
        message: formatToolFilterMessage(`${detail} (ignored)`, recovery),
        context: Object.freeze({
          ...context,
          reason: "MALFORMED_FLAG",
          ignored: true,
        }),
        recovery,
      });
    }

    const prefix = `${option.flag}=`;
    const cliArgs = args.filter((arg) => arg.startsWith(prefix));
    let raw: string | undefined;
    let source: ToolFilterSource | undefined;

    if (cliArgs.length > 0) {
      if (cliArgs.length > 1) {
        if (option.key !== "categories") {
          throw new ToolFilterError(
            "DUPLICATE_FLAG",
            `${option.flag} is given ${cliArgs.length} times`,
            {
              context: { option: option.key, received: cliArgs },
              recovery:
                `give ${option.flag} once, with a comma-separated list (${option.flag}=a,b)`,
            },
          );
        }
        const recovery =
          `give ${option.flag} once, with a comma-separated list; only the first occurrence is used`;
        config.warnings.push({
          code: TOOL_FILTER_ERROR_CODE,
          reason: "DUPLICATE_FLAG",
          message: formatToolFilterMessage(
            `${option.flag} is given ${cliArgs.length} times (using the first)`,
            recovery,
          ),
          context: Object.freeze({
            option: option.key,
            received: cliArgs,
            reason: "DUPLICATE_FLAG",
          }),
          recovery,
        });
      }
      raw = cliArgs[0].slice(prefix.length);
      source = "cli";
      if (splitList(raw).length === 0) throw emptyValue(option, "cli", raw);
    } else {
      const fromEnv = getEnv(option.envVar);
      if (fromEnv !== undefined && fromEnv.trim() !== "") {
        raw = fromEnv;
        source = "env";
        if (splitList(raw).length === 0) throw emptyValue(option, "env", raw);
      }
    }

    if (raw !== undefined && source !== undefined) {
      config[option.key] = splitList(raw);
      config.sources[option.key] = source;
    }
  }

  return config;
}
