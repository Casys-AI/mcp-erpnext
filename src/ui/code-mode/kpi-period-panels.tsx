/** @jsxImportSource preact */
import { render } from "preact";
import { withDeclaredViewUri } from "@mcpview/contracts";
import {
  type composeSnippetBoard,
  emitSnippetBoardEvent,
  type SnippetPanel,
} from "@mcpview/compose/code-mode/board";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  GROSS_MARGIN_KPI,
  isKpiPeriod,
  KPI_PERIOD_APPLY,
  KPI_PERIOD_SELECTED,
  KPI_VIEW,
  type KpiPeriod,
  REVENUE_KPI,
} from "../../code-mode/kpi-period.ts";
import { parseToolInputError } from "../../tools/errors.ts";
import type { KpiPeriodSelection } from "../shared/document-follow.ts";
import { currentLocale } from "../shared/format.ts";
import { useT } from "../shared/i18n-hook.ts";
import { isResultRecord, mergeViewerEnrichment } from "../shared/refresh.ts";
import { hasExplicitAvailableTool } from "../shared/viewer-tools.ts";

type HostResult = Awaited<ReturnType<App["callServerTool"]>>;
type Board = ReturnType<typeof composeSnippetBoard>;
export interface MountedKpiPanel {
  panel: SnippetPanel;
  periods?: ReturnType<typeof createPeriodFeed>;
  body: HTMLElement;
  display(result: HostResult): Promise<boolean>;
}

