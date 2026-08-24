/** @jsxImportSource preact */
/**
 * Bouton d'action avec confirmation destructive.
 *
 * Écrit ici plutôt que dans shared/ tant qu'un seul viewer l'emploie —
 * à remonter si un deuxième en a besoin.
 */
import { Button } from "~/shared/ui";

const VARIANT_MAP: Record<
  string,
  "accent" | "secondary" | "danger" | "quiet"
> = {
  success: "accent",
  error: "danger",
  info: "secondary",
  default: "secondary",
};

export function LocalActionButton({
  label,
  variant = "default",
  disabled,
  loading,
  onClick,
}: {
  label: string;
  variant?: "success" | "error" | "info" | "default";
  disabled?: boolean;
  loading?: boolean;
  /** Non utilisé dans cette implémentation — conservé pour la compatibilité. */
  confirm?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={VARIANT_MAP[variant] ?? "secondary"}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? "…" : label}
    </Button>
  );
}
