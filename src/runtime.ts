/**
 * Runtime adapter — selector
 *
 * Auto-detects the host runtime and forwards to the Deno or Node adapter.
 * This replaces the previous build-time file swap (runtime.ts <-
 * runtime.node.ts), which only applied to our own npm build — anyone
 * bundling the JSR source for Node would have shipped Deno.* calls.
 *
 * A dynamic import ensures the inactive adapter is never evaluated: under
 * Deno, runtime.node.ts (and its `node:fs` imports) never executes; under
 * Node, the Deno adapter never executes. Bundlers and platforms that
 * statically analyze constant-specifier dynamic imports may still include
 * both files, but only the selected one ever runs.
 *
 * @see runtime.deno.ts / runtime.node.ts for the implementations
 * @module lib/erpnext/src/runtime
 */

export type HttpHandler = (req: Request) => Response | Promise<Response>;

export interface ServeHttpOptions {
  port: number;
  hostname: string;
  onListen?: (info: { hostname: string; port: number }) => void;
}

type RuntimePort = {
  env(key: string): string | undefined;
  readTextFile(path: string): Promise<string>;
  statSync(path: string): boolean;
  readDirSync(path: string): string[];
  serveHttp(handler: HttpHandler, opts: ServeHttpOptions): Promise<void>;
  getArgs(): string[];
  exit(code: number): never;
  onSignal(signal: string, handler: () => void): void;
};

// Structural detection: a bare `globalThis.Deno = {}` shim (seen in some
// Node test setups and bundlers) must NOT be mistaken for a real Deno
// runtime, so probe a concrete field rather than mere existence.
const isDeno = typeof (globalThis as {
  Deno?: { version?: { deno?: string } };
}).Deno?.version?.deno === "string";

const impl: RuntimePort = isDeno
  ? await import("./runtime.deno.ts")
  : await import("./runtime.node.ts");

export const env = impl.env;
export const readTextFile = impl.readTextFile;
export const statSync = impl.statSync;
export const readDirSync = impl.readDirSync;
export const serveHttp = impl.serveHttp;
export const getArgs = impl.getArgs;
export const exit = impl.exit;
export const onSignal = impl.onSignal;
