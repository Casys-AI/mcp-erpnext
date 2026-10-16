/** Lecture stricte du contrat serveur `_availableTools`. */

export function readAvailableTools(payload: unknown): string[] | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as { _availableTools?: unknown })._availableTools;
  if (!("_availableTools" in payload)) return undefined;
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((name): name is string =>
        typeof name === "string" && name.length > 0
      ),
    ),
  ];
}

export function hasAvailableTool(
  tools: readonly string[] | undefined,
  toolName: string,
): boolean {
  // A missing manifest means a 3.0.x payload. Those viewers historically
  // trusted serverTools and let the host return a normal unknown-tool error.
  // An explicit empty manifest remains fail-closed for modern payloads.
  return tools === undefined || tools.includes(toolName);
}

/** Un appel initié par le viewer exige les deux capacités : proxy hôte et outil. */
export function canCallViewerTool(
  serverTools: unknown,
  tools: readonly string[] | undefined,
  toolName: string,
): boolean {
  return Boolean(serverTools) && hasAvailableTool(tools, toolName);
}
