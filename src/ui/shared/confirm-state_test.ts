import { assertEquals } from "@std/assert";
import {
  confirmPending,
  dismissConfirm,
  requestConfirm,
} from "./confirm-state.ts";

function pending(calls: string[], name = "A") {
  return {
    subject: name,
    title: "Annuler ?",
    detail: "…",
    actionLabel: "Annuler",
    onConfirm: () => calls.push(name),
  };
}

Deno.test("confirm-state : demander n'exécute rien", () => {
  const calls: string[] = [];
  const state = requestConfirm(null, pending(calls));
  assertEquals(state?.subject, "A");
  assertEquals(calls, []);
});

Deno.test("confirm-state : fermer (Retour, Échap, voile) n'exécute rien", () => {
  const calls: string[] = [];
  requestConfirm(null, pending(calls));
  assertEquals(dismissConfirm(), null);
  assertEquals(calls, []);
});

Deno.test("confirm-state : confirmer exécute une fois, puis l'état est vide", () => {
  const calls: string[] = [];
  const state = requestConfirm(null, pending(calls));
  const { next, run } = confirmPending(state);
  run?.();
  assertEquals(calls, ["A"]);
  assertEquals(next, null);
  // Un second « Confirmer » sur l'état vidé ne relance rien.
  const again = confirmPending(next);
  assertEquals(again.run, null);
  assertEquals(calls, ["A"]);
});

Deno.test("confirm-state : une nouvelle demande remplace la précédente sans l'exécuter", () => {
  const calls: string[] = [];
  const first = requestConfirm(null, pending(calls, "A"));
  const second = requestConfirm(first, pending(calls, "B"));
  confirmPending(second).run?.();
  assertEquals(calls, ["B"]);
});
