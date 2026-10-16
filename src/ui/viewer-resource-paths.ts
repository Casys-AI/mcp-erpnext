import { ViewerResourceError } from "./viewer-errors.ts";

function fileUrlToPath(url: URL): string {
  const decodedPath = decodeURIComponent(url.pathname);

  // Windows file URLs are encoded as /C:/path and must drop the leading slash.
  if (/^\/[A-Za-z]:\//.test(decodedPath)) {
    return decodedPath.slice(1);
  }

  // UNC shares preserve the hostname when present.
  if (url.host.length > 0) {
    return `//${url.host}${decodedPath}`;
  }

  return decodedPath;
}

function isRemoteUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

export function resolveViewerDistPath(
  moduleUrl: string,
  viewerName: string,
  exists: (path: string) => boolean,
): string | null {
  const sourceDistUrl = new URL(
    `./src/ui/dist/${viewerName}/index.html`,
    moduleUrl,
  );

  // JSR keeps import.meta.url as the published https://jsr.io module URL.
  // Its package manifest already guarantees that src/ui/dist is present, so
  // preserve that URL and load the viewer lazily when resources/read is called.
  if (isRemoteUrl(sourceDistUrl)) {
    return sourceDistUrl.href;
  }

  const candidates = [
    fileUrlToPath(sourceDistUrl),
    fileUrlToPath(new URL(`./ui-dist/${viewerName}/index.html`, moduleUrl)),
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Timeout for one remote viewer fetch (headers + body), in milliseconds. */
export const VIEWER_FETCH_TIMEOUT_MS = 15_000;

export type NetPermissionState = "granted" | "denied" | "prompt";

/**
 * `hostname:port` a remote viewer location needs network access to, or null
 * for a local (file) location. The port is always explicit because Deno
 * matches `--allow-net=jsr.io:443` against "jsr.io:443", not "jsr.io".
 */
export function remoteViewerNetTarget(location: string): string | null {
  const url = new URL(location, "file:///");
  if (!isRemoteUrl(url)) return null;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.hostname}:${port}`;
}

/**
 * Only an explicit grant lets a remote viewer be announced. "prompt" counts as
 * not granted: a stdio server must never trigger an interactive prompt.
 */
export function isViewerNetAllowed(state: NetPermissionState): boolean {
  return state === "granted";
}

/** Recovery text for a missing network permission, host taken from the URL. */
export function viewerNetRecovery(hostname: string): string {
  return `Restart with --allow-net=${hostname} (for example --allow-net=jsr.io), ` +
    "or use the npm package (npx -y @casys/mcp-erpnext).";
}

interface FetchTextResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

type FetchText = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<FetchTextResponse>;

export interface ReadViewerDistOptions {
  /** Injectable fetch (tests). Defaults to the global `fetch`. */
  readonly fetchRemote?: FetchText;
  /** Injectable timeout (tests). Defaults to {@link VIEWER_FETCH_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Injectable memo (tests). Defaults to a process-wide map keyed by URL. */
  readonly cache?: Map<string, Promise<string>>;
}

// JSR URLs are versioned and immutable, so a per-process memo is safe. Bounded
// by UI_VIEWERS (one entry per viewer).
const remoteViewerCache = new Map<string, Promise<string>>();

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error
    ? String((error as { name: unknown }).name)
    : "";
}

function toViewerResourceError(
  error: unknown,
  location: string,
  timeoutMs: number,
): ViewerResourceError {
  if (error instanceof ViewerResourceError) return error;
  const url = new URL(location);
  const host = remoteViewerNetTarget(location) ?? url.host;
  const name = errorName(error);
  if (name === "TimeoutError" || name === "AbortError") {
    return new ViewerResourceError(
      "VIEWER_REMOTE_TIMEOUT",
      "Remote viewer fetch timed out",
      {
        retryable: true,
        context: { url: location, host, timeoutMs },
        recovery:
          "Retry; check network access to the host, or use the npm package (npx -y @casys/mcp-erpnext).",
      },
    );
  }
  // NotCapable (Deno 2.x) / PermissionDenied (Deno 1.x).
  if (name === "NotCapable" || name === "PermissionDenied") {
    return new ViewerResourceError(
      "VIEWER_REMOTE_PERMISSION_DENIED",
      "Network permission refused for the remote viewer",
      {
        retryable: false,
        context: { url: location, host },
        recovery: viewerNetRecovery(url.hostname),
      },
    );
  }
  return new ViewerResourceError(
    "VIEWER_REMOTE_NETWORK_ERROR",
    "Remote viewer fetch failed",
    {
      retryable: true,
      context: { url: location, host },
      recovery:
        "Retry; check network access to the host, or use the npm package (npx -y @casys/mcp-erpnext).",
    },
  );
}

async function fetchRemoteViewer(
  location: string,
  fetchRemote: FetchText,
  timeoutMs: number,
): Promise<string> {
  // One signal covers both the headers and the body read.
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchRemote(location, { signal });
    if (!response.ok) {
      const status = response.status;
      throw new ViewerResourceError(
        "VIEWER_REMOTE_HTTP_ERROR",
        "Remote viewer fetch returned an error status",
        {
          retryable: status >= 500 || status === 429,
          context: {
            url: location,
            host: remoteViewerNetTarget(location) ?? new URL(location).host,
            status,
          },
          recovery: status >= 500 || status === 429
            ? "Retry later, or use the npm package (npx -y @casys/mcp-erpnext)."
            : "Check that the published version includes src/ui/dist, or use the npm package (npx -y @casys/mcp-erpnext).",
        },
      );
    }
    // Race the body against the signal: a stalled body must not hang forever
    // even when the injected/real fetch ignores the signal after headers.
    return await new Promise<string>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      response.text().then(resolve, reject).finally(() =>
        signal.removeEventListener("abort", onAbort)
      );
    });
  } catch (error) {
    throw toViewerResourceError(error, location, timeoutMs);
  }
}

/**
 * Read a viewer's HTML. Local paths are read fresh every time (a rebuilt dist
 * must be picked up in dev). Remote URLs are fetched once per process with a
 * timeout; concurrent reads share one request and a failure is never cached.
 *
 * @throws ViewerResourceError for any remote failure (closed code list).
 */
export function readViewerDist(
  location: string,
  readLocal: (path: string) => Promise<string>,
  options: ReadViewerDistOptions = {},
): Promise<string> {
  const url = new URL(location, "file:///");
  if (!isRemoteUrl(url)) {
    return readLocal(location);
  }

  const cache = options.cache ?? remoteViewerCache;
  const cached = cache.get(location);
  if (cached) return cached;

  const pending = fetchRemoteViewer(
    location,
    options.fetchRemote ?? fetch,
    options.timeoutMs ?? VIEWER_FETCH_TIMEOUT_MS,
  );
  cache.set(location, pending);
  pending.catch(() => {
    // Only drop our own entry, never a newer retry's.
    if (cache.get(location) === pending) cache.delete(location);
  });
  return pending;
}
