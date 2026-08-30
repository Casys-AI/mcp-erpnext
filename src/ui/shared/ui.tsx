/** @jsxImportSource preact */
/**
 * Primitives Direction B v2.
 *
 * Taillées pour la maquette plutôt qu'héritées d'un kit générique : la
 * direction décide sa forme, son padding et sa typo, donc un composant neutre
 * qu'il faudrait ensuite contredire coûterait plus que ces quelques lignes.
 *
 * Tout passe par des classes Tailwind, jamais par var() en style inline —
 * Tailwind élague les tokens qu'aucune classe ne référence, et un token élagué
 * garde sa valeur sombre en perdant sa valeur claire. Voir shared/status.ts.
 *
 * Destinées à remonter dans @casys/mcp-view comme charte maison une fois
 * éprouvées ici ; d'où l'absence de toute dépendance à ce paquet.
 */

import type { ComponentChildren, JSX, Ref } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { ViewerLayout } from "./useViewerLayout";
import { useT } from "./i18n-hook";
import casysLogo from "./casys-logo.svg?url";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Coquille ─────────────────────────────────────────────────────── */

/**
 * La carte qui contient toute une vue : filet dégradé, bordure, coins arrondis.
 *
 * `overflow-hidden` n'est pas cosmétique — c'est lui qui fait que le filet de
 * 2 px épouse le rayon de 8 px au lieu de dépasser aux angles.
 */
export function ViewerShell(
  { children, class: klass, containerRef, style }: {
    children: ComponentChildren;
    class?: string;
    /** Cible de mesure pour useContainerWidth — la coquille EST le conteneur. */
    containerRef?: Ref<HTMLDivElement>;
    /** Bornes dynamiques annoncées par l'hôte MCP. */
    style?: JSX.CSSProperties;
  },
) {
  return (
    <div
      ref={containerRef}
      style={style}
      class={cx(
        "flex min-h-0 flex-col overflow-hidden rounded-card",
        "border border-line bg-surface",
        klass,
      )}
    >
      <div class="brand-rule" />
      {children}
    </div>
  );
}

/**
 * En-tête de vue : titre, compteur, pastille live à gauche ; actions à droite.
 *
 * En étroit la maquette resserre le titre, retire le mot « live » derrière son
 * point et laisse tomber les actions — la place manque, et le filtre comme le
 * CSV ne sont pas ce qu'on vient chercher dans un panneau latéral.
 */
export function ViewerHeader(
  { title, count, live, actions, layout = "wide" }: {
    title: string;
    count?: number;
    live?: boolean;
    /** Actions de droite : la barre complète en large, l'icône seule en mobile. */
    actions?: ComponentChildren;
    layout?: ViewerLayout;
  },
) {
  const narrow = layout !== "wide";
  return (
    <header
      class={cx(
        "flex shrink-0 items-center justify-between gap-4 border-b border-line",
        narrow ? "px-3.5 py-3" : "px-4 py-[13px]",
      )}
    >
      <div
        class={cx("flex min-w-0 items-center", narrow ? "gap-2.5" : "gap-3")}
      >
        <h2
          class={cx(
            "truncate font-display font-semibold text-ink",
            layout === "mobile"
              ? "text-card-title"
              : layout === "panel"
              ? "text-[15px]"
              : "text-title tracking-title",
          )}
        >
          {title}
        </h2>
        {count !== undefined && <CountBadge narrow={narrow}>{count}
        </CountBadge>}
        {live && !narrow && <LiveDot />}
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        {layout !== "panel" && actions}
        {narrow && live && (
          <span
            class={`shrink-0 rounded-full bg-ok ${
              layout === "mobile" ? "size-1.5" : "size-[5px]"
            }`}
          />
        )}
      </div>
    </header>
  );
}

/**
 * Pied de vue : pagination à gauche, crédit Casys à droite.
 *
 * En étroit la maquette ne garde que le crédit — la pagination y disparaît au
 * profit du défilement.
 */
export function ViewerFooter(
  { children, layout = "wide" }: {
    children?: ComponentChildren;
    layout?: ViewerLayout;
  },
) {
  // Seul le panneau latéral renonce à la pagination : il défile.
  const showPaging = layout !== "panel";
  return (
    <footer
      class={cx(
        "flex shrink-0 items-center gap-4 border-t border-line py-[9px]",
        layout === "wide" ? "px-4" : "px-3",
        showPaging ? "justify-between" : "justify-end",
      )}
    >
      {showPaging && <div class="flex items-center gap-2.5">{children}</div>}
      <CasysCredit compact={layout === "mobile"} />
    </footer>
  );
}

