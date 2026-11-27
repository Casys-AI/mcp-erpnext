import { t } from "../shared/i18n.ts";

interface PanelUpdate<Block> {
  content?: Block[];
  structuredContent?: Record<string, unknown>;
}

type Selection<Block> = {
  title: string;
  value: PanelUpdate<Block>;
  signal: AbortSignal;
};

/** One host snapshot contains the acknowledged selections of every mounted panel. */
export function createPanelContexts<Block, Options, Response extends object>(
  send: (update: PanelUpdate<Block>, options?: Options) => Promise<Response>,
) {
  type Update = PanelUpdate<Block>;
  let active = new Map<string, Selection<Block>>();
  function liveSelections() {
    return new Map(
      [...active].filter(([, selection]) => !selection.signal.aborted),
    );
  }
  let queued: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = queued.then(work);
    queued = next.catch(() => {});
    return next;
  }
  function hasSelection(value: Update): boolean {
    return Boolean(
      value.content?.length ||
        Object.keys(value.structuredContent ?? {}).length,
    );
  }
  function merge(next: Map<string, Selection<Block>>, last: Update): Update {
    const entries = [...next.values()];
    if (entries.length === 0) return last;
    if (entries.length === 1) return entries[0].value;
    const content = entries.flatMap(({ value }) => value.content ?? []);
    const panels = entries.flatMap(({ title, value }) =>
      value.structuredContent
        ? [{ title, context: value.structuredContent }]
        : []
    );
    return {
      ...(entries.some(({ value }) => value.content !== undefined)
        ? { content }
        : {}),
      ...(panels.length ? { structuredContent: { panels } } : {}),
    };
  }
  return {
    forPanel(id: string, title: string, signal: AbortSignal) {
      return (value: Update, options?: Options) =>
        enqueue(async () => {
          signal.throwIfAborted();
          const next = liveSelections();
          if (hasSelection(value)) next.set(id, { title, value, signal });
          else next.delete(id);
          const response = await send(
            merge(next, value),
            options,
          );
          if (!("isError" in response && response.isError)) {
            active = next;
          }
          return response;
        });
    },
    clear(): Promise<void> {
      return enqueue(async () => {
        const next = liveSelections();
        if (next.size === active.size) return;
        const entries = [...active.values()];
        const empty = {
          ...(entries.some(({ value }) => value.structuredContent !== undefined)
            ? { structuredContent: {} }
            : {}),
          ...(entries.some(({ value }) => value.content !== undefined)
            ? { content: [] }
            : {}),
        };
        const response = await send(merge(next, empty));
        if ("isError" in response && response.isError) {
          throw new Error(t("context.active.error"));
        }
        active = next;
      });
    },
  };
}
