/** @jsxImportSource preact */
/**
 * Le filtre de la barre d'en-tête.
 *
 * En large c'est une pilule toujours ouverte. En mobile la maquette la replie
 * derrière un bouton de 32×32 — à 390 px on ne garde pas un champ ouvert à
 * côté du titre, et un filtre n'est pas ce qu'on ouvre en premier au doigt.
 *
 * Le bouton et le champ déplié sont deux composants parce qu'ils vivent à deux
 * endroits du document : le bouton dans la barre d'actions, le champ sur sa
 * propre rangée sous l'en-tête. Glisser le champ dans la barre écraserait le
 * titre. L'état d'ouverture appartient donc au viewer, qui place les deux.
 */

import { useEffect, useRef } from "preact/hooks";
import type { ViewerLayout } from "~/shared/useViewerLayout";
import { useT } from "~/shared/i18n-hook";

function MagnifierIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      class="shrink-0"
    >
      <circle cx="5" cy="5" r="3.6" stroke="currentColor" stroke-width="1.2" />
      <path
        d="M7.8 7.8L10.5 10.5"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Va dans la barre d'actions : pilule ouverte en large, bouton en mobile. */
export function SearchControl(
  { value, layout, open, onOpenChange, onInput }: {
    value: string;
    layout: ViewerLayout;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInput: (next: string) => void;
  },
) {
  const t = useT();
  if (layout !== "mobile") {
    return (
      // group : permet à focus-within sur le label de colorer l'icône enfant.
      // focus-within:border-accent-edge : sourd (acier) plutôt que le plein accent.
      // focus-within:outline-accent/20 : halo translucide, 2 px, rentrant d'1 px.
      <label class="group flex items-center gap-[7px] rounded-control border border-line bg-sunken px-2.5 py-[5px] focus-within:border-accent-edge focus-within:outline-2 focus-within:-outline-offset-[1px] focus-within:outline-accent/20">
        <span class="text-ink-faint group-focus-within:text-accent-text">
          <MagnifierIcon />
        </span>
        <input
          type="search"
          value={value}
          placeholder={t("common.filter.placeholder")}
          aria-label={t("common.filter.label")}
          onInput={(event) => onInput((event.target as HTMLInputElement).value)}
          class="w-20 bg-transparent font-mono text-meta text-ink placeholder:text-ink-faint transition-[width] duration-200 focus:w-[220px] focus:outline-none"
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={t("common.filter.label")}
      onClick={() => {
        // Refermer sur un filtre actif le masquerait sans le lever : on purge.
        if (open && value) onInput("");
        onOpenChange(!open);
      }}
      class={`flex size-8 shrink-0 items-center justify-center rounded-touch border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        open || value
          ? "border-accent bg-accent/14 text-accent"
          : "border-line bg-control text-ink-muted"
      }`}
    >
      <MagnifierIcon size={13} />
    </button>
  );
}

/** Va sous l'en-tête, sur toute la largeur — mobile déplié seulement. */
export function SearchRow(
  { value, onInput, onClose }: {
    value: string;
    onInput: (next: string) => void;
    onClose: () => void;
  },
) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  // Ouvrir sans donner le focus obligerait à un second tap.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div class="shrink-0 px-3 pb-2.5">
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={t("common.filter.placeholder")}
        aria-label={t("common.filter.label")}
        onInput={(event) => onInput((event.target as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          onInput("");
          onClose();
        }}
        class="w-full rounded-control border border-line bg-sunken px-2.5 py-1.5 font-mono text-data text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
    </div>
  );
}
