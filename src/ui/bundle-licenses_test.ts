import { assert } from "@std/assert";
import { UI_VIEWERS } from "./viewers.ts";

Deno.test("built Tailwind styles have corresponding third-party license provenance", async () => {
  for (const viewer of UI_VIEWERS) {
    let html: string;
    try {
      html = await Deno.readTextFile(
        new URL(`./dist/${viewer}/index.html`, import.meta.url),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
    if (!html.includes("/*! tailwindcss v")) continue;

    const report = JSON.parse(
      await Deno.readTextFile(
        new URL(`./.build-meta/${viewer}.json`, import.meta.url),
      ),
    ) as { modules: string[] };
    assert(
      report.modules.some((path) =>
        path.replaceAll("\\", "/").includes("/node_modules/tailwindcss/")
      ),
      `${viewer}: embedded Tailwind CSS must be included in license provenance`,
    );
  }
});

Deno.test("built viewers retain JavaScript runtime license provenance after inlining", async () => {
  for (const viewer of UI_VIEWERS) {
    try {
      await Deno.stat(new URL(`./dist/${viewer}/index.html`, import.meta.url));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
    const report = JSON.parse(
      await Deno.readTextFile(
        new URL(`./.build-meta/${viewer}.json`, import.meta.url),
      ),
    ) as { modules: string[] };
    const paths = report.modules.map((path) => path.replaceAll("\\", "/"));
    assert(
      paths.some((path) =>
        path.includes("/node_modules/@modelcontextprotocol/ext-apps/")
      ),
      `${viewer}: the embedded MCP Apps runtime must be included in license provenance`,
    );
    const framework = viewer === "kpi-viewer" || viewer === "funnel-viewer"
      ? "preact"
      : "react";
    assert(
      paths.some((path) => path.includes(`/node_modules/${framework}/`)),
      `${viewer}: the embedded UI runtime must be included in license provenance`,
    );
  }
});
