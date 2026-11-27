/** A layout receipt is conversation-local. The dashboard data stays in its panels. */
export interface LayoutReceipt {
  runId: string;
  revision: number;
  status: "pending" | "ready" | "failed";
}

/** Keep only the latest committed gesture visible when host acknowledgements cross. */
export function createLayoutPublisher<Layout>(
  runId: string,
  signal: AbortSignal,
  stage: (layout: Layout, revision: number) => Promise<void>,
  publish: (receipt: LayoutReceipt) => Promise<void>,
  show: (status: LayoutReceipt["status"]) => void,
) {
  let latest = 0;
  return async (layout: Layout) => {
    if (signal.aborted) return;
    const revision = ++latest;
    const current = () => revision === latest && !signal.aborted;
    show("pending");
    try {
      await Promise.all([
        publish({ runId, revision, status: "pending" }),
        stage(layout, revision),
      ]);
      if (!current()) return;
      await publish({ runId, revision, status: "ready" });
      if (current()) show("ready");
    } catch {
      if (!current()) return;
      show("failed");
      try {
        await publish({ runId, revision, status: "failed" });
      } catch {
        // The visible failure and retry remain available even if the host disconnected.
      }
    }
  };
}