export function CasysCredit({ compact }: { compact?: boolean } = {}) {
  const size = compact ? 12 : 13;
  return (
    <a
      class={cx(
        "inline-flex items-center text-ink-faint transition-colors",
        "font-mono tracking-[0.04em] hover:text-accent",
        "focus-visible:rounded-badge focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        compact ? "gap-1.5 text-micro" : "gap-[7px] text-chip",
      )}
      href="https://casys.ai"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src={casysLogo}
        alt=""
        width={size}
        height={size}
        class={cx("block", compact ? "size-3" : "size-[13px]")}
      />
      <span>Powered by Casys.ai</span>
    </a>
  );
}

/* ── Marqueurs ────────────────────────────────────────────────────── */

export function CountBadge(
  { children, narrow }: { children: ComponentChildren; narrow?: boolean },
) {
  return (
    <span
      class={cx(
        "shrink-0 rounded-badge bg-count py-0.5 font-mono text-ink-muted",
        narrow ? "px-1.5 text-chip" : "px-[7px] text-meta",
      )}
    >
      {children}
    </span>
  );
}

/** Pastille de fraîcheur : la vue se rafraîchit toute seule et le dit. */
export function LiveDot({ label }: { label?: string }) {
  const t = useT();
  return (
    <span class="flex shrink-0 items-center gap-1.5">
      <span class="size-[5px] rounded-full bg-ok" />
      <span class="font-mono text-micro uppercase tracking-live text-ink-faint">
        {label ?? t("layout.live")}
      </span>
    </span>
  );
}

/** Micro-label monospace : en-têtes de colonne, clés d'inspecteur, eyebrows. */
export function Label(
  { children, class: klass }: { children: ComponentChildren; class?: string },
) {
  return (
    <span
      class={cx(
        "font-mono text-micro uppercase tracking-label text-ink-faint",
        klass,
      )}
    >
      {children}
    </span>
  );
}

/* ── Contrôles ────────────────────────────────────────────────────── */

type ButtonVariant = "accent" | "secondary" | "danger" | "quiet";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  accent: "bg-accent/14 border-accent-edge text-accent-text hover:bg-accent/22",
  secondary:
    "bg-control border-line text-ink-muted hover:border-line-hover hover:text-ink",
  danger: "bg-transparent border-bad/30 text-bad hover:bg-bad/10",
  quiet: "bg-count border-transparent text-ink-muted hover:text-ink",
};

