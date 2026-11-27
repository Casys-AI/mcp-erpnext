/** Scoped layout drafts for saved Code Mode dashboards. @module */
import { isPanelLayoutSnapshot, type PanelLayoutSnapshot } from "./layout.ts";

/** Accepted widths per stable panel ID. Use an empty list for a fixed-width viewer. */
export type PanelWidths = ReadonlyMap<string, readonly number[]>;

interface BoardRun<Receipt> {
  scope: string;
  panels: PanelWidths;
  expiresAt: number;
  names: Map<string, { revision: number; receipt: Promise<Receipt> } | undefined>;
  initial?: PanelLayoutSnapshot;
  draft?: { revision: number; layout: PanelLayoutSnapshot };
}

function matchesBoard(value: unknown, panels: PanelWidths): value is PanelLayoutSnapshot {
  return isPanelLayoutSnapshot(value) && value.order.length === panels.size &&
    value.order.every((id) => panels.has(id)) &&
    value.widths.every(({ panel, width }) => panels.get(panel)?.includes(width));
}

function copyLayout({ order, widths, placements }: PanelLayoutSnapshot): PanelLayoutSnapshot {
  return {
    version: 1,
    order: [...order],
    widths: widths.map(({ panel, width }) => ({ panel, width })),
    placements: placements.map(({ panel, beside, side }) => ({ panel, beside, side })),
  };
}

/** Correlate app gestures and explicit snippet saves within a trusted execution scope. */
export class BoardLayoutRuns<Receipt = void> {
  private readonly runs = new Map<string, BoardRun<Receipt>>();
  private readonly referenceTtlMs: number;
  private readonly maxPendingReferences: number;

  /** Pass the reference lifetime and capacity used by the snippet catalog. */
  constructor(options: { referenceTtlMs?: number; maxPendingReferences?: number } = {}) {
    this.referenceTtlMs = options.referenceTtlMs ?? 10 * 60_000;
    this.maxPendingReferences = options.maxPendingReferences ?? 1024;
    for (const limit of [this.referenceTtlMs, this.maxPendingReferences]) {
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new RangeError("Invalid reference limit");
      }
    }
  }

  /** Register a successful run and return the saved layout if it fits today's panel declarations. */
  open(
    scope: string,
    runId: string,
    panels: PanelWidths,
    replayedName?: string,
    savedLayout?: unknown,
  ): PanelLayoutSnapshot | undefined {
    if (!scope.trim() || !runId.trim()) {
      throw new TypeError("Dashboard runs require a scope and run ID");
    }
    const now = Date.now();
    if ((this.runs.get(runId)?.expiresAt ?? 0) > now) {
      throw new Error("Dashboard execution already registered");
    }
    for (const [key, run] of this.runs) {
      if (run.expiresAt > now && this.runs.size < this.maxPendingReferences) break;
      this.runs.delete(key);
    }
    const initial = matchesBoard(savedLayout, panels) ? copyLayout(savedLayout) : undefined;
    this.runs.set(runId, {
      scope,
      panels: new Map(Array.from(panels, ([id, widths]) => [id, [...widths]])),
      names: new Map(replayedName === undefined ? [] : [[replayedName, undefined]]),
      initial,
      expiresAt: now + this.referenceTtlMs,
    });
    return initial && copyLayout(initial);
  }

  private find(scope: string, runId: string): BoardRun<Receipt> | undefined {
    const run = this.runs.get(runId);
    if (run?.scope === scope && run.expiresAt > Date.now()) return run;
  }

  /** Bind the name only after the scoped catalog has successfully saved the program. */
  saved(scope: string, runId: string, name: string): void {
    const run = this.find(scope, runId);
    if (!run || run.names.has(name)) return;
    // Cap both bound aliases and retained receipts. A dropped alias can be reopened normally.
    if (run.names.size >= 32) run.names.delete(run.names.keys().next().value!);
    run.names.set(name, undefined);
  }

  /** Acknowledge a committed layout, including an identical retry after a lost response. */
  stage(
    scope: string,
    runId: unknown,
    revision: unknown,
    snapshot: unknown,
  ): { runId: string; revision: number } {
    const run = typeof runId === "string" && this.find(scope, runId);
    if (!run || typeof runId !== "string") {
      throw new Error("Dashboard execution expired or unavailable. Reopen the dashboard.");
    }
    if (
      typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1 ||
      !matchesBoard(snapshot, run.panels)
    ) {
      throw new Error("Invalid layout for this dashboard execution.");
    }
    const layout = copyLayout(snapshot);
    if (
      run.draft && (revision < run.draft.revision ||
        (revision === run.draft.revision &&
          JSON.stringify(layout) !== JSON.stringify(run.draft.layout)))
    ) {
      throw new Error("The dashboard layout revision is stale.");
    }
    run.draft = { revision, layout };
    return { runId, revision };
  }

  /** Return only acknowledged geometry for save or update. An update must target a bound name. */
  selected(
    scope: string,
    runId: string,
    revision?: unknown,
    updateName?: string,
  ): PanelLayoutSnapshot | undefined {
    const run = this.find(scope, runId);
    if (revision === undefined && updateName === undefined && !run?.draft) {
      return run?.initial && copyLayout(run.initial);
    }
    if (!run?.draft || revision !== run.draft.revision) {
      throw new Error("Use the latest ready snippetLayout runId and revision from the dashboard.");
    }
    if (updateName !== undefined && !run.names.has(updateName)) {
      throw new Error(
        "This dashboard belongs to a different snippet. Open or save the requested snippet first.",
      );
    }
    return copyLayout(run.draft.layout);
  }

  /**
   * Apply the explicit update once per named board revision. Retain only the
   * latest receipt per bound name until this execution expires. A failed
   * write can be retried, and an older in-flight write finishes before a newer one.
   */
  async commitUpdate(
    scope: string,
    runId: string,
    revision: number,
    name: string,
    write: (layout: PanelLayoutSnapshot) => Promise<Receipt>,
  ): Promise<Receipt> {
    const layout = this.selected(scope, runId, revision, name);
    if (!layout) throw new Error("The dashboard has no acknowledged layout.");
    const run = this.runs.get(runId)!;
    const previous = run.names.get(name);
    if (previous?.revision === revision) return await previous.receipt;
    const receipt = (previous?.receipt ?? Promise.resolve())
      .catch(() => {})
      .then(() => write(layout));
    run.names.set(name, { revision, receipt });
    try {
      return await receipt;
    } catch (error) {
      if (run.names.get(name)?.receipt === receipt) run.names.set(name, undefined);
      throw error;
    }
  }
}
