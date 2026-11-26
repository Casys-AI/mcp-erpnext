import {
  INVOICE_FOLLOW_PORTS,
  type InvoiceDocumentRef,
  invoiceDocumentRef,
  type InvoiceFocusReceiver,
  type ViewerInteractions,
} from "../shared/document-follow.ts";

const { source, target } = INVOICE_FOLLOW_PORTS;

/** Ports implemented by the actual viewers mounted by the ERP board. */
export function invoiceViewPorts(uri: string) {
  if (uri === source.resourceUri) return { emits: [source.event] };
  if (uri === target.resourceUri) return { accepts: [target.action] };
}

/** Bind the selected invoice routes to this board's mounted viewer instances. */
export function createInvoicePanelInteractions(
  board: {
    children: readonly { slot: number; componentId?: string }[];
    sync: readonly {
      from: number;
      to: number | "*";
      event: string;
      action: string;
    }[];
  },
  signal: AbortSignal,
  emit: (
    id: string,
    event: string,
    data: InvoiceDocumentRef,
    deliver: (id: string, action: string, data: unknown) => void,
  ) => void,
) {
  type Target = {
    mounted?: boolean;
    receive?: InvoiceFocusReceiver | null;
    displayed?: InvoiceDocumentRef | null;
  };
  type Selection = {
    targets: Set<string>;
    ref: InvoiceDocumentRef;
    fallback: () => void;
    handled: boolean;
  };
  const targets = new Map<string, Target>();
  const pending = new Map<string, Selection>();
  const listeners = new Set<() => void>();
  signal.addEventListener("abort", () => {
    listeners.clear();
    pending.clear();
    targets.clear();
  }, { once: true });

  function targetState(id: string) {
    const state = targets.get(id);
    if (state?.mounted === false || state?.receive === null) return false;
    return state?.mounted ? state.receive : undefined;
  }

  function receive(id: string, ref: InvoiceDocumentRef) {
    const receiver = targetState(id);
    if (!receiver) return false;
    if (receiver(ref)) return true;
    setTarget(id, { receive: null });
    return false;
  }

  function setTarget(id: string, update: Target) {
    if (signal.aborted) return;
    const before = targets.get(id);
    const wasAvailable = targetState(id) !== false;
    const previous = before?.mounted && before.receive
      ? before.displayed?.name
      : undefined;
    targets.set(id, { ...targets.get(id), ...update });
    const state = targetState(id);
    const displayed = state ? targets.get(id)?.displayed?.name : undefined;
    if (wasAvailable !== (state !== false) || previous !== displayed) {
      for (const listener of listeners) listener();
    }
    if (state === undefined) return;
    for (const [sourceId, selection] of pending) {
      if (!selection.targets.delete(id)) continue;
      selection.handled = receive(id, selection.ref) || selection.handled;
      if (selection.targets.size === 0) {
        pending.delete(sourceId);
        if (!selection.handled) selection.fallback();
      }
    }
  }

  return {
    setMounted(id: string, mounted: boolean) {
      setTarget(id, { mounted });
    },
    forPanel(slot: number, id: string): ViewerInteractions | undefined {
      const routes = board.sync.filter((rule) =>
        rule.from === slot && rule.event === source.event
      );
      if (routes.length) {
        const routeTargets = board.children.filter((child) =>
          routes.some((rule) => rule.to === child.slot)
        ).flatMap((child) => child.componentId ? [child.componentId] : []);
        return {
          invoiceSelection: {
            canFollow: () =>
              !signal.aborted &&
              routeTargets.some((id) => targetState(id) !== false),
            isOpen: (ref) =>
              !signal.aborted && routeTargets.some((targetId) => {
                const target = targets.get(targetId);
                return Boolean(
                  target?.mounted && target.receive &&
                    target.displayed?.name === ref.name &&
                    target.displayed?.doctype === ref.doctype,
                );
              }),
            subscribe(listener) {
              listeners.add(listener);
              return () => listeners.delete(listener);
            },
            cancelPending() {
              pending.delete(id);
            },
            select(ref, fallback) {
              if (signal.aborted) return;
              pending.delete(id);
              const selection: Selection = {
                targets: new Set(),
                ref,
                fallback,
                handled: false,
              };
              emit(
                id,
                source.event,
                ref,
                (to, action, data) => {
                  if (
                    action !== target.action || !data ||
                    typeof data !== "object"
                  ) return;
                  const requested = invoiceDocumentRef(
                    "doctype" in data ? data.doctype : undefined,
                    "name" in data ? data.name : undefined,
                  );
                  if (!requested) return;
                  if (targetState(to) === undefined) selection.targets.add(to);
                  else {selection.handled = receive(to, requested) ||
                      selection.handled;}
                },
              );
              if (selection.targets.size) pending.set(id, selection);
              else if (!selection.handled) fallback();
            },
          },
        };
      }
      if (
        board.sync.some((rule) =>
          rule.to === slot && rule.action === target.action
        )
      ) {
        return {
          setInvoiceFocus: (receive, displayed) =>
            setTarget(id, { receive, displayed }),
        };
      }
    },
  };
}