export function Button(
  { variant = "secondary", class: klass, children, ...rest }:
    & { variant?: ButtonVariant; class?: string; children: ComponentChildren }
    & Omit<JSX.IntrinsicElements["button"], "class" | "children">,
) {
  return (
    <button
      type="button"
      class={cx(
        "rounded-control border px-3 py-[7px] font-sans text-data font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        BUTTON_VARIANT[variant],
        klass,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Bouton compact de barre d'outils — la pilule « CSV », les flèches de page. */
export function ToolButton(
  { class: klass, children, ...rest }:
    & { class?: string; children: ComponentChildren }
    & Omit<JSX.IntrinsicElements["button"], "class" | "children">,
) {
  return (
    <button
      type="button"
      class={cx(
        "rounded-control border border-line bg-count px-2.5 py-[5px]",
        "font-mono text-meta text-ink-muted transition-colors",
        "hover:border-line-hover hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        klass,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Chip de filtre. Actif : cerné d'accent. Inactif : creux, se réveille au survol. */
export function Chip(
  { active, pill, children, ...rest }:
    & { active?: boolean; pill?: boolean; children: ComponentChildren }
    & Omit<JSX.IntrinsicElements["button"], "class" | "children">,
) {
  return (
    <button
      type="button"
      aria-pressed={active}
      class={cx(
        "shrink-0 border",
        // En mobile les chips deviennent des pilules et défilent horizontalement.
        pill ? "rounded-pill px-2.5 py-1" : "rounded-chip px-2.5 py-[3px]",
        "font-mono text-chip uppercase tracking-chip transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent/14 text-accent"
          : "border-line bg-control text-ink-muted hover:border-line-hover hover:text-ink",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Données ──────────────────────────────────────────────────────── */

/** Ligne clé/valeur de l'inspecteur. La clé en mono faint, la valeur alignée à droite. */
export function InfoRow(
  { label, children, mono }: {
    label: string;
    children: ComponentChildren;
    mono?: boolean;
  },
) {
  return (
    <div class="flex items-baseline justify-between gap-2.5">
      <span class="shrink-0 font-mono text-chip text-ink-faint">{label}</span>
      <span
        class={cx(
          // Les deux branches partagent la même taille : une paire clé/valeur
          // dont la valeur change de corps selon qu'elle est mono ou non se lit
          // comme deux systèmes cousus ensemble.
          "min-w-0 truncate text-right text-note text-ink-2",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * Bandeau de total en pied de liste, sur fond enfoncé.
 *
 * La valeur change de police selon la mise en page : en chasse fixe à 14 px
 * quand elle clôt une colonne de chiffres déjà alignés, en Space Grotesk à
 * 17 px en étroit où elle devient le seul chiffre de la vue et doit porter.
 */
export function TotalRow(
  { label, children, layout = "wide" }: {
    label: string;
    children: ComponentChildren;
    layout?: ViewerLayout;
  },
) {
  const narrow = layout !== "wide";
  return (
    <div
      class={cx(
        "flex shrink-0 items-baseline justify-between gap-2.5",
        "border-t border-line bg-sunken",
        narrow ? "px-3 py-[11px]" : "px-3.5 py-2.5",
      )}
    >
      <Label>{label}</Label>
      <span
        class={cx(
          "font-semibold tabular-nums text-ink",
          narrow ? "font-display text-title" : "font-mono text-lede",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * Jauge de progression des cartes kanban et des barres d'avancement.
 *
 * Les classes de remplissage sont énumérées, pas composées : Tailwind scanne
 * du texte source, donc un `bg-${tone}` construit à l'exécution ne produirait
 * aucune règle et la barre serait transparente.
 */
const PROGRESS_FILL = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  brand: "bg-brand",
} as const;

export function ProgressBar(
  { value, tone = "accent" }: {
    value: number;
    tone?: keyof typeof PROGRESS_FILL;
  },
) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div class="h-[3px] overflow-hidden rounded-bar bg-track">
      <div
        class={cx("h-full rounded-bar", PROGRESS_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Détail d'un enregistrement ───────────────────────────────────── */

/**
 * La feuille de détail — modale ou panneau replié.
 *
 * La maquette ne montre aucune modale : ce composant dérive de son inspecteur
 * (doclist, colonne de 268 px) plutôt que d'inventer. On en garde ce qui fait
 * le patron « détail d'un enregistrement » : fond enfoncé, clé en mono
 * minuscule, valeur alignée à droite, sections séparées par un filet, actions
 * empilées en fin de course.
 *
 * S'y ajoute ce qu'une modale réclame et qu'un panneau latéral n'a pas : un
 * voile, une fermeture par Échap, et le filet dégradé qui la rattache au reste
 * du système — sans lui, une surface flottante n'appartient à rien.
 */
export function DetailSheet(
  { title, eyebrow, children, footer, onClose, size = "compact", bodyClass }: {
    title: string;
    eyebrow?: string;
    children: ComponentChildren;
    footer?: ComponentChildren;
    onClose: () => void;
    size?: "compact" | "wide" | "preview";
    bodyClass?: string;
  },
) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));

      if (focusable.length === 0) {
        event.preventDefault();
        sheet.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === sheet)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    // Le focus part sur la feuille : sans ça il reste sur la carte du fond et
    // la tabulation continue de parcourir ce que le voile a masqué.
    sheetRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      class={cx(
        "fixed inset-0 z-50 flex items-center justify-center bg-scrim",
        size === "preview" ? "p-3 md:p-6" : "p-6",
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        class={cx(
          "flex max-h-full w-full flex-col overflow-hidden rounded-card border border-line-modal bg-surface shadow-modal outline-none",
          size === "preview"
            ? "h-[min(92vh,860px)] max-w-[1080px]"
            : size === "wide"
            ? "max-w-[680px]"
            : "max-w-[436px]",
        )}
      >
        <div class="brand-rule" />

        <header class="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-[13px]">
          <div class="flex min-w-0 flex-col gap-[3px]">
            {eyebrow && <Label>{eyebrow}</Label>}
            <h2 class="truncate font-display text-card-title font-semibold text-ink">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            class={cx(
              "-mr-1 -mt-1 flex shrink-0 items-center justify-center rounded-touch text-lede leading-none text-ink-faint transition-colors hover:bg-row-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              size === "preview" ? "size-11" : "size-8",
            )}
          >
            ×
          </button>
        </header>

        {
          /*
          Le corps reste sur `surface`, pas sur `sunken` : dans une modale, le
          voile a déjà creusé la profondeur. Un second enfoncement à l'intérieur
          n'ajouterait pas de hiérarchie, il ternirait les champs.
          Seul le défilement vit ici — le voile, lui, ne défile pas.
        */
        }
        <div
          class={cx(
            "scroll-slim flex min-h-0 flex-col overflow-y-auto bg-surface",
            size === "preview" ? "gap-0 p-0" : "gap-4 p-4",
            bodyClass,
          )}
        >
          {children}
        </div>

        {footer && (
          <footer class="flex shrink-0 flex-col border-t border-line">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * Une rangée du pied de modale.
 *
 * La maquette empile deux rangées séparées d'un filet : l'action qui engage le
 * document au-dessus, les déplacements de colonne en dessous. Deux composants
 * plutôt qu'une prop `{primary, secondary}` sur DetailSheet — la signature
 * générique reste utilisable par les appelants qui n'ont qu'une rangée.
 */
export function SheetActions(
  { children, label }: { children: ComponentChildren; label?: string },
) {
  return (
    <div class="flex flex-wrap items-center gap-1.5 border-t border-line-soft px-4 py-3 first:border-t-0">
      {label && <Label class="mr-1">{label}</Label>}
      {children}
    </div>
  );
}

/** Groupe de champs sous un micro-titre, séparé du précédent par un filet. */
export function DetailSection(
  { label, children }: { label?: string; children: ComponentChildren },
) {
  return (
    <section class="flex flex-col gap-2.5 border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
      {label && <Label>{label}</Label>}
      {children}
    </section>
  );
}

/**
 * Un champ de saisie.
 *
 * La clé reste en mono minuscule, comme dans l'inspecteur : deux systèmes de
 * libellés dans la même feuille — sans capitalisé ici, mono capitales là —
 * font lire deux interfaces cousues ensemble.
 */
export function Field(
  { label, children, hint }: {
    label: string;
    children: ComponentChildren;
    hint?: string;
  },
) {
  return (
    <label class="flex flex-col gap-1.5">
      <span class="font-mono text-chip text-ink-faint">{label}</span>
      {children}
      {hint && <span class="text-chip text-ink-ghost">{hint}</span>}
    </label>
  );
}

/**
 * Classes des contrôles de saisie.
 *
 * `accent-accent` pose la propriété CSS `accent-color`, qui pilote la teinte
 * native des curseurs, cases et boutons radio — sans elle ils restent au bleu
 * du système et trahissent la charte. `color-scheme`, posé par le thème, fait
 * suivre le sélecteur de date natif.
 */
export const CONTROL_CLASS = [
  "w-full rounded-control border border-line bg-surface px-2.5 py-1.5",
  "font-sans text-data text-ink placeholder:text-ink-faint",
  "accent-accent transition-colors",
  "focus:border-accent focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

/** Idem, pour les valeurs numériques et les dates — en chasse fixe. */
export const CONTROL_MONO_CLASS = `${CONTROL_CLASS} font-mono tabular-nums`;

/**
 * Les listes déroulantes.
 *
 * Le chevron est dessiné par `.select-chevron` (global.css) plutôt qu'en
 * valeur arbitraire Tailwind : les guillemets d'un `url()` ne survivent pas au
 * parseur de classes, et un select sans chevron perd toute affordance.
 * Enveloppe le <select> dans <SelectShell> pour que la flèche apparaisse.
 */
export const SELECT_CLASS = `${CONTROL_CLASS} select-chevron`;

/** Enveloppe positionnante qui porte le chevron du select. */
export function SelectShell({ children }: { children: ComponentChildren }) {
  return <span class="select-chevron-wrap">{children}</span>;
}

/** Curseur de progression : la piste et la poignée suivent l'accent. */
export const RANGE_CLASS =
  "h-1 w-full cursor-pointer appearance-none rounded-bar bg-track accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/* ── États ────────────────────────────────────────────────────────── */

export function StateMessage(
  { children, tone = "neutral" }: {
    children: ComponentChildren;
    tone?: "neutral" | "bad";
  },
) {
  return (
    <p
      class={cx(
        "m-4 rounded-control border border-dashed px-4 py-6 text-center text-data",
        tone === "bad"
          ? "border-bad/30 text-bad"
          : "border-line text-ink-muted",
      )}
    >
      {children}
    </p>
  );
}

export function Skeleton(
  { class: klass, style }: { class?: string; style?: JSX.CSSProperties },
) {
  return <div class={cx("skeleton", klass)} style={style} />;
}
