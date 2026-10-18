import { assertEquals } from "@std/assert";
import { isMacControlClick, isMacPlatform } from "./platform.ts";

Deno.test("platform - reconnaît macOS sans assimiler iOS, Windows ou Linux", () => {
  for (const platform of ["MacIntel", "MacPPC", "Mac68K", "macOS", "macos"]) {
    assertEquals(isMacPlatform(platform), true, platform);
  }
  for (
    const platform of ["Win32", "Windows", "Linux x86_64", "iPhone", "iPad", ""]
  ) {
    assertEquals(isMacPlatform(platform), false, platform);
  }
});

Deno.test("platform - Ctrl contextmenu exige Mac, Ctrl et le bouton principal", () => {
  assertEquals(
    isMacControlClick({ ctrlKey: true, button: 0 }, "MacIntel"),
    true,
  );
  for (
    const event of [
      { ctrlKey: false, button: 0 },
      { ctrlKey: false, button: 2 },
      { ctrlKey: true, button: 2 },
      { ctrlKey: true, button: 1 },
      { ctrlKey: true },
      {},
    ]
  ) {
    assertEquals(isMacControlClick(event, "MacIntel"), false);
  }
  assertEquals(isMacControlClick({ ctrlKey: true, button: 0 }, "Win32"), false);
  assertEquals(
    isMacControlClick({ ctrlKey: true, button: 0 }, "Linux x86_64"),
    false,
  );
});
