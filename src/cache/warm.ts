/**
 * Cache warming.
 *
 * Optionally pre-populates the cache on server startup so the first real
 * tool call in a session isn't a cold miss.
 *
 * @module lib/erpnext/cache/warm
 */

import { allTools } from "../tools/mod.ts";
import type { ErpNextTool } from "../tools/types.ts";
import { getFrappeClient } from "../api/frappe-client.ts";
import { env } from "../runtime.ts";

/**
 * Warm the cache by calling a configured set of read-only `_list` tools with
 * no filters. Calling the real tool handler — rather than client.list()
 * directly — guarantees the cache key matches exactly what a real unfiltered
 * "list X" call will use (same fields/limit/order_by), so the warmed entry
 * is actually a hit later.
 *
 * Configured via MCP_CACHE_WARM_TOOLS (comma-separated tool names). Unset or
 * empty disables warming entirely — no behavior change by default. Never
 * throws: every failure (unknown tool, tool outside the active selection,
 * non-read-only tool, network error) is logged and skipped so one bad entry
 * can't abort the rest or the server.
 *
 * Names are resolved against `activeTools` (the tools the server actually
 * exposes, after --categories/--exclude-*), so an excluded tool is never
 * executed at startup. Defaults to every tool for standalone callers.
 */
export async function warmCache(
  activeTools: readonly ErpNextTool[] = allTools,
): Promise<void> {
  const configured = env("MCP_CACHE_WARM_TOOLS");
  if (!configured?.trim()) return;

  const client = getFrappeClient();
  const names = configured.split(",").map((s) => s.trim()).filter(Boolean);

  for (const name of names) {
    const tool = activeTools.find((t) => t.name === name);
    if (!tool) {
      console.error(
        allTools.some((t) => t.name === name)
          ? `[mcp-erpnext] Cache warm: "${name}" is not in active tool selection, skipping`
          : `[mcp-erpnext] Cache warm: unknown tool "${name}", skipping`,
      );
      continue;
    }
    if (!tool.annotations?.readOnlyHint) {
      console.error(
        `[mcp-erpnext] Cache warm: "${name}" is not read-only, refusing to call it, skipping`,
      );
      continue;
    }
    try {
      await tool.handler({}, { client });
    } catch (err) {
      console.error(
        `[mcp-erpnext] Cache warm: "${name}" failed (non-fatal):`,
        err,
      );
    }
  }
}
