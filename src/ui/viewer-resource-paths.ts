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

interface FetchTextResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

type FetchText = (url: string) => Promise<FetchTextResponse>;

export async function readViewerDist(
  location: string,
  readLocal: (path: string) => Promise<string>,
  fetchRemote: FetchText = fetch,
): Promise<string> {
  const url = new URL(location, "file:///");
  if (!isRemoteUrl(url)) {
    return await readLocal(location);
  }

  const response = await fetchRemote(location);
  if (!response.ok) {
    throw new Error(
      `Viewer resource fetch failed (${response.status} ${response.statusText})`,
    );
  }
  return await response.text();
}
