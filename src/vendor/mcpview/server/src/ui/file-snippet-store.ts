import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  copySnippetLayout,
  isSnippetParameters,
  type SnippetStore,
  type SnippetSummary,
  snippetSummary,
  type StoredSnippet,
} from "./snippets.ts";

const encoder = new TextEncoder();

async function key(value: string): Promise<string> {
  // JSON escaping keeps distinct JavaScript strings, including lone surrogates, distinct.
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(JSON.stringify(value)),
  );
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

async function readSnippet(path: string): Promise<StoredSnippet | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
  const value = JSON.parse(text) as Partial<StoredSnippet> | null;
  if (
    !value || typeof value.name !== "string" ||
    typeof value.code !== "string" ||
    (value.description !== undefined &&
      typeof value.description !== "string") ||
    (value.parameters !== undefined && !isSnippetParameters(value.parameters))
  ) {
    throw new TypeError("Invalid stored snippet");
  }
  return {
    name: value.name,
    code: value.code,
    description: value.description,
    parameters: value.parameters,
    ...(value.layout === undefined
      ? {}
      : { layout: copySnippetLayout(value.layout) }),
  };
}

/**
 * Local durable store for a trusted, host-owned directory. Each snippet is
 * written to a private temporary file. New records use an atomic hard link.
 * Updating a layout atomically replaces the existing file by rename.
 * The backing filesystem must support hard links in this directory.
 */
export function createFileSnippetStore(directory: string): SnippetStore {
  if (!directory) throw new TypeError("Snippet store directory is required");
  const root = resolve(directory);
  const scopePath = async (scope: string) => join(root, await key(scope));
  const snippetFile = async (name: string) => `${await key(name)}.json`;

  async function get(scope: string, name: string) {
    const entry = await readSnippet(
      join(await scopePath(scope), await snippetFile(name)),
    );
    if (entry && entry.name !== name) {
      throw new TypeError("Invalid stored snippet name");
    }
    return entry;
  }

  async function publish(
    dir: string,
    snippet: StoredSnippet,
    replace: boolean,
  ) {
    const path = join(dir, await snippetFile(snippet.name));
    const temporary = join(dir, `.${crypto.randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try {
      try {
        await file.writeFile(JSON.stringify(snippet));
      } finally {
        await file.close();
      }
      if (replace) {
        await rename(temporary, path);
      } else {
        try {
          await link(temporary, path);
        } catch (error) {
          if (errorCode(error) !== "EEXIST") throw error;
          const existing = await readSnippet(path);
          if (existing?.name === snippet.name) return existing;
          throw new TypeError("Invalid stored snippet name");
        }
      }
      return snippet;
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  return {
    async putIfAbsent(scope, snippet) {
      const dir = await scopePath(scope);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      return await publish(dir, snippet, false);
    },
    async replaceLayout(scope, name, layout) {
      const previous = await get(scope, name);
      if (!previous) return undefined;
      // Name, program and parameter contract are immutable. A rename commits one
      // entire layout, even when another host process updates the same snippet.
      return await publish(
        await scopePath(scope),
        { ...previous, layout },
        true,
      );
    },
    get,
    async list(scope) {
      const dir = await scopePath(scope);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch (error) {
        if (errorCode(error) === "ENOENT") return [];
        throw error;
      }
      const summaries: SnippetSummary[] = [];
      for (const file of files) {
        if (!/^[\da-f]{64}\.json$/.test(file)) continue;
        const entry = await readSnippet(join(dir, file));
        if (!entry || await snippetFile(entry.name) !== file) {
          throw new TypeError("Invalid stored snippet name");
        }
        summaries.push(snippetSummary(entry));
      }
      return summaries;
    },
  };
}
