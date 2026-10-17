import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import singleViewerConfig from "../vite.single.config.mjs";

if (process.env.UI_NAME !== "dev-host") {
  throw new Error("UI_NAME=dev-host is required for the local ERPNext host");
}

const hostRoot = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(hostRoot, "..");
const repoRoot = resolve(hostRoot, "../../..");
const backendPort = 3216;
const frontendPort = 5177;
const viewers = new Set([
  "invoice-viewer",
  "stock-viewer",
  "doclist-viewer",
  "doc-viewer",
  "chart-viewer",
  "kpi-viewer",
  "funnel-viewer",
  "kanban-viewer",
  "buy-evidence-viewer",
]);
const erpKeys = ["ERPNEXT_URL", "ERPNEXT_API_KEY", "ERPNEXT_API_SECRET"];
const hopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function safeProcessEnv() {
  const env = {};
  for (
    const key of [
      "PATH",
      "HOME",
      "TMPDIR",
      "TEMP",
      "TMP",
      "LANG",
      "LC_ALL",
      "TZ",
      "DENO_DIR",
      "XDG_CACHE_HOME",
      "SystemRoot",
      "WINDIR",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
    ]
  ) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

async function backendEnv() {
  const env = safeProcessEnv();
  let dotenv = "";
  try {
    dotenv = await readFile(resolve(repoRoot, ".env"), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const line of dotenv.split(/\r?\n/)) {
    const match =
      /^\s*(?:export\s+)?(ERPNEXT_URL|ERPNEXT_API_KEY|ERPNEXT_API_SECRET)\s*=\s*(.*)$/
        .exec(
          line,
        );
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.trim();
    env[key] = /^(["']).*\1$/.test(value)
      ? value.slice(1, -1)
      : value.replace(/\s+#.*$/, "").trim();
  }
  for (const key of erpKeys) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.MCP_CACHE_ENABLED = "false";
  return env;
}

function assertBackendPortFree() {
  return new Promise((resolveReady, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(backendPort, "127.0.0.1", () => {
      probe.close((error) => error ? reject(error) : resolveReady());
    });
  });
}

function stopOwnedChild(child, signal = "SIGTERM") {
  if (
    !child || typeof child.pid !== "number" || child.exitCode !== null ||
    child.signalCode !== null
  ) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function localErpNextHost() {
  const backendToken = randomBytes(32).toString("hex");
  let vite;
  let backend;
  let builder;
  let starting;
  let buildPromise;
  let buildQueued = false;
  let buildFailed = false;
  let debounce;
  let closing = false;
  let closePromise;

  const log = (message) =>
    vite?.config.logger.info(`[erpnext-dev-host] ${message}`);
  const buildEvent = (success) => {
    if (closing) return;
    vite.ws.send({
      type: "custom",
      event: "erpnext-viewers-built",
      data: success ? { success: true } : {
        success: false,
        error: "Viewer build failed; check the local terminal.",
      },
    });
  };

  function isViewerSource(path) {
    const parts = path.split("/");
    if (
      parts.some((part) =>
        [
          "dev-host",
          "node_modules",
          "dist",
          ".build-meta",
          "tests",
          "__tests__",
        ]
          .includes(part)
      ) ||
      /(?:^|\/)(?:test(?:-.*)?|.*_test|.*\.test|.*\.spec|.*\.bench)\.[^/]+$/
        .test(path)
    ) return false;
    return [
      "build-all.mjs",
      "vite.single.config.mjs",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
    ]
      .includes(path) ||
      (parts[0] === "shared" || viewers.has(parts[0])) &&
        /\.(?:[cm]?[jt]sx?|css|html|json|woff2?|ttf|otf|svg|png|jpe?g|webp)$/
          .test(path);
  }

  async function hasFreshViewers() {
    const built = await Promise.all([...viewers].map(async (viewer) => {
      try {
        const file = await stat(resolve(uiRoot, "dist", viewer, "index.html"));
        return file.isFile() && file.size > 0 ? file.mtimeMs : 0;
      } catch {
        return 0;
      }
    }));
    const oldestBuild = Math.min(...built);
    if (!oldestBuild) return false;
    for (
      const file of [
        "build-all.mjs",
        "vite.single.config.mjs",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
      ]
    ) {
      if ((await stat(resolve(uiRoot, file))).mtimeMs > oldestBuild) {
        return false;
      }
    }
    const dirs = ["shared", ...viewers].map((dir) => resolve(uiRoot, dir));
    while (dirs.length) {
      const dir = dirs.pop();
      for (const file of await readdir(dir, { withFileTypes: true })) {
        if (
          ["node_modules", "dist", ".build-meta", "tests", "__tests__"]
            .includes(file.name)
        ) continue;
        const fullPath = resolve(dir, file.name);
        if (file.isDirectory()) dirs.push(fullPath);
        else if (file.isFile()) {
          const path = relative(uiRoot, fullPath).split(sep).join("/");
          if (
            isViewerSource(path) && (await stat(fullPath)).mtimeMs > oldestBuild
          ) return false;
        }
      }
    }
    return true;
  }

  function runBuild() {
    return new Promise((resolveBuild) => {
      const env = safeProcessEnv();
      env.npm_config_offline = "true";
      env.npm_config_yes = "false";
      builder = spawn("node", [resolve(uiRoot, "build-all.mjs")], {
        cwd: uiRoot,
        env,
        stdio: "inherit",
        detached: process.platform !== "win32",
      });
      const ownedBuilder = builder;
      let settled = false;
      const settle = (success) => {
        if (settled) return;
        settled = true;
        if (builder === ownedBuilder) builder = undefined;
        resolveBuild(success);
      };
      ownedBuilder.once("error", () => settle(false));
      ownedBuilder.once("exit", (code) => settle(code === 0));
    });
  }

  async function revalidateViewerRegistration() {
    if (!backend || closing) return;
    await waitForBackend();
    const response = await fetch(`http://127.0.0.1:${backendPort}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${backendToken}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "resources/list",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dev-host-viewer-registration",
        method: "resources/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error("Viewer registration unavailable");
    }
    const uris = new Set(
      result.result?.resources?.map((resource) => resource.uri),
    );
    if (
      [...viewers].every((viewer) => uris.has(`ui://mcp-erpnext/${viewer}`))
    ) return;
    log(
      "Restoring viewer registration after a backend restart during the build.",
    );
    const previous = backend;
    stopOwnedChild(previous);
    await Promise.race([
      new Promise((resolveExit) => previous.once("exit", resolveExit)),
      sleep(2_000),
    ]);
    stopOwnedChild(previous, "SIGKILL");
    backend = undefined;
    if (closing) return;
    starting = startBackend(false);
    if (!(await starting)) {
      throw new Error("Viewer registration could not restart");
    }
  }

  function drainBuildQueue() {
    if (buildPromise) return buildPromise;
    if (!buildQueued || closing) return Promise.resolve(!buildFailed);
    clearTimeout(debounce);
    buildPromise = (async () => {
      while (buildQueued && !closing) {
        buildQueued = false;
        log("Rebuilding viewers…");
        buildFailed = !(await runBuild());
        if (!buildFailed && !closing) {
          try {
            await revalidateViewerRegistration();
          } catch {
            buildFailed = true;
          }
        }
        if (!closing) {
          log(buildFailed ? "Viewer build failed." : "Viewers rebuilt.");
        }
      }
      if (!closing) buildEvent(!buildFailed);
      return !buildFailed;
    })().finally(() => {
      buildPromise = undefined;
    });
    return buildPromise;
  }

  function scheduleBuild(file) {
    const path = relative(uiRoot, file).split(sep).join("/");
    if (path.startsWith("../") || path === "..") return;
    if (!isViewerSource(path)) return;
    buildQueued = true;
    clearTimeout(debounce);
    debounce = setTimeout(() => void drainBuildQueue(), 250);
  }

  async function waitForBuild() {
    if (!(await drainBuildQueue())) {
      throw new Error("Viewer build failed");
    }
  }

  async function waitForBackend() {
    const deadline = Date.now() + 10_000;
    while (!closing && Date.now() < deadline) {
      if (
        !backend || typeof backend.pid !== "number" ||
        backend.exitCode !== null || backend.signalCode !== null
      ) break;
      try {
        const response = await fetch(`http://127.0.0.1:${backendPort}/health`, {
          signal: AbortSignal.timeout(500),
        });
        await response.arrayBuffer();
        if (response.ok) return;
      } catch {
        // The owned Deno watcher can briefly close its listener during a restart.
      }
      await sleep(100);
    }
    throw new Error("Local ERPNext backend is not ready");
  }

  async function startBackend(checkBuild = true) {
    try {
      await assertBackendPortFree();
      if (checkBuild && !(await hasFreshViewers())) {
        buildQueued = true;
        await waitForBuild();
      }
      if (closing) return false;
      const env = await backendEnv();
      env.MCP_AUTH_TOKEN = backendToken;
      env.MCP_AUTH_RESOURCE = `http://127.0.0.1:${backendPort}/mcp`;
      if (closing) return false;
      // Deno follows imported server sources automatically. Watching all of src
      // also reacts to dist directory replacement, even when its files are excluded.
      backend = spawn("deno", [
        "run",
        "-A",
        "--watch=server.ts",
        `--watch-exclude=src/ui/dist/**,src/ui/.build-meta/**,src/ui/node_modules/**,src/ui/dev-host/**,src/ui/shared/**,${
          [...viewers].map((viewer) => `src/ui/${viewer}/**`).join(",")
        },src/**/*_test.ts,src/**/*.test.ts`,
        "--no-clear-screen",
        "server.ts",
        "--http",
        `--port=${backendPort}`,
        "--hostname=127.0.0.1",
      ], {
        cwd: repoRoot,
        env,
        stdio: "inherit",
        detached: process.platform !== "win32",
      });
      backend.once("error", () => {
        log("Local ERPNext backend could not start.");
      });
      await waitForBackend();
      log(`Local ERPNext backend ready on http://127.0.0.1:${backendPort}.`);
      return true;
    } catch {
      stopOwnedChild(backend);
      log(
        "Local ERPNext backend unavailable; check port 3216 and the terminal.",
      );
      return false;
    }
  }

  async function close() {
    if (closePromise) return closePromise;
    closing = true;
    clearTimeout(debounce);
    buildQueued = false;
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("exit", onExit);
    closePromise = (async () => {
      stopOwnedChild(builder);
      stopOwnedChild(backend);
      const children = [builder, backend].filter(Boolean);
      await Promise.race([
        Promise.all(children.map((child) => {
          if (child.exitCode !== null || child.signalCode !== null) return;
          return new Promise((resolveExit) => child.once("exit", resolveExit));
        })),
        sleep(2_000),
      ]);
      for (const child of children) stopOwnedChild(child, "SIGKILL");
    })();
    return closePromise;
  }

  const onSignal = () => void close().finally(() => process.exit(0));
  const onExit = () => {
    stopOwnedChild(builder, "SIGKILL");
    stopOwnedChild(backend, "SIGKILL");
  };

  function sendError(res, status, message) {
    if (res.headersSent || res.destroyed) return;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message },
      }),
    );
  }

  function sameOrigin(req) {
    const host = req.headers.host;
    if (!["127.0.0.1:5177", "localhost:5177"].includes(host)) return false;
    return !req.headers.origin || req.headers.origin === `http://${host}`;
  }

  async function proxyMcp(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      sendError(res, 405, "Use POST for the local MCP endpoint.");
      return;
    }
    if (!sameOrigin(req)) {
      sendError(
        res,
        403,
        "The local MCP endpoint requires the current browser origin.",
      );
      return;
    }
    try {
      if (!starting || !(await starting)) {
        throw new Error("Backend startup failed");
      }
      await waitForBuild();
      await waitForBackend();
      if (closing || req.destroyed || res.destroyed) return;
      const headers = { authorization: `Bearer ${backendToken}` };
      for (
        const name of [
          "content-type",
          "content-length",
          "accept",
          "mcp-protocol-version",
          "mcp-method",
          "mcp-name",
        ]
      ) {
        if (req.headers[name] !== undefined) headers[name] = req.headers[name];
      }
      const upstream = httpRequest({
        hostname: "127.0.0.1",
        port: backendPort,
        path: "/mcp",
        method: "POST",
        headers,
      }, (response) => {
        res.statusCode = response.statusCode ?? 502;
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined && !hopHeaders.has(name)) {
            res.setHeader(name, value);
          }
        }
        res.setHeader("Cache-Control", "no-store");
        response.once("error", () => res.destroy());
        response.pipe(res);
      });
      upstream.setTimeout(60_000, () => upstream.destroy());
      upstream.once("error", () => {
        sendError(
          res,
          502,
          "The local MCP request failed; retry after the backend is ready.",
        );
      });
      req.once("aborted", () => upstream.destroy());
      res.once("close", () => {
        if (!res.writableFinished) upstream.destroy();
      });
      req.pipe(upstream);
    } catch {
      sendError(
        res,
        503,
        "The local ERPNext backend or viewer build is not ready.",
      );
    }
  }

  async function serveViewer(req, res, viewer) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      sendError(res, 405, "Use GET to open a local viewer.");
      return;
    }
    if (!viewers.has(viewer)) {
      sendError(res, 404, "Unknown ERPNext viewer.");
      return;
    }
    try {
      await waitForBuild();
      const html = await readFile(
        resolve(uiRoot, "dist", viewer, "index.html"),
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", html.byteLength);
      res.end(req.method === "HEAD" ? undefined : html);
    } catch {
      sendError(
        res,
        503,
        "This viewer is unavailable until its build succeeds.",
      );
    }
  }

  return {
    name: "erpnext-local-development-host",
    apply: "serve",
    configureServer(server) {
      vite = server;
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
      process.once("exit", onExit);
      server.httpServer.once("listening", () => {
        if (!closing) starting = startBackend();
      });
      server.httpServer.once("error", () => void close());
      server.httpServer.once("close", () => void close());
      server.watcher.add([
        resolve(uiRoot, "shared"),
        ...[...viewers].map((viewer) => resolve(uiRoot, viewer)),
        resolve(uiRoot, "build-all.mjs"),
        resolve(uiRoot, "vite.single.config.mjs"),
        resolve(uiRoot, "package.json"),
        resolve(uiRoot, "package-lock.json"),
        resolve(uiRoot, "tsconfig.json"),
      ]);
      server.watcher.on("add", scheduleBuild);
      server.watcher.on("change", scheduleBuild);
      server.watcher.on("unlink", scheduleBuild);
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?", 1)[0];
        if (pathname === "/__mcp") {
          void proxyMcp(req, res);
          return;
        }
        if (pathname?.startsWith("/__viewer/")) {
          const match = /^\/__viewer\/([a-z][a-z-]*-viewer)$/.exec(pathname);
          if (!match) sendError(res, 404, "Unknown ERPNext viewer.");
          else void serveViewer(req, res, match[1]);
          return;
        }
        next();
      });
    },
    closeBundle: close,
  };
}

export default mergeConfig(singleViewerConfig, {
  plugins: [localErpNextHost()],
  server: {
    host: "127.0.0.1",
    port: frontendPort,
    strictPort: true,
    allowedHosts: ["127.0.0.1", "localhost"],
    cors: false,
    fs: {
      strict: true,
      allow: [uiRoot],
      deny: [".env", ".env.*", "**/.env", "**/.env.*"],
    },
  },
});
