import { assertEquals } from "@std/assert";
import { parseBuyCaptureWrapper } from "./capture.ts";
import { parseBuyRecordedResult } from "./result.ts";
import { parseBuyViewerSession } from "./session.ts";
import { writeBuyContractFixtures } from "./write_contract_fixtures.ts";
import { SYNTHETIC_TEST_NOTICE } from "./identities.ts";

Deno.test("shared contract fixtures are synthetic, canonical, and DT-hashable", async () => {
  const { manifestPath, files } = await writeBuyContractFixtures({
    mkdir: (path) => Deno.mkdir(path, { recursive: true }),
    writeTextFile: Deno.writeTextFile,
  });
  const manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as {
    notice: string;
    files: Array<{ path: string; status: string; sha256: string }>;
  };
  assertEquals(manifest.notice, SYNTHETIC_TEST_NOTICE);
  assertEquals(files.some((file) => file.path.includes("partial")), true);
  assertEquals(files.some((file) => file.status === "rejected"), true);
  const captureFile = files.find((file) =>
    file.path === "accepted/buy-source-capture.canonical.json"
  );
  assertEquals(
    captureFile?.sha256,
    "sha256:aa33230c6af6abc929f1687ce6ffc00ccf920510e58efa3c53ec71f4dbbe9d5a",
  );
  assertEquals(captureFile?.byteCount, 2435);
  assertEquals(
    files.some((file) =>
      file.path === "accepted/buy-recorded-result.partial-global-gap.json"
    ),
    true,
  );
  assertEquals(
    files.some((file) =>
      file.path === "rejected/buy-recorded-result.complete-with-gap.json"
    ),
    true,
  );
  assertEquals(
    files.some((file) =>
      file.path ===
        "rejected/buy-recorded-session.mismatching-bundle-anchor.json"
    ),
    true,
  );

  const captureText = (await Deno.readTextFile(
    "/Volumes/DEV/Projects/cdt-frictions-20260912-audit/buy-contract-fixtures/accepted/buy-source-capture.wrapper.json",
  )).trimEnd();
  const wrapper = JSON.parse(captureText);
  await parseBuyCaptureWrapper(wrapper);

  const complete = JSON.parse((await Deno.readTextFile(
    "/Volumes/DEV/Projects/cdt-frictions-20260912-audit/buy-contract-fixtures/accepted/buy-recorded-result.complete.json",
  )).trimEnd());
  parseBuyRecordedResult(complete);

  const partial = JSON.parse((await Deno.readTextFile(
    "/Volumes/DEV/Projects/cdt-frictions-20260912-audit/buy-contract-fixtures/accepted/buy-recorded-result.partial.json",
  )).trimEnd());
  assertEquals(parseBuyRecordedResult(partial).coverage.status, "partial");

  const session = JSON.parse((await Deno.readTextFile(
    "/Volumes/DEV/Projects/cdt-frictions-20260912-audit/buy-contract-fixtures/accepted/buy-recorded-session.complete.json",
  )).trimEnd());
  await parseBuyViewerSession(session);
});
