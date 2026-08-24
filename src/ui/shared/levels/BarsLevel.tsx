/**
 * Mini-graphe des niveaux imbriqués, sans embarquer Recharts dans les sept
 * viewers. Il conserve les séries composées, leurs axes et leurs stacks.
 */

import { useState } from "preact/hooks";
import { formatCurrency, formatNumber, formatPercent } from "../format";
import { type BarsBody, type BarsSeries, chartSeriesFormat } from "./bodies";
import { nestedChartModel, type NestedPoint } from "./nested-chart-model.ts";

const SERIES_COLORS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
  "var(--color-cat-7)",
  "var(--color-cat-8)",
] as const;

function seriesColor(series: BarsSeries, index: number, total: number): string {
  if (series.color) return series.color;
  if (total === 1) return "var(--color-accent)";
  return SERIES_COLORS[Math.min(index, SERIES_COLORS.length - 1)];
}

function nearestLabelIndex(
  clientX: number,
  left: number,
  width: number,
  count: number,
): number {
  if (count <= 1 || width <= 0) return 0;
  const ratio = Math.min(0.999999, Math.max(0, (clientX - left) / width));
  return Math.floor(ratio * count);
}

export function BarsLevel(
  {
    chart,
    activeIndex,
    isPointInteractive,
    onPointClick,
    caption,
    narrow,
  }: {
    chart: BarsBody;
    activeIndex?: number;
    isPointInteractive?: (labelIndex: number, seriesIndex: number) => boolean;
    onPointClick?: (labelIndex: number, seriesIndex: number) => void;
    caption?: string;
    narrow?: boolean;
  },
) {
  const { labels, datasets } = chart;
  const model = nestedChartModel(chart);
  const [preview, setPreview] = useState<
    {
      labelIndex: number;
      seriesIndex: number;
    } | null
  >(null);
  const totals = labels.map((_, index) =>
    datasets.reduce(
      (total, dataset) => total + Math.abs(dataset.values[index] ?? 0),
      0,
    )
  );
  const fallbackActive = Math.max(0, totals.indexOf(Math.max(...totals)));
  const requestedActive = activeIndex ?? fallbackActive;
  const defaultActive = Math.min(
    Math.max(0, requestedActive),
    Math.max(0, labels.length - 1),
  );
  const active = preview?.labelIndex ?? defaultActive;
  const multiSeries = datasets.length > 1;
  const chartWidth = Math.max(
    100,
    labels.length * Math.max(42, 26 + datasets.length * 5),
  );

  const valueLabel = (series: BarsSeries, value: number) => {
    const format = chartSeriesFormat(chart, series);
    if (format.currency) return formatCurrency(value, format.currency);
    if (format.unit === "%") {
      return formatPercent(value, value % 1 === 0 ? 0 : 1);
    }
    return `${formatNumber(value, value % 1 === 0 ? 0 : 1)}${
      format.unit ? ` ${format.unit}` : ""
    }`;
  };

  const pointLabel = (labelIndex: number, seriesIndex: number) => {
    const dataset = datasets[seriesIndex];
    const value = valueLabel(dataset, dataset.values[labelIndex] ?? 0);
    return `${labels[labelIndex]} · ${
      dataset.label || `#${seriesIndex + 1}`
    } · ${value}`;
  };

  const activate = (labelIndex: number, seriesIndex: number) => {
    if (!isPointInteractive?.(labelIndex, seriesIndex)) return;
    onPointClick?.(labelIndex, seriesIndex);
  };

  const previewPoint = (labelIndex: number, seriesIndex: number) =>
    setPreview({ labelIndex, seriesIndex });

  const pointStyle = (point: NestedPoint) => ({
    left: `${point.x}%`,
    bottom: `${point.y}%`,
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class={narrow ? "px-3.5 pb-3 pt-4" : "px-4 pb-3 pt-[18px]"}>
        {(chart.yAxisLabel || chart.rightAxisLabel) && (
          <div class="mb-2 flex justify-between font-mono text-nano text-ink-faint">
            <span>{chart.yAxisLabel}</span>
            <span>{chart.rightAxisLabel}</span>
          </div>
        )}
        {multiSeries && (
          <div
            class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
            role="list"
          >
            {datasets.map((dataset, index) => {
              const kind = model.series[index].kind;
              return (
                <span
                  key={`${dataset.label}-${index}`}
                  class="inline-flex min-w-0 items-center gap-1.5 font-mono text-chip text-ink-muted"
                  role="listitem"
                >
                  <span
                    class={kind === "line"
                      ? "h-0.5 w-2.5 shrink-0 rounded-full"
                      : kind === "area"
                      ? "h-2 w-2.5 shrink-0 rounded-[2px] opacity-45"
                      : "size-2 shrink-0 rounded-[2px]"}
                    style={{
                      background: seriesColor(dataset, index, datasets.length),
                    }}
                    aria-hidden="true"
                  />
                  <span class="truncate">
                    {dataset.label || `#${index + 1}`}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        <div class="overflow-x-auto pb-1">
          <div style={{ minWidth: `${chartWidth}px` }}>
            <div
              class="relative h-[132px]"
              onMouseLeave={() => setPreview(null)}
            >
              <span
                class="pointer-events-none absolute inset-x-0 border-t border-line-soft"
                style={{ bottom: `${model.zero}%` }}
                aria-hidden="true"
              />

              {model.series.map((seriesModel) => {
                const dataset = datasets[seriesModel.seriesIndex];
                const color = seriesColor(
                  dataset,
                  seriesModel.seriesIndex,
                  datasets.length,
                );
                if (seriesModel.kind === "bar") {
                  return seriesModel.points.map((point) => {
                    const interactive = Boolean(
                      isPointInteractive?.(
                        point.labelIndex,
                        point.seriesIndex,
                      ),
                    );
                    const bottom = Math.min(point.y, point.baseY);
                    const height = Math.abs(point.y - point.baseY);
                    return (
                      <button
                        key={`${point.seriesIndex}-${point.labelIndex}`}
                        type="button"
                        disabled={!interactive}
                        aria-label={pointLabel(
                          point.labelIndex,
                          point.seriesIndex,
                        )}
                        onClick={() =>
                          activate(point.labelIndex, point.seriesIndex)}
                        onMouseEnter={() =>
                          previewPoint(point.labelIndex, point.seriesIndex)}
                        onFocus={() =>
                          previewPoint(point.labelIndex, point.seriesIndex)}
                        onBlur={() => setPreview(null)}
                        class={`absolute min-h-px rounded-[2px] border-0 p-0 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                          interactive ? "cursor-pointer" : "cursor-default"
                        }`}
                        style={{
                          background: color,
                          bottom: `${bottom}%`,
                          height: `${height}%`,
                          left: `${point.barLeft}%`,
                          width: `${point.barWidth}%`,
                          opacity: point.labelIndex === active ? 1 : 0.72,
                        }}
                      />
                    );
                  });
                }

                const hasInteractivePoint = seriesModel.points.some((point) =>
                  isPointInteractive?.(point.labelIndex, point.seriesIndex)
                );
                const activateFromPath = (
                  event: MouseEvent & { currentTarget: SVGPathElement },
                ) => {
                  event.stopPropagation();
                  const svg = event.currentTarget.ownerSVGElement;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  const labelIndex = nearestLabelIndex(
                    event.clientX,
                    rect.left,
                    rect.width,
                    labels.length,
                  );
                  previewPoint(labelIndex, seriesModel.seriesIndex);
                  activate(labelIndex, seriesModel.seriesIndex);
                };
                return (
                  <svg
                    key={seriesModel.seriesIndex}
                    class="pointer-events-none absolute inset-0 size-full overflow-visible"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {seriesModel.areaPath && (
                      <path
                        d={seriesModel.areaPath}
                        fill={color}
                        fill-opacity="0.16"
                        stroke="none"
                        class={hasInteractivePoint
                          ? "pointer-events-auto cursor-pointer"
                          : undefined}
                        onClick={hasInteractivePoint
                          ? activateFromPath
                          : undefined}
                      />
                    )}
                    <path
                      d={seriesModel.linePath}
                      fill="none"
                      stroke={color}
                      stroke-width="2"
                      stroke-dasharray={dataset.strokeStyle === "dashed"
                        ? "6 3"
                        : undefined}
                      vector-effect="non-scaling-stroke"
                      class={hasInteractivePoint
                        ? "pointer-events-auto cursor-pointer"
                        : undefined}
                      onClick={hasInteractivePoint
                        ? activateFromPath
                        : undefined}
                    />
                  </svg>
                );
              })}

              {model.series.flatMap((seriesModel) => {
                if (seriesModel.kind === "bar") return [];
                const dataset = datasets[seriesModel.seriesIndex];
                const color = seriesColor(
                  dataset,
                  seriesModel.seriesIndex,
                  datasets.length,
                );
                return seriesModel.points.map((point) => {
                  const interactive = Boolean(
                    isPointInteractive?.(point.labelIndex, point.seriesIndex),
                  );
                  return (
                    <button
                      key={`point-${point.seriesIndex}-${point.labelIndex}`}
                      type="button"
                      disabled={!interactive}
                      aria-label={pointLabel(
                        point.labelIndex,
                        point.seriesIndex,
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        activate(point.labelIndex, point.seriesIndex);
                      }}
                      onMouseEnter={() =>
                        previewPoint(point.labelIndex, point.seriesIndex)}
                      onFocus={() =>
                        previewPoint(point.labelIndex, point.seriesIndex)}
                      onBlur={() => setPreview(null)}
                      class={`absolute grid size-6 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-accent ${
                        interactive ? "cursor-pointer" : "cursor-default"
                      }`}
                      style={pointStyle(point)}
                    >
                      <span
                        aria-hidden="true"
                        class={dataset.showDots === false
                          ? "size-1.5 rounded-full opacity-0"
                          : "size-1.5 rounded-full"}
                        style={{ background: color }}
                      />
                    </button>
                  );
                });
              })}
            </div>
            <div class="mt-2.5 flex gap-2 border-t border-line-soft pt-2">
              {labels.map((label, index) => (
                <span
                  key={index}
                  title={label}
                  class={`min-w-0 flex-1 truncate text-center font-mono text-[9.5px] ${
                    index === active ? "text-accent" : "text-ink-faint"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            {chart.xAxisLabel && (
              <div class="mt-1.5 text-right font-mono text-nano text-ink-faint">
                {chart.xAxisLabel}
              </div>
            )}
          </div>
        </div>
      </div>
      {(caption || multiSeries) && labels.length > 0 && (
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line bg-sunken px-4 py-2.5">
          <span class="font-mono text-[11px] font-medium text-accent">
            {labels[active]}
          </span>
          {datasets.map((dataset, index) => (
            <span
              key={`${dataset.label}-${index}`}
              class="inline-flex items-center gap-1.5 font-mono text-meta text-ink"
            >
              {multiSeries && (
                <span class="text-ink-muted">
                  {dataset.label || `#${index + 1}`}:
                </span>
              )}
              {valueLabel(dataset, dataset.values[active] ?? 0)}
            </span>
          ))}
          {caption && (
            <span class="font-sans text-note text-ink-dim">{caption}</span>
          )}
        </div>
      )}
    </div>
  );
}
