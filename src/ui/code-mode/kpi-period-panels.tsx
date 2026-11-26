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

/** The picker follows only the revenue result the mounted viewer actually accepts. */
export function createPeriodFeed(initial: unknown) {
  let current = initial;
  let listener: (() => void) | undefined;
  return {
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
  };
}

export function kpiViewPorts(uri: string, operation: string) {
  if (uri !== KPI_VIEW) return;
  if (operation === REVENUE_KPI) return { emits: [KPI_PERIOD_SELECTED] };
  if (operation === GROSS_MARGIN_KPI) return { accepts: [KPI_PERIOD_APPLY] };
}

function formatMonth(period: KpiPeriod, month: "short" | "long") {
  return new Intl.DateTimeFormat(currentLocale(), {
    month,
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(period.date_from + "T00:00:00Z"));
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

function periodKey(period: KpiPeriod) {
  return period.date_from + "/" + period.date_to;
}

type PeriodChoice = { period: KpiPeriod; combined?: boolean };

function periodChoices(months: KpiPeriod[]): PeriodChoice[] {
  const choices: PeriodChoice[] = months.map((period) => ({ period }));
  if (months.length >= 2) {
    choices.push({
      period: {
        date_from: months.at(-2)!.date_from,
        date_to: months.at(-1)!.date_to,
      },
      combined: true,
    });
  }
  return choices;
}

function MonthPicker({ periods, active, select }: {
  periods: PeriodChoice[];
  active?: string;
  select(period: KpiPeriod): void;
}) {
  const t = useT();
  const label = t("code_mode.margin_period");
  return (
    <div class="erp-period-picker" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {periods.map(({ period, combined }) => (
          <button
            type="button"
            key={periodKey(period)}
            title={formatRange(period)}
            aria-label={combined
              ? t("code_mode.last_two_months")
              : formatMonth(period, "long")}
            aria-pressed={periodKey(period) === active}
            onClick={() => select(period)}
          >
            {combined
              ? t("code_mode.last_two_months")
              : formatMonth(period, "short")}
          </button>
        ))}
      </div>
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
      if (!Array.isArray(dates) || !dates.length || !dates.every(isKpiPeriod)) {
        render(null, sourceOutlet);
        return;
      }
      const choices = periodChoices(dates);
      const selected = choices.find(({ period }) =>
        targetIds.every((target) => {
          const active = selectedByTarget.get(target);
          return active && active.date_from === period.date_from &&
            active.date_to === period.date_to;
        })
      );
      render(
        <MonthPicker
          periods={choices}
          active={selected && periodKey(selected.period)}
          select={select}
        />,
        sourceOutlet,
      );
    };
    pickers.add(update);
    const unsubscribe = periods.subscribe(update);
    signal.addEventListener("abort", unsubscribe, { once: true });
    update();
  }
}
