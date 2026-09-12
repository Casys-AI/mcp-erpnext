/**
 * Deno + Node smoke over canonicalization. Production capture code does not
 * import Deno APIs; this test file may spawn Node.
 */

import { assertEquals } from "@std/assert";
import {
  canonicalJson,
  sha256FingerprintOfUtf8,
  utf8ByteCount,
} from "./json.ts";
import { sealBuySourceCapture } from "./capture.ts";
import { syntheticCapture } from "./synthetic.ts";

const SAMPLE = {
  schemaVersion: "io.casys.mcp-erpnext.buy-source-capture/1.0",
  b: 2,
  a: [{ z: true, y: "x" }],
};

Deno.test("Node and Deno produce the same canonicalText fingerprint and byteCount", async () => {
  const denoText = canonicalJson(SAMPLE, "sample");
  const denoFingerprint = await sha256FingerprintOfUtf8(denoText);
  const denoBytes = utf8ByteCount(denoText);

  const here = new URL(".", import.meta.url).pathname;
  const jsonEntry = `${here}json.ts`;
  const localEsbuild = `${here}../ui/node_modules/esbuild/bin/esbuild`;
  const outDir = await Deno.makeTempDir({ prefix: "buy-canonical-node-" });
  const outfile = `${outDir}/smoke.mjs`;
  const runner = `${outDir}/run.mjs`;
  try {
    let bundled = false;
    try {
      await Deno.stat(localEsbuild);
      const bundle = await new Deno.Command(localEsbuild, {
        args: [
          jsonEntry,
          "--bundle",
          "--platform=node",
          "--format=esm",
          `--outfile=${outfile}`,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!bundle.success) {
        throw new Error(new TextDecoder().decode(bundle.stderr));
      }
      bundled = true;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    await Deno.writeTextFile(
      runner,
      `import { canonicalJson, sha256FingerprintOfUtf8, utf8ByteCount } from ${
        JSON.stringify(bundled ? outfile : jsonEntry)
      };
const sample = ${JSON.stringify(SAMPLE)};
const text = canonicalJson(sample, "sample");
const fingerprint = await sha256FingerprintOfUtf8(text);
console.log(JSON.stringify({ text, fingerprint, byteCount: utf8ByteCount(text) }));
`,
    );
    const node = await new Deno.Command("node", {
      args: bundled ? [runner] : ["--experimental-strip-types", runner],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!node.success) {
      throw new Error(new TextDecoder().decode(node.stderr));
    }
    const parsed = JSON.parse(new TextDecoder().decode(node.stdout)) as {
      text: string;
      fingerprint: string;
      byteCount: number;
    };
    assertEquals(parsed.text, denoText);
    assertEquals(parsed.fingerprint, denoFingerprint);
    assertEquals(parsed.byteCount, denoBytes);
  } finally {
    await Deno.remove(outDir, { recursive: true });
  }

  const wrapper = await sealBuySourceCapture(await syntheticCapture());
  assertEquals(
    wrapper.byteCount,
    new TextEncoder().encode(wrapper.canonicalText).byteLength,
  );
});
