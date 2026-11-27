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
  const board = Symbol("layout receipt");
  type Source = string | typeof board;
  let active = new Map<Source, Selection<Block>>();
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
  function businessSelection(
    entries: Selection<Block>[],
    last: Update,
  ): Update {
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
  function merge(next: Map<Source, Selection<Block>>, last: Update): Update {
    const receipt = next.get(board)?.value;
    if (!receipt) return businessSelection([...next.values()], last);
    const business = businessSelection(
      [...next].filter(([key]) => key !== board).map(([, entry]) => entry),
      {},
    );
    // The board receipt has its own key. Existing business context and
    // attachment blocks keep their original structure in the host snapshot.
    return {
      ...(business.structuredContent || receipt.structuredContent ||
          last.structuredContent
        ? {
          structuredContent: {
            ...business.structuredContent,
            ...receipt.structuredContent,
          },
        }
        : {}),
      ...(business.content || receipt.content || last.content
        ? { content: [...(business.content ?? []), ...(receipt.content ?? [])] }
        : {}),
    };
  }
  function forSource(id: Source, title: string, signal: AbortSignal) {
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
  }
  return {
    forPanel: (id: string, title: string, signal: AbortSignal) =>
      forSource(id, title, signal),
    forBoard: (signal: AbortSignal) => forSource(board, "", signal),
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
