import { assertEquals } from "@std/assert";
import {
  DOCUMENT_CHANGE_EVENT_NAME,
  DOCUMENT_MUTATION_KINDS,
  type DocumentChangeEvent,
  isDocumentChangeEvent,
} from "./document-events.ts";

const validEvent: DocumentChangeEvent = {
  doctype: "Sales Invoice",
  name: "SINV-00046",
  mutation: "attachment.added",
  committedAt: "2026-08-24T06:02:03.456Z",
  source: "document-viewer",
};

Deno.test("document change - contrat routable et payload valide", () => {
  assertEquals(DOCUMENT_CHANGE_EVENT_NAME, "erpnext.document.changed");
  assertEquals(DOCUMENT_MUTATION_KINDS, [
    "update",
    "submit",
    "cancel",
    "attachment.added",
  ]);
  assertEquals(
    DOCUMENT_MUTATION_KINDS.map((mutation) =>
      isDocumentChangeEvent({ ...validEvent, mutation })
    ),
    [true, true, true, true],
  );
  assertEquals(isDocumentChangeEvent(validEvent), true);
  assertEquals(
    isDocumentChangeEvent({
      ...validEvent,
      committedAt: "2026-08-24T14:02:03+08:00",
    }),
    true,
  );
  assertEquals(
    isDocumentChangeEvent({ ...validEvent, source: undefined }),
    true,
  );
});

Deno.test("document change - rejette les références, mutations et dates invalides", () => {
  const invalid = [
    null,
    { ...validEvent, doctype: " " },
    { ...validEvent, name: "" },
    { ...validEvent, mutation: "delete" },
    { ...validEvent, committedAt: "24/08/2026 14:02" },
    { ...validEvent, committedAt: "not-a-date" },
    { ...validEvent, source: " " },
  ];

  assertEquals(invalid.map(isDocumentChangeEvent), invalid.map(() => false));
});
