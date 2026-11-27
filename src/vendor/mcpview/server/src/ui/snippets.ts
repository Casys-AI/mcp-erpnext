/** Host-side catalog for explicitly saved, successful code-mode executions. */

import { isDeepStrictEqual } from "node:util";

const parameterTypes = [
  "string",
  "number",
  "boolean",
  "null",
  "array",
  "object",
] as const;

export type SnippetParameterType = typeof parameterTypes[number];

/** Exact top-level keys and JSON kinds observed on the successful execution. */
export type SnippetParameters = Readonly<Record<string, SnippetParameterType>>;

export interface SnippetSummary {
  /** Stable within the authenticated scope. Equal to the case-sensitive name. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly parameters?: SnippetParameters;
}

/** Host-validated dashboard geometry, serialized as a JSON object. */
export type SnippetLayout = Readonly<Record<string, unknown>>;

export interface StoredSnippet extends Omit<SnippetSummary, "id"> {
  readonly code: string;
  readonly layout?: SnippetLayout;
}

/** Backing storage is private to the host. Implementations must isolate scopes. */
export interface SnippetStore {
  /** Atomically insert by (scope, name), or return the existing record. */
  putIfAbsent(scope: string, snippet: StoredSnippet): Promise<StoredSnippet>;
  /** Atomically replace only the layout of an existing record. Concurrent updates are last-write-wins. */
  replaceLayout?(
    scope: string,
    name: string,
    layout: SnippetLayout,
  ): Promise<StoredSnippet | undefined>;
  get(scope: string, name: string): Promise<StoredSnippet | undefined>;
  list(scope: string): Promise<readonly SnippetSummary[]>;
}

export interface SnippetCatalogOptions {
  readonly store?: SnippetStore;
  /** How long a successful execution remains eligible for saving. Defaults to ten minutes. */
  readonly referenceTtlMs?: number;
  /** Maximum eligible executions retained in this process. Defaults to 1024. */
  readonly maxPendingReferences?: number;
}

export interface SnippetRunner<Params, Result> {
  /** Validate the current inputs under the host's rules before starting execution. */
  validate(
    input: unknown,
    parameters?: SnippetParameters,
  ): Params | Promise<Params>;
  /** Use the current authorized sandbox, tool bindings, and result handling. */
  execute(
    code: string,
    params: Params,
    layout?: SnippetLayout,
  ): Result | Promise<Result>;
}

export interface SnippetCatalog {
  /**
   * Call only from the trusted executor after successful completion. Source
   * over 64 KiB or a parameter contract over 32 keys or 128 UTF-8 bytes per key
   * yields EXECUTION_NOT_ELIGIBLE. Omit the reference and return the successful
   * result to the caller when recording is ineligible.
   */
  recordSuccess(
    scope: string,
    code: string,
    params?: Readonly<Record<string, unknown>>,
  ): string;
  /** Call after explicit authorization to save this recorded execution. */
  save(
    scope: string,
    executionRef: string,
    name: string,
    description?: string,
    layout?: SnippetLayout,
  ): Promise<SnippetSummary>;
  /** Explicitly apply a dashboard layout to the same successfully run program. */
  updateLayout?(
    scope: string,
    executionRef: string,
    name: string,
    layout: SnippetLayout,
  ): Promise<SnippetSummary>;
  list(scope: string): Promise<SnippetSummary[]>;
  inspect(scope: string, name: string): Promise<StoredSnippet>;
  run<Params, Result>(
    scope: string,
    snippetId: string,
    input: unknown,
    runner: SnippetRunner<Params, Result>,
  ): Promise<Result>;
}

export type SnippetCatalogErrorCode =
  | "EXECUTION_NOT_ELIGIBLE"
  | "EXECUTION_NOT_FOUND"
  | "SNIPPET_NOT_FOUND"
  | "SNIPPET_NAME_CONFLICT"
  | "SNIPPET_UPDATE_UNSUPPORTED";

export class SnippetCatalogError extends Error {
  constructor(readonly code: SnippetCatalogErrorCode, message: string) {
    super(message);
    this.name = "SnippetCatalogError";
  }
}

interface RecordedExecution {
  readonly scope: string;
  readonly code: string;
  readonly expiresAt: number;
  readonly parameters?: SnippetParameters;
}

function createMemorySnippetStore(): SnippetStore {
  const scopes = new Map<string, Map<string, StoredSnippet>>();
  return {
    putIfAbsent(scope, snippet) {
      let entries = scopes.get(scope);
      if (!entries) {
        entries = new Map();
        scopes.set(scope, entries);
      }
      const existing = entries.get(snippet.name);
      if (existing) return Promise.resolve(existing);
      const stored = { ...snippet };
      entries.set(stored.name, stored);
      return Promise.resolve(stored);
    },
    replaceLayout(scope, name, layout) {
      const entries = scopes.get(scope);
      const previous = entries?.get(name);
      if (!entries || !previous) return Promise.resolve(undefined);
      const updated = { ...previous, layout };
      entries.set(name, updated);
      return Promise.resolve(updated);
    },
    get: (scope, name) => Promise.resolve(scopes.get(scope)?.get(name)),
    list: (scope) =>
      Promise.resolve(
        Array.from(scopes.get(scope)?.values() ?? [], snippetSummary),
      ),
  };
}

function requireScope(scope: string): void {
  if (typeof scope !== "string" || !scope.trim()) {
    throw new TypeError("Snippets require an authenticated scope");
  }
}

function requireName(name: string): void {
  if (typeof name !== "string" || !name || name !== name.trim()) {
    throw new TypeError(
      "Snippet names must be non-empty and have no surrounding whitespace",
    );
  }
  if (!fitsUtf8Limit(name, maxNameBytes)) {
    throw new TypeError("Snippet names must be at most 256 UTF-8 bytes");
  }
}

function isParameterType(value: unknown): value is SnippetParameterType {
  return parameterTypes.some((type) => type === value);
}

export function isSnippetParameters(
  value: unknown,
): value is SnippetParameters {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every(isParameterType);
}

const encoder = new TextEncoder();
const maxCodeBytes = 64 * 1024;
const maxParameterKeys = 32;
const maxParameterKeyBytes = 128;
const maxNameBytes = 256;
const maxDescriptionBytes = 512;

function fitsUtf8Limit(value: string, maxBytes: number): boolean {
  return value.length <= maxBytes &&
    encoder.encode(value).byteLength <= maxBytes;
}

/** Copy only a bounded JSON object so mutable renderer state never aliases a saved layout. */
export function copySnippetLayout(value: unknown): SnippetLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Snippet layout must be a JSON object");
  }
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (
      item === null || typeof item === "string" || typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item)) ||
      Array.isArray(item) ||
      (typeof item === "object" &&
        (Object.getPrototypeOf(item) === Object.prototype ||
          Object.getPrototypeOf(item) === null))
    ) return item;
    throw new TypeError("Snippet layout must contain only JSON values");
  });
  if (!fitsUtf8Limit(json, 64 * 1024)) {
    throw new TypeError("Snippet layout exceeds 64 KiB");
  }
  const copy = JSON.parse(json);
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) {
    throw new TypeError("Snippet layout must be a JSON object");
  }
  return copy;
}

