export function isMacPlatform(platform: string): boolean {
  return /^(MacIntel|MacPPC|Mac68K|macOS)$/i.test(platform);
}

export function isMacControlClick(
  event: { ctrlKey?: boolean; button?: number },
  platform: string,
): boolean {
  return isMacPlatform(platform) && event.ctrlKey === true &&
    event.button === 0;
}

export function isMacControlClickEcho(
  event: { ctrlKey?: boolean },
  platform: string,
): boolean {
  return isMacPlatform(platform) && event.ctrlKey === true;
}

export function getBrowserPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const browser = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return browser.userAgentData?.platform ?? browser.platform ?? "";
}
