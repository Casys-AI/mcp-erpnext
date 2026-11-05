import type { FrappeClient } from "./frappe-client.ts";
import type { FrappeDoc, FrappeFilter, FrappeListOptions } from "./types.ts";

const PAGE_SIZE = 200;
const DEFAULT_DURATION_MS = 60_000;

export type FrappeListReadOptions = Pick<
  FrappeListOptions,
  "parent" | "fields" | "filters"
>;

export interface FrappeReadBudget {
  deadlineMs?: number;
  pageSize?: number;
}

export function createReadBudget(): { deadlineMs: number } {
  return { deadlineMs: Date.now() + DEFAULT_DURATION_MS };
}

export class FrappePaginationError extends Error {
  readonly code = "PAGINATION_INCOMPLETE";
  readonly recovery =
    "Retry the read or narrow its filters; no partial aggregate should be used.";

  constructor(readonly doctype: string, reason: string) {
    super(
      `[${doctype}] PAGINATION_INCOMPLETE: ${reason}. Recovery: Retry the read or narrow its filters; no partial aggregate should be used.`,
    );
    this.name = "FrappePaginationError";
  }
}

/** Fresh keyset reads keep each response small without imposing a total-row cap. */
export async function* listPages<T extends FrappeDoc = FrappeDoc>(
  client: FrappeClient,
  doctype: string,
  options: FrappeListReadOptions = {},
  {
    deadlineMs = Date.now() + DEFAULT_DURATION_MS,
    pageSize = PAGE_SIZE,
  }: FrappeReadBudget = {},
): AsyncGenerator<T[]> {
  if (
    !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE
  ) {
    throw new FrappePaginationError(
      doctype,
      `Page size must be an integer from 1 to ${PAGE_SIZE}`,
    );
  }
  const fields = [...new Set(["name", ...(options.fields ?? [])])];
  const baseFilters = options.filters?.slice() ?? [];
  const seenNames = new Set<string>();
  let cursor: string | undefined;

  const checkDeadline = () => {
    if (!Number.isFinite(deadlineMs) || Date.now() >= deadlineMs) {
      throw new FrappePaginationError(
        doctype,
        "The read deadline was exceeded",
      );
    }
  };

  while (true) {
    checkDeadline();
    const filters: FrappeFilter[] = cursor === undefined
      ? baseFilters.slice()
      : [...baseFilters, ["name", ">", cursor]];
    const page = await client.list<T>(doctype, {
      ...(options.parent !== undefined ? { parent: options.parent } : {}),
      fields,
      filters,
      order_by: "name asc",
      limit: pageSize,
    }, { skipCache: true });
    checkDeadline();
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new FrappePaginationError(
        doctype,
        "The server returned an invalid page size",
      );
    }
    if (page.length === 0) return;

    for (const row of page) {
      const name = row?.name;
      if (typeof name !== "string" || !name.trim()) {
        throw new FrappePaginationError(
          doctype,
          "A row has no readable name for pagination",
        );
      }
      if (seenNames.has(name)) {
        throw new FrappePaginationError(
          doctype,
          "The server repeated a row instead of advancing the cursor",
        );
      }
      seenNames.add(name);
    }
    // SQL collation defines name ordering; JavaScript string comparisons can
    // disagree. Exact identity detects repeated/ignored cursors without guessing it.
    cursor = page[page.length - 1].name;
    yield page;
    // A short page can reflect a server-side cap. Only an empty page ends the read.
  }
}

/** Collect a complete population for aggregates; sort by business fields afterward. */
export async function listAll<T extends FrappeDoc = FrappeDoc>(
  client: FrappeClient,
  doctype: string,
  options: FrappeListReadOptions = {},
  budget: FrappeReadBudget = {},
): Promise<T[]> {
  const rows: T[] = [];
  for await (const page of listPages<T>(client, doctype, options, budget)) {
    rows.push(...page);
  }
  return rows;
}
