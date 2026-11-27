import { SnippetLibrary } from "@mcpview/components/preact/components";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useT } from "../shared/i18n-hook.ts";
import type { SnippetEvent } from "./snippet-contract.ts";

type LibraryRequest =
  | { snippets: true; inspectSnippet?: never }
  | { inspectSnippet: string; snippets?: never };

type Props = {
  event: SnippetEvent;
  canCall: boolean;
  call: (
    args: LibraryRequest,
  ) => Promise<Exclude<SnippetEvent, { kind: "saved" }>>;
};

export function SnippetPanel({ event: initial, canCall, call }: Props) {
  const t = useT();
  const [entries, setEntries] = useState(
    initial.kind === "list" ? initial.snippets : undefined,
  );
  const [source, setSource] = useState(
    initial.kind === "source" ? initial.snippet : undefined,
  );
  const script = useMemo(
    () => source && { ...source, language: "javascript" as const },
    [source],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const receipt = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    receipt.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!busy && error && document.activeElement === document.body) {
      alert.current?.focus();
    }
  }, [busy, error]);

  async function browse(args: LibraryRequest) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await call(args);
      if (next.kind === "source") {
        setSource(next.snippet);
      } else {
        setEntries(next.snippets);
        setSource(undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (initial.kind === "saved") {
    return (
      <div class="erp-snippets erp-snippets-summary">
        <p class="erp-snippets-success" role="status">
          <span class="erp-snippets-check" aria-hidden="true">✓</span>
          {t("code_mode.snippet_saved")}
        </p>
        <h2 tabIndex={-1} ref={receipt}>
          <bdi>{initial.snippet.name}</bdi>
        </h2>
        {initial.snippet.description && (
          <p dir="auto">{initial.snippet.description}</p>
        )}
      </div>
    );
  }

  return (
    <div class="erp-snippets">
      <SnippetLibrary
        entries={entries}
        source={script}
        busy={busy}
        labels={{
          title: t("code_mode.snippet_library"),
          search: t("code_mode.snippet_search"),
          view: t("code_mode.snippet_view"),
          viewNamed: (name) => t("code_mode.snippet_view_named", { name }),
          back: t("common.back"),
          noMatch: t("code_mode.snippet_no_match"),
          empty: t("code_mode.snippet_empty"),
        }}
        onInspect={canCall
          ? ({ name }) => void browse({ inspectSnippet: name })
          : undefined}
        onBack={entries
          ? () => setSource(undefined)
          : canCall
          ? () => void browse({ snippets: true })
          : undefined}
      />
      {busy && <p role="status">{t("common.loading")}</p>}
      {error && (
        <p class="erp-snippets-error" role="alert" tabIndex={-1} ref={alert}>
          {error}
        </p>
      )}
    </div>
  );
}
