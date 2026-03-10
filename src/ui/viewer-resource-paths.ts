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

export function resolveViewerDistPath(
  moduleUrl: string,
  viewerName: string,
  exists: (path: string) => boolean,
): string | null {
  const candidates = [
    fileUrlToPath(new URL(`./src/ui/dist/${viewerName}/index.html`, moduleUrl)),
    fileUrlToPath(new URL(`./ui-dist/${viewerName}/index.html`, moduleUrl)),
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return null;
}
