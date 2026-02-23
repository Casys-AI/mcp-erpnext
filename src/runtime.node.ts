// deno-lint-ignore-file no-process-global no-node-globals
/**
 * Runtime adapter — Node.js implementation
 *
 * Drop-in replacement for runtime.ts (Deno) — swapped by build-node.sh.
 *
 * @see runtime.ts for the Deno implementation
 * @module lib/erpnext/src/runtime.node
 */

import { readdirSync, statSync as fsStatSync } from "node:fs";
import { readFile } from "node:fs/promises";

// ─── Environment ─────────────────────────────────────────

export function env(key: string): string | undefined {
  return process.env[key];
}

// ─── File System ─────────────────────────────────────────

export async function readTextFile(path: string): Promise<string> {
  return await readFile(path, "utf-8");
}

export function statSync(path: string): boolean {
  try {
    fsStatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function readDirSync(path: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      entries.push(entry.name);
    }
  }
  return entries;
}

// ─── Process ─────────────────────────────────────────────

export function getArgs(): string[] {
  return process.argv.slice(2);
}

export function exit(code: number): never {
  process.exit(code);
}

export function onSignal(signal: string, handler: () => void): void {
  process.on(signal, handler);
}
