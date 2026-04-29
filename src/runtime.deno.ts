/**
 * Runtime adapter — Deno implementation
 *
 * Abstracts Deno-specific APIs behind platform-agnostic functions.
 * Selected automatically by runtime.ts (the selector) when running under Deno.
 *
 * @see runtime.node.ts for the Node.js implementation
 * @module lib/erpnext/src/runtime.deno
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

// ─── HTTP Server ─────────────────────────────────────────

export type HttpHandler = (req: Request) => Response | Promise<Response>;

export interface ServeHttpOptions {
  port: number;
  hostname: string;
  onListen?: (info: { hostname: string; port: number }) => void;
}

/**
 * Start an HTTP server with the given fetch-compatible handler.
 * Returns a promise that resolves when the server closes.
 */
export async function serveHttp(
  handler: HttpHandler,
  opts: ServeHttpOptions,
): Promise<void> {
  await Deno.serve(
    { port: opts.port, hostname: opts.hostname, onListen: opts.onListen },
    handler,
  ).finished;
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
