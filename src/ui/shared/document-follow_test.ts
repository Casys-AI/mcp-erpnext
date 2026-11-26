import { assertEquals } from "@std/assert";
import {
  invoiceDocumentRef,
  invoiceSelectionRef,
  matchesInvoiceDocument,
} from "./document-follow.ts";

const invoice = { doctype: "Sales Invoice", name: "SINV-001" } as const;

Deno.test("a linked list emits only the canonical identity of a Sales Invoice row", () => {
  assertEquals(
    invoiceSelectionRef(invoice.doctype, { name: invoice.name, _id: "other" }),
    invoice,
  );
  assertEquals(
    invoiceSelectionRef(invoice.doctype, { _id: invoice.name }),
    null,
  );
  assertEquals(invoiceSelectionRef("Purchase Invoice", invoice), null);
  assertEquals(
    invoiceSelectionRef(invoice.doctype, {
      ...invoice,
      doctype: "Sales Order",
    }),
    null,
  );
  assertEquals(invoiceDocumentRef(invoice.doctype, " SINV-001"), null);
  assertEquals(invoiceDocumentRef(invoice.doctype, 1), null);
});

Deno.test("a linked detail accepts only the exact requested document response", () => {
  assertEquals(matchesInvoiceDocument({ data: invoice }, invoice), true);
  const flat = { ...invoice, status: "Overdue", data: undefined };
  assertEquals(matchesInvoiceDocument(flat, invoice), true);
  for (
    const data of [
      { name: invoice.name },
      { ...invoice, name: "SINV-002" },
      { ...invoice, doctype: "Purchase Invoice" },
      [invoice],
    ]
  ) {
    assertEquals(matchesInvoiceDocument({ data }, invoice), false);
  }
});
