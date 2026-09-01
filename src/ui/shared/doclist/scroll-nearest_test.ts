import { assertEquals } from "@std/assert";
import { nearestScrollDelta } from "./scroll-nearest.ts";

const FRAME = { top: 0, bottom: 200 };

Deno.test("nearest scroll - déjà dans le cadre : rien", () => {
  assertEquals(nearestScrollDelta(FRAME, { top: 20, bottom: 80 }), 0);
});

Deno.test("nearest scroll - dépasse en bas : le minimum vers le bas", () => {
  assertEquals(nearestScrollDelta(FRAME, { top: 150, bottom: 250 }), 50);
});

Deno.test("nearest scroll - dépasse en haut : le minimum vers le haut", () => {
  assertEquals(nearestScrollDelta(FRAME, { top: -40, bottom: 40 }), -40);
});

Deno.test("nearest scroll - plus haut que le cadre : aligne le haut", () => {
  // Le squelette tenait ; l'enveloppe réelle dépasse. Aligner le pied
  // cacherait le début du détail qu'on vient d'ouvrir.
  assertEquals(nearestScrollDelta(FRAME, { top: 80, bottom: 400 }), 80);
  assertEquals(nearestScrollDelta(FRAME, { top: -30, bottom: 300 }), -30);
});
