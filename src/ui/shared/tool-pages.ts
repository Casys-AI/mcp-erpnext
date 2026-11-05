export interface ToolPageOptions {
  pageSize?: number;
  deadlineMs?: number;
}

export class ToolPaginationError extends Error {
  readonly code = "PAGINATION_INCOMPLETE";

  constructor(reason: string) {
    super(`PAGINATION_INCOMPLETE: ${reason}`);
    this.name = "ToolPaginationError";
  }
}

/** Collect tool result pages atomically; stale generations return no result. */
export async function collectToolPages<T>(
  readPage: (offset: number, limit: number) => Promise<readonly T[]>,
  getId: (row: T) => unknown,
  isCurrent: () => boolean,
  {
    pageSize = 200,
    deadlineMs = Date.now() + 60_000,
  }: ToolPageOptions = {},
): Promise<T[] | null> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new ToolPaginationError("page size must be a positive integer");
  }
  const rows: T[] = [];
  const seen = new Set<string>();
  let offset = 0;
  const checkDeadline = () => {
    if (!Number.isFinite(deadlineMs) || Date.now() >= deadlineMs) {
      throw new ToolPaginationError("read deadline exceeded");
    }
  };

  while (true) {
    if (!isCurrent()) return null;
    checkDeadline();
    let page: readonly T[];
    try {
      page = await readPage(offset, pageSize);
    } catch (error) {
      if (!isCurrent()) return null;
      throw error;
    }
    if (!isCurrent()) return null;
    checkDeadline();
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new ToolPaginationError("invalid or oversized page");
    }
    if (page.length === 0) return rows;
    for (const row of page) {
      const id = getId(row);
      if (typeof id !== "string" || !id.trim()) {
        throw new ToolPaginationError("row has no readable identity");
      }
      if (seen.has(id)) {
        throw new ToolPaginationError("repeated a row identity");
      }
      seen.add(id);
      rows.push(row);
    }
    // A short page may be server-capped; only an empty page confirms completion.
    offset += page.length;
  }
}