function ineligible(message: string): SnippetCatalogError {
  return new SnippetCatalogError("EXECUTION_NOT_ELIGIBLE", message);
}

function describeParameters(
  params: Readonly<Record<string, unknown>>,
): SnippetParameters {
  const entries: [string, SnippetParameterType][] = [];
  for (const name in params) {
    if (!Object.hasOwn(params, name)) continue;
    if (
      entries.length >= maxParameterKeys ||
      !fitsUtf8Limit(name, maxParameterKeyBytes)
    ) {
      throw ineligible("Snippet parameter contract exceeds its size limit");
    }
    const value = params[name];
    const type = value === null
      ? "null"
      : Array.isArray(value)
      ? "array"
      : typeof value;
    if (
      !isParameterType(type) || (type === "number" && !Number.isFinite(value))
    ) {
      throw ineligible("Snippet parameters must have JSON values");
    }
    entries.push([name, type]);
  }
  return Object.fromEntries(entries);
}

function sameParameters(
  left?: SnippetParameters,
  right?: SnippetParameters,
): boolean {
  if (!left || !right) return left === right;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && left[key] === right[key]);
}

export function snippetSummary(
  { name, parameters, description }: StoredSnippet,
): SnippetSummary {
  return {
    id: name,
    name,
    ...(description === undefined ? {} : { description }),
    ...(parameters === undefined ? {} : { parameters: { ...parameters } }),
  };
}

/**
 * Create a catalog without exposing an MCP tool. Pass a scope derived from
 * authenticated server context to every method, for example a tuple of tenant,
 * principal and integration serialized by the caller. Treat stored source as
 * private and call run with the same authorization as a fresh execution.
 */
