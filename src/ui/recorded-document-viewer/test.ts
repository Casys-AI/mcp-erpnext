import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withViewerTestDenoConfig } from "../buy-evidence-viewer/test-modules.ts";

const here = dirname(fileURLToPath(import.meta.url));

await withViewerTestDenoConfig(async (configPath) => {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "test",
      "--config",
      configPath,
      "--unstable-sloppy-imports",
      "--allow-all",
      join(here, "src", "app_test.ts"),
    ],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...Deno.env.toObject(),
    },
  }).spawn();
  const status = await child.status;
  if (!status.success) Deno.exit(status.code ?? 1);
});
