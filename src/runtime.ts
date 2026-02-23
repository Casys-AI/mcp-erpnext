/**
 * Runtime adapter — Deno implementation
 *
 * Abstracts Deno-specific APIs behind platform-agnostic functions.
 * For Node.js, the build script swaps this file with runtime.node.ts.
 *
 * @see runtime.node.ts for the Node.js implementation
 * @module lib/erpnext/src/runtime
 */

// ─── Environment ─────────────────────────────────────────

export function env(key: string): string | undefined {
  return Deno.env.get(key);
}

// ─── File System ─────────────────────────────────────────

export async function readTextFile(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

export function statSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

export function readDirSync(path: string): string[] {
  const entries: string[] = [];
  for (const entry of Deno.readDirSync(path)) {
    if (entry.isDirectory) {
      entries.push(entry.name);
    }
  }
  return entries;
}

// ─── Process ─────────────────────────────────────────────

export function getArgs(): string[] {
  return Deno.args;
}

export function exit(code: number): never {
  Deno.exit(code);
}

export function onSignal(signal: string, handler: () => void): void {
  Deno.addSignalListener(signal as Deno.Signal, handler);
}
