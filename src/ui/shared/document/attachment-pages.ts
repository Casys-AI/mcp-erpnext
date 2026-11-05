import {
  attachmentListFromToolResult,
  type DocumentAttachment,
} from "./attachment-results.ts";
import { collectToolPages } from "../tool-pages.ts";

/** Collect attachment metadata atomically; stale requests never expose partial lists. */
export async function readAttachmentMetadata(
  readPage: (page: { limit: number; offset: number }) => Promise<unknown>,
  isCurrent: () => boolean,
  { deadlineMs = Date.now() + 60_000 }: { deadlineMs?: number } = {},
): Promise<DocumentAttachment[] | null> {
  return await collectToolPages(
    async (offset, limit) =>
      attachmentListFromToolResult(await readPage({ limit, offset })),
    (file) => file.id,
    isCurrent,
    { pageSize: 50, deadlineMs },
  );
}