export function createSnippetCatalog(
  options: SnippetCatalogOptions = {},
): Required<SnippetCatalog> {
  const store = options.store ?? createMemorySnippetStore();
  const referenceTtlMs = options.referenceTtlMs ?? 10 * 60_000;
  const maxPendingReferences = options.maxPendingReferences ?? 1024;
  for (const value of [referenceTtlMs, maxPendingReferences]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(
        "Snippet reference limits must be positive safe integers",
      );
    }
  }
  const executions = new Map<string, RecordedExecution>();

  async function getSnippet(
    scope: string,
    name: string,
  ): Promise<StoredSnippet> {
    requireScope(scope);
    requireName(name);
    const snippet = await store.get(scope, name);
    if (!snippet) {
      throw new SnippetCatalogError("SNIPPET_NOT_FOUND", "Snippet not found");
    }
    return snippet;
  }

  function getExecution(scope: string, ref: string): RecordedExecution {
    const record = executions.get(ref);
    if (!record || record.scope !== scope || record.expiresAt <= Date.now()) {
      throw new SnippetCatalogError(
        "EXECUTION_NOT_FOUND",
        "Successful execution not found",
      );
    }
    return record;
  }

  function requireSameProgram(
    stored: StoredSnippet,
    record: RecordedExecution,
  ): void {
    if (
      stored.code !== record.code ||
      !sameParameters(stored.parameters, record.parameters)
    ) {
      throw new SnippetCatalogError(
        "SNIPPET_NAME_CONFLICT",
        "Snippet name already in use by a different program",
      );
    }
  }

  return {
    recordSuccess(scope, code, params) {
      requireScope(scope);
      if (!fitsUtf8Limit(code, maxCodeBytes)) {
        throw ineligible("Snippet source exceeds its size limit");
      }
      const parameters = params === undefined
        ? undefined
        : describeParameters(params);
      const now = Date.now();
      for (const [ref, record] of executions) {
        if (record.expiresAt > now && executions.size < maxPendingReferences) {
          break;
        }
        executions.delete(ref);
      }
      const ref = crypto.randomUUID();
      executions.set(ref, {
        code,
        scope,
        parameters,
        expiresAt: now + referenceTtlMs,
      });
      return ref;
    },
    async save(scope, executionRef, name, description, layout) {
      requireScope(scope);
      requireName(name);
      if (
        description !== undefined &&
        (typeof description !== "string" ||
          !fitsUtf8Limit(description, maxDescriptionBytes))
      ) {
        throw new TypeError(
          "Snippet descriptions must be at most 512 UTF-8 bytes",
        );
      }
      const record = getExecution(scope, executionRef);
      const initialLayout = layout === undefined
        ? undefined
        : copySnippetLayout(layout);
      const stored = await store.putIfAbsent(scope, {
        name,
        code: record.code,
        description,
        parameters: record.parameters,
        ...(initialLayout === undefined ? {} : { layout: initialLayout }),
      });
      requireSameProgram(stored, record);
      if (initialLayout && !isDeepStrictEqual(initialLayout, stored.layout)) {
        throw new SnippetCatalogError(
          "SNIPPET_NAME_CONFLICT",
          "Snippet already exists with a different layout. Request a layout update.",
        );
      }
      return snippetSummary(stored);
    },
    async updateLayout(scope, executionRef, name, layout) {
      requireScope(scope);
      const record = getExecution(scope, executionRef);
      const previous = await getSnippet(scope, name);
      requireSameProgram(previous, record);
      if (!store.replaceLayout) {
        throw new SnippetCatalogError(
          "SNIPPET_UPDATE_UNSUPPORTED",
          "This snippet store does not support layout updates",
        );
      }
      const updated = await store.replaceLayout(
        scope,
        name,
        copySnippetLayout(layout),
      );
      if (!updated) {
        throw new SnippetCatalogError("SNIPPET_NOT_FOUND", "Snippet not found");
      }
      return snippetSummary(updated);
    },
    async list(scope) {
      requireScope(scope);
      return [...await store.list(scope)].sort((left, right) => {
        if (left.name === right.name) return 0;
        return left.name < right.name ? -1 : 1;
      });
    },
    async inspect(scope, name) {
      const snippet = await getSnippet(scope, name);
      const { name: storedName, description, parameters } = snippetSummary(
        snippet,
      );
      return {
        name: storedName,
        code: snippet.code,
        ...(snippet.layout === undefined
          ? {}
          : { layout: copySnippetLayout(snippet.layout) }),
        ...(description === undefined ? {} : { description }),
        ...(parameters === undefined ? {} : { parameters }),
      };
    },
    async run(scope, snippetId, input, runner) {
      const snippet = await getSnippet(scope, snippetId);
      const params = await runner.validate(
        input,
        snippetSummary(snippet).parameters,
      );
      return snippet.layout === undefined
        ? await runner.execute(snippet.code, params)
        : await runner.execute(
          snippet.code,
          params,
          copySnippetLayout(snippet.layout),
        );
    },
  };
}
