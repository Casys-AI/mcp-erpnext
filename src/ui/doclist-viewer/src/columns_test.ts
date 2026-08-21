import { assertEquals } from "@std/assert";
import {
  pickAmountColumn,
  pickNarrowColumns,
  shortenId,
  sumColumn,
} from "./columns.ts";

Deno.test("shortenId garde la queue, qui porte la distinction", () => {
  assertEquals(shortenId("ACC-SINV-2026-00046"), "…2026-00046");
  assertEquals(shortenId("MAT-DN-2026-00007"), "…2026-00007");
});

Deno.test("shortenId laisse passer ce qui tient déjà", () => {
  assertEquals(shortenId("TASK-0001"), "TASK-0001");
  assertEquals(shortenId("12345678901234", 14), "12345678901234");
});

Deno.test("shortenId ne coupe pas au milieu d'un segment", () => {
  // Un compte de caractères aurait rendu "…V-2026-00046".
  assertEquals(shortenId("ACC-SINV-2026-00046").startsWith("…2026"), true);
});

Deno.test("shortenId rend la chaîne entière faute de segments à jeter", () => {
  // Deux segments seulement : il n'y a pas de préfixe à sacrifier.
  assertEquals(shortenId("UNNOMTRESLONG-00001"), "UNNOMTRESLONG-00001");
  // Aucun tiret du tout.
  assertEquals(shortenId("UNIDENTIFIANTSANSTIRET"), "UNIDENTIFIANTSANSTIRET");
});

Deno.test("pickAmountColumn préfère le reste dû au total facturé", () => {
  const columns = [
    { id: "name", numeric: false },
    { id: "grand_total", numeric: true },
    { id: "outstanding_amount", numeric: true },
  ];
  assertEquals(pickAmountColumn(columns), "outstanding_amount");
});

Deno.test("pickAmountColumn retombe sur la dernière colonne numérique", () => {
  const columns = [
    { id: "name", numeric: false },
    { id: "poids", numeric: true },
    { id: "volume", numeric: true },
  ];
  assertEquals(pickAmountColumn(columns), "volume");
});

Deno.test("pickAmountColumn rend undefined sans colonne numérique", () => {
  assertEquals(pickAmountColumn([{ id: "name", numeric: false }]), undefined);
});

Deno.test("sumColumn ignore les trous et les non-nombres", () => {
  const rows = [
    { du: 100 },
    { du: null },
    { du: "250" },
    { du: 50 },
  ];
  assertEquals(sumColumn(rows, "du"), 150);
});

Deno.test("sumColumn rend null quand rien n'est sommable", () => {
  assertEquals(sumColumn([{ du: null }, {}], "du"), null);
  assertEquals(sumColumn([{ du: 1 }], undefined), null);
});

Deno.test("pickNarrowColumns garde pièce, tiers et montant", () => {
  const columns = [
    { id: "name", numeric: false },
    { id: "status", numeric: false },
    { id: "customer", numeric: false },
    { id: "outstanding_amount", numeric: true },
  ];
  const isStatus = (k: string) => k === "status";
  assertEquals(
    pickNarrowColumns(columns, "outstanding_amount", isStatus),
    { idKey: "name", labelKey: "customer", amountKey: "outstanding_amount" },
  );
});

Deno.test("pickNarrowColumns saute le statut, porté par le liseré", () => {
  // Le statut vient avant le client : il ne doit pas être pris pour le tiers.
  const columns = [
    { id: "name", numeric: false },
    { id: "workflow_state", numeric: false },
    { id: "supplier", numeric: false },
  ];
  const isStatus = (k: string) => k === "workflow_state";
  assertEquals(
    pickNarrowColumns(columns, undefined, isStatus).labelKey,
    "supplier",
  );
});

Deno.test("shortenId à un seul segment rend le numéro nu", () => {
  // La maquette mobile n'affiche que « …00046 ».
  assertEquals(shortenId("ACC-SINV-2026-00046", 10, 1), "…00046");
});
