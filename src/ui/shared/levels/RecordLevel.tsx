/**
 * Un niveau « fiche » : un document, ses champs, et d'où l'on peut sauter.
 *
 * Les champs scalaires en lignes clé/valeur (clé mono, valeur à droite,
 * statut en badge), puis « aller à » avec les sauts « › » qui restent dans la
 * vue, et en dessous les questions « ~ » qui sortent vers le modèle.
 */

import { formatCell, HIDDEN_FIELDS, isStatusField } from "../doclist/helpers";
import { StatusCell } from "../doclist/StatusCell";
import { StateMessage } from "../ui";
import { useT } from "../i18n-hook";
import type { Jump } from "../jumps";
import { Label } from "../ui";
import { JumpList } from "./JumpList";

export function RecordLevel(
  { record, jumps, asks, onJump, onAsk, narrow }: {
    record: Record<string, unknown>;
    jumps?: Jump[];
    asks?: { label: string; message: string }[];
    onJump?: (jump: Jump) => void;
    onAsk?: (message: string) => void;
    narrow?: boolean;
  },
) {
  const t = useT();
  const entries = Object.entries(record).filter(([key, value]) =>
    !key.startsWith("_") && !HIDDEN_FIELDS.has(key) &&
    (value == null || ["string", "number", "boolean"].includes(typeof value))
  );
  // Une fiche sans aucun champ lisible n'est pas une fiche : on le dit.
  if (entries.length === 0) {
    return <StateMessage tone="bad">{t("nav.unexpected_body")}</StateMessage>;
  }
  return (
    <div class="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto">
      <dl
        class={narrow
          ? "flex flex-col gap-[9px] px-3.5 py-3"
          : "grid grid-cols-[auto_1fr] gap-x-6 gap-y-[9px] px-4 py-3.5"}
      >
        {entries.map(([key, value]) => (
          <div
            key={key}
            class="contents"
          >
            <dt class="font-mono text-[10.5px] text-ink-faint">
              {key.replace(/_/g, " ")}
            </dt>
            <dd
              class={`min-w-0 text-right font-sans text-data text-ink-2 ${
                narrow ? "" : "truncate"
              }`}
            >
              {isStatusField(key) && typeof value === "string"
                ? <StatusCell value={String(value)} />
                : (
                  <span
                    class={typeof value === "number"
                      ? "font-mono tabular-nums"
                      : ""}
                  >
                    {formatCell(value)}
                  </span>
                )}
            </dd>
          </div>
        ))}
      </dl>
      {((jumps && jumps.length > 0) || (asks && asks.length > 0)) && (
        <div class="flex flex-col gap-2 border-t border-line-soft px-4 py-3">
          {jumps && jumps.length > 0 && <Label>{t("nav.goto")}</Label>}
          <JumpList
            narrow={narrow}
            jumps={jumps ?? []}
            asks={asks ?? []}
            onJump={onJump}
            onAsk={onAsk}
          />
        </div>
      )}
    </div>
  );
}
