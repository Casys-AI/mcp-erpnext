const parameterTypes = [
  "string",
  "number",
  "boolean",
  "null",
  "array",
  "object",
] as const;
export type ParameterType = typeof parameterTypes[number];

interface SnippetDetails {
  name: string;
  description?: string;
  parameters?: Record<string, ParameterType>;
}

export interface Snippet extends SnippetDetails {
  id: string;
}

export interface SnippetSource extends SnippetDetails {
  code: string;
}

type Metadata = {
  isError?: boolean;
  _meta?: Record<string, unknown>;
  structuredContent?: unknown;
};

export type SnippetEvent =
  | { kind: "saved" | "updated"; snippet: Snippet }
  | { kind: "list"; snippets: Snippet[] }
  | { kind: "source"; snippet: SnippetSource };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasSnippetDetails(
  value: Record<string, unknown>,
): value is Record<string, unknown> & SnippetDetails {
  return typeof value.name === "string" && !!value.name &&
    (value.description === undefined ||
      typeof value.description === "string") &&
    (value.parameters === undefined ||
      (isObject(value.parameters) &&
        Object.values(value.parameters).every((type) =>
          parameterTypes.some((valid) => valid === type)
        )));
}

function isSnippet(value: unknown): value is Snippet {
  return isObject(value) && hasSnippetDetails(value) &&
    typeof value.id === "string" && !!value.id;
}

function isSnippetSource(value: unknown): value is SnippetSource {
  return isObject(value) && hasSnippetDetails(value) &&
    typeof value.code === "string";
}

export function snippetEvent(result: Metadata): SnippetEvent | undefined {
  if (result.isError) return;
  const event = result._meta?.["io.casys/erpnext-snippet-event"];
  const structured = result.structuredContent;
  const value = isObject(structured) ? structured.value : undefined;
  if ((event === "saved" || event === "updated") && isSnippet(value)) {
    return { kind: event, snippet: value };
  }
  if (event === "list" && Array.isArray(value) && value.every(isSnippet)) {
    return { kind: "list", snippets: value };
  }
  if (event === "source" && isSnippetSource(value)) {
    return { kind: "source", snippet: value };
  }
}
