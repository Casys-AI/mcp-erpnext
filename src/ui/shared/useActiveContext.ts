import type { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import { canReplaceActiveContext } from "./active-context.ts";
import { createActiveContextController } from "./active-context-controller.ts";

export type { ActiveContextReconcileResult } from "./active-context-controller.ts";

/** The root viewer owns acknowledged context across all its nested surfaces. */
export function useActiveContext(app: App, scopeKey: string) {
  const controller = useMemo(
    () => createActiveContextController(app, scopeKey),
    [app],
  );
  const [state, setState] = useState(controller.getSnapshot);
  // Invalidate old event handlers during render, before the layout effects.
  controller.setScope(scopeKey);
  const actions = useMemo(() => controller.actionsForScope(scopeKey), [
    controller,
    scopeKey,
  ]);

  useLayoutEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    setState(controller.getSnapshot());
    return unsubscribe;
  }, [controller]);
  useLayoutEffect(() => {
    void controller.clearPreviousScope();
  }, [controller, scopeKey]);
  useEffect(() => {
    if (!state.evictedLabel) return;
    const timer = setTimeout(controller.dismissEviction, 2400);
    return () => clearTimeout(timer);
  }, [controller, state.evictedLabel]);
  return {
    ...state,
    supported: canReplaceActiveContext(app.getHostCapabilities()),
    ...actions,
  };
}
