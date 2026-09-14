import { assertEquals } from "@std/assert";
import { translatorForLocale } from "../../shared/i18n.ts";
import {
  errorMessage,
  messageText,
  UiError,
  type UiMessage,
} from "./messages.ts";

Deno.test("stable Kanban keeps application feedback translatable after it is stored", () => {
  const stored: UiMessage = { key: "kanban.modal.saved" };
  assertEquals(messageText(stored, translatorForLocale("en")), "Saved");
  assertEquals(messageText(stored, translatorForLocale("fr")), "Enregistré");
  assertEquals(
    messageText(
      errorMessage(new UiError("common.error.no_proxy"), "unused"),
      translatorForLocale("fr"),
    ),
    translatorForLocale("fr")("common.error.no_proxy"),
  );
});

Deno.test("stable Kanban parse failures use translatable application feedback", () => {
  const fr = translatorForLocale("fr");
  assertEquals(
    messageText(
      errorMessage(
        new SyntaxError("Unexpected token"),
        "kanban.error.parse_failed",
      ),
      fr,
    ),
    fr("kanban.error.parse_failed"),
  );
});

Deno.test("stable Kanban diagnostics stay literal even when they resemble translatable feedback", () => {
  for (
    const diagnostic of [
      "Saved",
      "Move failed",
      "Move timed out: SERVER-400",
      "kanban.modal.saved",
    ]
  ) {
    const stored = errorMessage(
      new Error(diagnostic),
      "kanban.modal.save_error",
    );
    assertEquals(messageText(stored, translatorForLocale("fr")), diagnostic);
    assertEquals(messageText(stored, translatorForLocale("ur-PK")), diagnostic);
  }
});

Deno.test("stable Kanban move announcements translate known destinations without changing identifiers", () => {
  const stored: UiMessage = {
    key: "kanban.live.moving",
    params: { title: "TASK-A-01" },
    destination: "Working",
  };
  const fr = translatorForLocale("fr");
  assertEquals(
    messageText(stored, fr),
    fr("kanban.live.moving", {
      title: "TASK-A-01",
      label: fr("kanban.status.working"),
    }),
  );
  assertEquals(stored.destination, "Working");
  const custom: UiMessage = { ...stored, destination: "Client custom stage" };
  assertEquals(
    messageText(custom, fr),
    fr("kanban.live.moving", {
      title: "TASK-A-01",
      label: "Client custom stage",
    }),
  );
});
