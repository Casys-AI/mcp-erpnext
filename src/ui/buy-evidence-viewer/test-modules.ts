import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VIEWER_ROOT = dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = resolve(VIEWER_ROOT, "../shared");

/** Run App tests against the same npm packages installed by the UI lockfile. */
export async function viewerTestDenoConfig(): Promise<unknown> {
  const imports: Record<string, string> = {};
  for (
    const name of [
      "@mcpview/view",
      "@mcpview/contracts",
      "@mcpview/components",
      "preact",
      "@modelcontextprotocol/ext-apps",
    ]
  ) {
    const metadata = JSON.parse(
      await Deno.readTextFile(
        join(VIEWER_ROOT, "..", "node_modules", name, "package.json"),
      ),
    );
    if (metadata.name !== name || typeof metadata.version !== "string") {
      throw new Error(
        `Missing exact installed UI dependency ${name}; run npm ci in src/ui.`,
      );
    }
    imports[name] = `npm:${name}@${metadata.version}`;
    for (const subpath of Object.keys(metadata.exports ?? {})) {
      if (subpath.startsWith("./") && !subpath.includes("*")) {
        const suffix = subpath.slice(1);
        imports[`${name}${suffix}`] =
          `npm:${name}@${metadata.version}${suffix}`;
      }
    }
  }
  // This test-only helper is deliberately absent from the runtime npm package.
  imports["@mcpview/components/testing"] =
    "https://raw.githubusercontent.com/mcpview/mcpview/50756aaf062794f08bf412cf0762a4aa8988b28d/packages/view-components/src/testing/surface-app-double.ts";

  return {
    // The @mcpview/* family is released in lockstep, so these exact versions
    // are too fresh for the one-day delay; the exemption mirrors the
    // `jsr:@mcpview/server` one in the root deno.json. Every other dependency
    // keeps the delay.
    minimumDependencyAge: {
      age: "P1D",
      exclude: [
        "npm:@mcpview/view",
        "npm:@mcpview/contracts",
        "npm:@mcpview/components",
      ],
    },
    unstable: ["sloppy-imports"],
    compilerOptions: {
      jsx: "react-jsx",
      jsxImportSource: "preact",
      lib: [
        "deno.ns",
        "deno.window",
        "dom",
        "dom.iterable",
        "dom.asynciterable",
        "esnext",
      ],
    },
    imports: {
      ...imports,
      "@modelcontextprotocol/sdk": "npm:@modelcontextprotocol/sdk@^1.29.0",
      "@modelcontextprotocol/sdk/types.js":
        "npm:@modelcontextprotocol/sdk@^1.29.0/types.js",
      "@std/assert": "jsr:@std/assert@^1.0.0",
      "@std/path": "jsr:@std/path@^1.1.0",
      "linkedom": "npm:linkedom@0.18.12",
      [`${pathToFileURL(join(SHARED_ROOT, "casys-logo.svg")).href}?url`]:
        pathToFileURL(join(VIEWER_ROOT, "svg-url-shim.ts")).href,
    },
    scopes: {
      [`${pathToFileURL(SHARED_ROOT).href}/`]: {
        "./casys-logo.svg?url": pathToFileURL(
          join(VIEWER_ROOT, "svg-url-shim.ts"),
        ).href,
      },
      [pathToFileURL(join(SHARED_ROOT, "ui.tsx")).href]: {
        "./casys-logo.svg?url": pathToFileURL(
          join(VIEWER_ROOT, "svg-url-shim.ts"),
        ).href,
      },
    },
  };
}

export async function withViewerTestDenoConfig<T>(
  action: (configPath: string) => Promise<T>,
): Promise<T> {
  const temporaryDirectory = await Deno.makeTempDir({
    prefix: "mcp-erpnext-buy-view-config-",
  });
  const configPath = join(temporaryDirectory, "deno.json");
  try {
    await Deno.writeTextFile(
      configPath,
      `${JSON.stringify(await viewerTestDenoConfig(), null, 2)}\n`,
    );
    return await action(configPath);
  } finally {
    await Deno.remove(temporaryDirectory, { recursive: true });
  }
}
