import { assertEquals } from "@std/assert";
import { translatorForLocale } from "../../shared/i18n.ts";
import {
  type KanbanLiveMessage,
  kanbanLiveMessageText,
} from "./live-message.ts";

Deno.test("Kanban move announcements translate server column destinations", () => {
  const message: KanbanLiveMessage = {
    key: "kanban.live.moved",
    title: "TASK-{label}/1",
    destination: "Working",
  };
  assertEquals(
    kanbanLiveMessageText(message, translatorForLocale("fr-FR")),
    "Déplacé TASK-{label}/1 vers En cours",
  );
  assertEquals(message.destination, "Working");
  assertEquals(message.title, "TASK-{label}/1");
});

Deno.test("Kanban pending and rejected moves translate canonical action labels", () => {
  const t = translatorForLocale("fr-FR");
  assertEquals(
    kanbanLiveMessageText({
      key: "kanban.live.moving",
      title: "Aléa",
      destination: "Start work",
    }, t),
    "Déplacement de Aléa vers Démarrer",
  );
  assertEquals(
    kanbanLiveMessageText({
      key: "kanban.live.queued",
      title: "Aléa",
      destination: "Working",
    }, t),
    "Aléa en attente pour En cours",
  );
  assertEquals(
    kanbanLiveMessageText({
      key: "kanban.live.move_not_allowed",
      destination: "Working",
    }, t),
    "Déplacement vers En cours non autorisé",
  );
});

Deno.test("Kanban announcement snapshots follow a locale change with the same translator identity", () => {
  let locale = "fr-FR";
  const t: ReturnType<typeof translatorForLocale> = (key, params) =>
    translatorForLocale(locale)(key, params);
  const message: KanbanLiveMessage = {
    key: "kanban.live.moved",
    title: "TASK-001",
    destination: "Working",
  };
  assertEquals(
    kanbanLiveMessageText(message, t),
    "Déplacé TASK-001 vers En cours",
  );
  locale = "zh-Hant-TW";
  assertEquals(
    kanbanLiveMessageText(message, t),
    "已將 TASK-001 移至 進行中",
  );
  locale = "en-US";
  assertEquals(kanbanLiveMessageText(message, t), "Moved TASK-001 to Working");
  assertEquals(message, {
    key: "kanban.live.moved",
    title: "TASK-001",
    destination: "Working",
  });
});

Deno.test("Kanban announcements preserve custom destinations and server diagnostics", () => {
  const t = translatorForLocale("fr-FR");
  for (const destination of ["Casys {label}/review", "constructor", ""]) {
    assertEquals(
      kanbanLiveMessageText({
        key: "kanban.live.moved",
        title: "TASK-001",
        destination,
      }, t),
      `Déplacé TASK-001 vers ${destination}`,
    );
  }
  const diagnostic = "Working: server rejected move for TASK-001";
  assertEquals(kanbanLiveMessageText(diagnostic, t), diagnostic);
});
