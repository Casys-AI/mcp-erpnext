function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hostLocalePatch(
  event: { source: unknown; data: unknown },
  parentSource: unknown,
  initialized: boolean,
): { locale: string } | undefined {
  if (!parentSource || event.source !== parentSource) return;
  const message = event.data;
  if (!record(message) || message.jsonrpc !== "2.0") return;
  let context: unknown;
  if (
    !initialized && message.id === "mcp-init" &&
    !("error" in message) && record(message.result)
  ) {
    context = message.result.hostContext;
  } else if (
    initialized &&
    message.method === "ui/notifications/host-context-changed"
  ) {
    context = message.params;
  }
  if (!record(context) || typeof context.locale !== "string") return;
  return { locale: context.locale };
}
