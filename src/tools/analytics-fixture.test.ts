import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeListOptions } from "../api/types.ts";

type Row = Record<string, unknown>;
type Dataset = (
  doctype: string,
  options: FrappeListOptions,
  request?: { skipCache?: boolean },
) => Promise<Row[]>;

/** Existing fixtures describe a query's full population; this adapter serves it in pages. */
export function paginatedFixture(dataset: Dataset): FrappeClient["list"] {
  const populations = new Map<string, Row[]>();
  return (async (
    doctype: string,
    options: FrappeListOptions = {},
    request: { skipCache?: boolean } = {},
  ) => {
    if (options.order_by !== "name asc" || !request.skipCache) {
      const rows = await dataset(doctype, options, request);
      return options.limit ? rows.slice(0, options.limit) : rows;
    }
    const filters = options.filters ?? [];
    const last = filters.at(-1);
    const cursor = last?.[0] === "name" && last[1] === ">"
      ? last[2]
      : undefined;
    const baseOptions = {
      ...options,
      filters: cursor === undefined ? filters : filters.slice(0, -1),
    };
    const key = JSON.stringify([doctype, baseOptions]);
    let rows = populations.get(key);
    if (!rows || cursor === undefined) {
      rows = (await dataset(doctype, baseOptions, request)).map((
        row,
        index,
      ) => ({
        name: `fixture-${String(index).padStart(8, "0")}`,
        ...row,
      })).sort((a, b) =>
        String(a.name) < String(b.name)
          ? -1
          : String(a.name) > String(b.name)
          ? 1
          : 0
      );
      populations.set(key, rows);
    }
    return rows.filter((row) =>
      cursor === undefined || String(row.name) > String(cursor)
    )
      .slice(0, options.limit ?? 20);
  }) as FrappeClient["list"];
}
