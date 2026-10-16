export interface ViewerRootRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

/** A refresh preserves the root identity; a different request replaces it. */
export function viewerRootKey(
  viewer: string,
  request?: ViewerRootRequest,
  identity?: Record<string, unknown>,
): string {
  return `${viewer}:${
    stableJson(
      request
        ? { request: { name: request.toolName, args: request.arguments } }
        : { identity: identity ?? null },
    )
  }`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.keys(value as Record<string, unknown>).sort().map((k) =>
        `${JSON.stringify(k)}:${
          stableJson((value as Record<string, unknown>)[k])
        }`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value) ?? "null";
}
