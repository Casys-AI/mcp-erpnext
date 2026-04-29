// deno-lint-ignore-file no-process-global
/**
 * Runtime adapter — Node.js implementation
 *
 * Selected automatically by runtime.ts (the selector) when running under
 * Node.js.
 *
 * @see runtime.deno.ts for the Deno implementation
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

// ─── HTTP Server ─────────────────────────────────────────

export type HttpHandler = (req: Request) => Response | Promise<Response>;

export interface ServeHttpOptions {
  port: number;
  hostname: string;
  onListen?: (info: { hostname: string; port: number }) => void;
}

/**
 * Start an HTTP server with the given fetch-compatible handler (Node.js implementation).
 * Uses node:http and manually bridges Node IncomingMessage ↔ Web Request/Response.
 * Returns a promise that resolves when the server closes.
 */
export async function serveHttp(
  handler: HttpHandler,
  opts: ServeHttpOptions,
): Promise<void> {
  const { createServer } = await import("node:http");
  return new Promise<void>((_, reject) => {
    const server = createServer(async (req, res) => {
      // Buffer request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const rawBody = Buffer.concat(chunks);

      const host = req.headers.host ?? `${opts.hostname}:${opts.port}`;
      const url = `http://${host}${req.url ?? "/"}`;

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) v.forEach((vi) => headers.append(k, vi));
      }

      const method = req.method ?? "GET";
      const webReq = new Request(url, {
        method,
        headers,
        body: ["GET", "HEAD"].includes(method) ? undefined : rawBody,
      });

      try {
        const webRes = await handler(webReq);
        res.statusCode = webRes.status;
        webRes.headers.forEach((v, k) => res.setHeader(k, v));
        const buf = Buffer.from(await webRes.arrayBuffer());
        res.end(buf);
      } catch (err) {
        res.statusCode = 500;
        res.end("Internal Server Error");
        reject(err);
      }
    });

    server.listen(opts.port, opts.hostname, () => {
      opts.onListen?.({ hostname: opts.hostname, port: opts.port });
    });
    server.on("error", reject);
  });
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
