import {
  type composeSnippetBoard,
  emitSnippetBoardEvent,
} from "@mcpview/compose/code-mode/board";
import {
  INVOICE_FOLLOW_PORTS,
  type InvoiceDocumentRef,
  invoiceDocumentRef,
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
  board: ReturnType<typeof composeSnippetBoard>,
  signal: AbortSignal,
) {
  type Receive = (ref: InvoiceDocumentRef) => void;
  const listeners = new Map<string, Receive>();
  const pending = new Map<string, InvoiceDocumentRef>();
  signal.addEventListener("abort", () => {
    listeners.clear();
    pending.clear();
  }, { once: true });

  function deliver(id: string, action: string, data: unknown) {
    if (
      signal.aborted || action !== target.action || !data ||
      typeof data !== "object"
    ) return;
    const ref = invoiceDocumentRef(
      "doctype" in data ? data.doctype : undefined,
      "name" in data ? data.name : undefined,
    );
    if (!ref) return;
    const receive = listeners.get(id);
    if (receive) receive(ref);
    // A user can select an invoice while the adjacent viewer is still mounting.
    else pending.set(id, ref);
  }

  return (slot: number, id: string): ViewerInteractions | undefined => {
    if (
      board.sync.some((rule) =>
        rule.from === slot && rule.event === source.event
      )
    ) {
      return {
        onInvoiceSelected(ref) {
          if (!signal.aborted) {
            emitSnippetBoardEvent(board, id, source.event, ref, deliver);
          }
        },
      };
    }
    if (
      board.sync.some((rule) =>
        rule.to === slot && rule.action === target.action
      )
    ) {
      return {
        subscribeInvoiceFocus(receive) {
          if (signal.aborted) return () => {};
          listeners.set(id, receive);
          const ref = pending.get(id);
          if (ref) {
            pending.delete(id);
            receive(ref);
          }
          return () => {
            if (listeners.get(id) === receive) listeners.delete(id);
          };
        },
      };
    }
  };
}
