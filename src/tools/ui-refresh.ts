interface UiMetadata {
  ui?: {
    resourceUri?: string;
  };
}

interface UiRefreshRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

interface UiRefreshableResult {
  _meta?: UiMetadata;
  refreshRequest?: UiRefreshRequest;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasUiResource(result: Record<string, unknown>): boolean {
  const meta = result._meta;
  if (!isRecord(meta)) return false;
  const ui = meta.ui;
  if (!isRecord(ui)) return false;
  return typeof ui.resourceUri === "string" && ui.resourceUri.length > 0;
}

export function withUiRefreshRequest(
  result: unknown,
  toolName: string,
  args: Record<string, unknown>,
): unknown {
  if (!isRecord(result) || !hasUiResource(result)) {
    return result;
  }

  const refreshable = result as UiRefreshableResult;
  if (refreshable.refreshRequest) {
    return result;
  }

  return {
    ...refreshable,
    refreshRequest: {
      toolName,
      arguments: { ...args },
    },
  } satisfies UiRefreshableResult;
}
