import type { ContextSelectionItem } from "./active-context.ts";
import { formatBytes } from "./format.ts";
import { t } from "./i18n.ts";

export function activeContextAttachmentNotice(
  item: ContextSelectionItem,
): string | null {
  if (!item.resource) return null;
  return t("context.active.attachment", {
    name: item.label,
    size: formatBytes(item.resource.bytes.byteLength),
  });
}