/** A mounted chart owns its dated bars. Compose owns the actual target filter. */
export function createPeriodFeed(initial: unknown) {
  let current = initial;
  let listener: (() => void) | undefined;
  let route: ((period: KpiPeriod) => void) | undefined;
  let active: KpiPeriod | null | undefined;
  const viewers = new Set<() => void>();
  const selection: KpiPeriodSelection = {
    selected: () => active,
    subscribe(listener) {
      viewers.add(listener);
      return () => {
        viewers.delete(listener);
      };
    },
    inspect(period) {
      if (
        Array.isArray(current) &&
        current.some((entry) => isKpiPeriod(entry) && samePeriod(entry, period))
      ) route?.(period);
    },
  };
  return {
    selection,
    read: () => current,
    update(periods: unknown) {
      current = periods;
      listener?.();
    },
    subscribe(next: () => void) {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    bind(next?: (period: KpiPeriod) => void) {
      route = next;
    },
    report(period: KpiPeriod | null | undefined) {
      if (
        active === period || (active && period && samePeriod(active, period))
      ) return;
      active = period;
      for (const notify of viewers) notify();
    },
  };
}

function samePeriod(left: KpiPeriod, right: KpiPeriod) {
  return left.date_from === right.date_from && left.date_to === right.date_to;
}

export function kpiViewPorts(uri: string, operation: string) {
  if (uri !== KPI_VIEW) return;
  if (operation === REVENUE_KPI) return { emits: [KPI_PERIOD_SELECTED] };
  if (operation === GROSS_MARGIN_KPI) return { accepts: [KPI_PERIOD_APPLY] };
}

function formatRange(period: KpiPeriod) {
  const format = new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return format.formatRange(
    new Date(period.date_from + "T00:00:00Z"),
    new Date(period.date_to + "T00:00:00Z"),
  );
}

function RangeButton({ period, active, select }: {
  period: KpiPeriod;
  active: boolean;
  select(period: KpiPeriod): void;
}) {
  const t = useT();
  return (
    <div
      class="erp-period-picker"
      role="group"
      aria-label={t("code_mode.margin_period")}
    >
      <button
        type="button"
        title={formatRange(period)}
        aria-pressed={active}
        onClick={() => select(period)}
      >
        {t("code_mode.last_two_months")}
      </button>
    </div>
  );
}

function PeriodStatus({ period, state, detail, retry }: {
  period: KpiPeriod;
  state: "ready" | "loading" | "error";
  detail?: string;
  retry?: () => void;
}) {
  const t = useT();
  return (
    <div class="erp-period-status" role="status">
      <span>{formatRange(period)}</span>
      {state === "loading" && <span>{t("common.loading")}</span>}
      {state === "error" && (
        <>
          <span>{detail ?? t("common.error.refresh_failed")}</span>
          <button type="button" onClick={retry}>{t("common.retry")}</button>
        </>
      )}
    </div>
  );
}

/** Install only after all native viewers mount. Context and chart gestures remain owned by those viewers. */
export function connectKpiPeriods(
  board: Board,
  mounted: Map<string, MountedKpiPanel>,
  app: App,
  signal: AbortSignal,
) {
  if (signal.aborted || !app.getHostCapabilities()?.serverTools) return;
  const rules = board.sync.filter((rule) =>
    rule.event === KPI_PERIOD_SELECTED && rule.action === KPI_PERIOD_APPLY
  );
  const targets = new Map<string, (period: KpiPeriod) => void>();
  const selectedByTarget = new Map<string, KpiPeriod>();
  const pickers = new Set<() => void>();
  const outlets: HTMLElement[] = [];
  function outlet(before: HTMLElement) {
    const node = document.createElement("div");
    before.before(node);
    outlets.push(node);
    return node;
  }
  signal.addEventListener("abort", () => {
    for (const node of outlets) {
      render(null, node);
      node.remove();
    }
  }, { once: true });

  for (const child of board.children) {
    const id = child.componentId;
    const view = id ? mounted.get(id) : undefined;
    if (!id || !view || !rules.some((rule) => rule.to === child.slot)) continue;
    const native = view.panel.result as HostResult;
    if (!isResultRecord(native.structuredContent)) continue;
    const data = mergeViewerEnrichment(native.structuredContent, native);
    const refresh = data.refreshRequest;
    if (
      !isResultRecord(refresh) || refresh.toolName !== GROSS_MARGIN_KPI ||
      !isResultRecord(refresh.arguments) ||
      !hasExplicitAvailableTool(data._availableTools, GROSS_MARGIN_KPI)
    ) continue;
    const args = refresh.arguments;
    const status = outlet(view.body);
    const firstPeriod = { date_from: args.date_from, date_to: args.date_to };
    if (isKpiPeriod(firstPeriod)) {
      selectedByTarget.set(id, firstPeriod);
      render(<PeriodStatus state="ready" period={firstPeriod} />, status);
    }
    let current: AbortController | undefined;
    const apply = async (period: KpiPeriod) => {
      current?.abort();
      current = new AbortController();
      const active = AbortSignal.any([signal, current.signal]);
      if (active.aborted) return;
      selectedByTarget.set(id, period);
      for (const update of pickers) update();
      view.body.hidden = true;
      render(<PeriodStatus state="loading" period={period} />, status);
      try {
        const result = await app.callServerTool({
          name: GROSS_MARGIN_KPI,
          arguments: {
            ...args,
            date_from: period.date_from,
            date_to: period.date_to,
          },
        }, { signal: active, timeout: 65_000 });
        active.throwIfAborted();
        if (result.isError) {
          const message = result.content?.find((item) => item.type === "text")
            ?.text;
          throw new Error(typeof message === "string" ? message : "");
        }
        const data = result.structuredContent;
        if (
          !isResultRecord(data) ||
          !Number.isFinite(data.value) ||
          data.unit !== "%" || data.date_from !== period.date_from ||
          data.date_to !== period.date_to
        ) {
          throw new Error("Unexpected ERPNext margin response.");
        }
        if (!await view.display(withDeclaredViewUri(result, KPI_VIEW))) {
          throw new Error("KPI view unavailable.");
        }
        active.throwIfAborted();
        view.body.hidden = false;
        render(<PeriodStatus state="ready" period={period} />, status);
      } catch (cause) {
        if (!active.aborted) {
          const message = cause instanceof Error ? cause.message : "";
          const start = message.indexOf("[" + GROSS_MARGIN_KPI + "] ");
          const error = start < 0
            ? null
            : parseToolInputError(message.slice(start, start + 2048));
          render(
            <PeriodStatus
              state="error"
              detail={error ? error.message + ". " + error.recovery : undefined}
              period={period}
              retry={() => void apply(period)}
            />,
            status,
          );
        }
      }
    };
    targets.set(id, (period) => void apply(period));
  }

  for (const child of board.children) {
    const id = child.componentId;
    const view = id ? mounted.get(id) : undefined;
    if (!id || !view) continue;
    const targetIds = board.children.filter((target) =>
      target.componentId && targets.has(target.componentId) &&
      rules.some((rule) => rule.from === child.slot && rule.to === target.slot)
    ).map((target) => target.componentId!);
    if (!targetIds.length || !view.periods) continue;
    const periods = view.periods;
    const sourceOutlet = outlet(view.body);
    const select = (period: KpiPeriod) =>
      emitSnippetBoardEvent(
        board,
        id,
        KPI_PERIOD_SELECTED,
        period,
        (to, action, value) => {
          if (
            !signal.aborted && action === KPI_PERIOD_APPLY && isKpiPeriod(value)
          ) targets.get(to)?.(value);
        },
      );
    const update = () => {
      const dates = periods.read();
      const first = selectedByTarget.get(targetIds[0]);
      const common = first && targetIds.every((target) => {
          const current = selectedByTarget.get(target);
          return current && samePeriod(current, first);
        })
        ? first
        : null;
      periods.report(common);
      if (
        !Array.isArray(dates) || dates.length < 2 || !dates.every(isKpiPeriod)
      ) {
        render(null, sourceOutlet);
        return;
      }
      const range = {
        date_from: dates.at(-2)!.date_from,
        date_to: dates.at(-1)!.date_to,
      };
      render(
        <RangeButton
          period={range}
          active={Boolean(common && samePeriod(range, common))}
          select={select}
        />,
        sourceOutlet,
      );
    };
    periods.bind(select);
    pickers.add(update);
    const unsubscribe = periods.subscribe(update);
    signal.addEventListener("abort", () => {
      unsubscribe();
      periods.bind(undefined);
      periods.report(undefined);
    }, { once: true });
    update();
  }
}
