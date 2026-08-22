/**
 * L'état d'une liste, contrôlé de l'extérieur.
 *
 * Tri, filtre, page, chips et ligne active vivent dans `ui` — que la pile de
 * navigation garde par niveau : revenir sur une liste la retrouve telle
 * qu'on l'a laissée. Le hook dérive tout le reste (colonnes, lignes
 * filtrées, page courante, total).
 */

import { useCallback, useMemo } from "preact/hooks";
import { pickAmountColumn, sumColumn } from "./columns";
import {
  FILTERABLE_COLUMNS,
  formatCell,
  HIDDEN_FIELDS,
  isStatusField,
  selectVisibleColumns,
} from "./helpers";
import type { LevelUi } from "../nav-stack";
import type { DoclistData, SortDir } from "./types";

export const PAGE_SIZE = 20;
const EMPTY_CHIPS: Record<string, string> = {};

/** L'état d'une liste : la part « liste » de l'état d'un niveau de la pile. */
export type DoclistUi = LevelUi;

export type Row = Record<string, unknown>;

export interface TableColumn {
  id: string;
  label: string;
  numeric: boolean;
}

export function useDoclist(
  data: DoclistData,
  ui: DoclistUi,
  setUi: (patch: Partial<DoclistUi>) => void,
) {
  const rows = data.data ?? [];
  const sortKey = ui.sortKey ?? null;
  const sortDir: SortDir = ui.sortDir ?? "asc";
  const filter = ui.filter ?? "";
  const page = ui.page ?? 0;
  const chipFilters = ui.chipFilters ?? EMPTY_CHIPS;
  const expandedId = ui.expandedId ?? null;

  const filterableColumns = useMemo(() => {
    if (rows.length < 2) return [];
    const candidates: { col: string; values: string[] }[] = [];
    for (const col of Object.keys(rows[0] ?? {})) {
      if (!FILTERABLE_COLUMNS.has(col) && !isStatusField(col)) continue;
      const distinct = new Set<string>();
      for (const row of rows) {
        const v = row[col];
        if (v != null && typeof v === "string") distinct.add(v);
        if (distinct.size > 8) break;
      }
      if (distinct.size >= 2 && distinct.size <= 8) {
        candidates.push({ col, values: Array.from(distinct).sort() });
      }
    }
    return candidates;
  }, [rows]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!HIDDEN_FIELDS.has(key) && !key.startsWith("_")) allKeys.add(key);
      }
    }
    return selectVisibleColumns(Array.from(allKeys));
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    for (const [col, value] of Object.entries(chipFilters)) {
      if (value) result = result.filter((row) => row[col] === value);
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => formatCell(row[col]).toLowerCase().includes(q))
      );
    }
    return result;
  }, [rows, filter, columns, chipFilters]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  /** Une colonne est numérique dès qu'une ligne y porte un nombre. */
  const tableColumns = useMemo<TableColumn[]>(
    () =>
      columns.map((col) => ({
        id: col,
        label: col.replace(/_/g, " "),
        numeric: rows.some((row) => typeof row[col] === "number"),
      })),
    [columns, rows],
  );

  /** Les chips portent leur effectif — compté sur l'ensemble, pas la page. */
  const chipCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const { col, values } of filterableColumns) {
      counts[col] = Object.fromEntries(values.map((value) => [value, 0]));
      for (const row of rows) {
        const value = row[col];
        if (typeof value === "string" && value in counts[col]) {
          counts[col][value] += 1;
        }
      }
    }
    return counts;
  }, [filterableColumns, rows]);

  const amountKey = useMemo(() => pickAmountColumn(tableColumns), [
    tableColumns,
  ]);
  /** Le total porte sur l'ensemble filtré, pas sur la page. */
  const amountTotal = useMemo(
    () => sumColumn(sorted, amountKey),
    [sorted, amountKey],
  );

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setUi({ sortDir: sortDir === "asc" ? "desc" : "asc", expandedId: null });
    } else setUi({ sortKey: key, sortDir: "asc", expandedId: null });
  }, [sortKey, sortDir, setUi]);

  return {
    rows,
    rowAction: data._rowAction,
    columns,
    tableColumns,
    filterableColumns,
    chipCounts,
    filtered,
    sorted,
    pageRows,
    totalPages,
    amountKey,
    amountTotal,
    sortKey,
    sortDir,
    filter,
    page,
    chipFilters,
    expandedId,
    searchOpen: ui.searchOpen ?? false,
    handleSort,
    setFilter: (filter: string) => setUi({ filter, page: 0, expandedId: null }),
    setPage: (page: number) => setUi({ page, expandedId: null }),
    setExpandedId: (expandedId: string | null) => setUi({ expandedId }),
    setSearchOpen: (searchOpen: boolean) => setUi({ searchOpen }),
    setChipFilter: (col: string, value: string | null) => {
      const next = { ...chipFilters };
      if (value === null) delete next[col];
      else next[col] = value;
      setUi({ chipFilters: next, page: 0, expandedId: null });
    },
  };
}

export type DoclistState = ReturnType<typeof useDoclist>;
