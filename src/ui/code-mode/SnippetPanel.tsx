import { SnippetLibrary } from "@mcpview/components/preact/components";
import type { TargetedKeyboardEvent, TargetedMouseEvent } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useT } from "../shared/i18n-hook.ts";
import type { SnippetEvent, SnippetSource } from "./snippet-contract.ts";

type Arguments =
  | {
    save: { runId: string; name: string; description: string };
    snippets?: never;
    inspectSnippet?: never;
  }
  | { snippets: true; save?: never; inspectSnippet?: never }
  | { inspectSnippet: string; save?: never; snippets?: never };

type Props = {
  reference?: string;
  event?: SnippetEvent;
  canCall: boolean;
  setResultHidden?: (hidden: boolean) => void;
  call: (args: Arguments) => Promise<SnippetEvent>;
};

// A script action works in MCP iframes even when the host disables native form submission.
function confirmOnClick(
  action: (form: HTMLFormElement) => void,
): (event: TargetedMouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    event.preventDefault();
    const form = event.currentTarget.form;
    if (form?.reportValidity()) action(form);
  };
}

function confirmOnEnter(
  action: (form: HTMLFormElement) => void,
): (event: TargetedKeyboardEvent<HTMLFormElement>) => void {
  return (event) => {
    if (
      event.key !== "Enter" || event.isComposing || event.repeat ||
      !(event.target instanceof HTMLInputElement)
    ) return;
    event.preventDefault();
    if (event.currentTarget.reportValidity()) action(event.currentTarget);
  };
}

export function SnippetPanel(
  { reference, event: initial, canCall, setResultHidden, call }: Props,
) {
  const t = useT();
  const [event, setEvent] = useState(initial);
  const [saved, setSaved] = useState(
    initial?.kind === "saved" ? initial : undefined,
  );
  const [saveOpen, setSaveOpen] = useState(false);
  const [source, setSource] = useState<SnippetSource | undefined>(
    initial?.kind === "source" ? initial.snippet : undefined,
  );
  const script = useMemo(
    () => source && { ...source, language: "javascript" as const },
    [source],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const focus = useRef<HTMLElement | null>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const libraryButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<"save" | "library">();

  useLayoutEffect(() => {
    if (restoreButton.current) {
      const button = restoreButton.current === "save"
        ? saveButton
        : libraryButton;
      restoreButton.current = undefined;
      button.current?.focus();
    } else {
      focus.current?.focus();
    }
  }, [event, saveOpen]);

  useLayoutEffect(() => {
    if (!busy && error && document.activeElement === document.body) {
      alert.current?.focus();
    }
  }, [busy, error]);

  async function submit(args: Arguments) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await call(args);
      if (next.kind === "source") {
        setSource(next.snippet);
      } else {
        setSaveOpen(false);
        setSource(undefined);
        if (next.kind === "saved") setSaved(next);
        if (next.kind === "list" && !event) setResultHidden?.(true);
        setEvent(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function save(form: HTMLFormElement) {
    if (!reference) return;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    if (!name) {
      setError(t("code_mode.snippet_name_required"));
      return;
    }
    void submit({
      save: {
        runId: reference,
        name,
        description: String(data.get("description")).trim(),
      },
    });
  }

  const library = event?.kind === "list";
  const saveTitle = t("code_mode.snippet_save");
  const libraryTitle = t("code_mode.snippet_library");

  function closeForm() {
    setError("");
    setSaveOpen(false);
    restoreButton.current = "save";
  }

  function closeLibrary() {
    setError("");
    if (!saved) {
      setResultHidden?.(false);
      restoreButton.current = "library";
    }
    setEvent(saved);
  }

  return (
    <div class="erp-snippets">
      {event?.kind === "saved" && (
        <div class="erp-snippets-summary">
          <p class="erp-snippets-success" role="status">
            <span class="erp-snippets-check" aria-hidden="true">✓</span>
            {t("code_mode.snippet_saved")}
          </p>
          <h2
            tabIndex={-1}
            ref={(node) => {
              focus.current = node;
            }}
          >
            <bdi>{event.snippet.name}</bdi>
          </h2>
          {event.snippet.description && (
            <p dir="auto">{event.snippet.description}</p>
          )}
        </div>
      )}
      {(library || source) && (
        <SnippetLibrary
          entries={library ? event.snippets : undefined}
          source={script}
          busy={busy}
          labels={{
            title: libraryTitle,
            search: t("code_mode.snippet_search"),
            view: t("code_mode.snippet_view"),
            viewNamed: (name) => t("code_mode.snippet_view_named", { name }),
            back: t("common.back"),
            noMatch: t("code_mode.snippet_no_match"),
            empty: t("code_mode.snippet_empty"),
          }}
          onInspect={canCall
            ? ({ name }) => void submit({ inspectSnippet: name })
            : undefined}
          onBack={library
            ? () => setSource(undefined)
            : canCall
            ? () => void submit({ snippets: true })
            : undefined}
          headerAction={(saved || setResultHidden) && (
            <button
              type="button"
              disabled={busy}
              onClick={closeLibrary}
            >
              {t("common.back")}
            </button>
          )}
        />
      )}
      {saveOpen && (
        <form
          class="erp-snippets-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(e.currentTarget);
          }}
          onKeyDown={confirmOnEnter(save)}
        >
          <h2>{saveTitle}</h2>
          <fieldset disabled={busy}>
            <label>
              {t("code_mode.snippet_name")}
              <input
                name="name"
                required
                ref={(node) => {
                  focus.current = node;
                }}
              />
            </label>
            <label>
              {t("code_mode.snippet_description")}
              <textarea name="description" rows={2} maxLength={512} />
            </label>
            <div class="erp-snippets-actions">
              <button
                class="erp-snippets-primary"
                type="submit"
                onClick={confirmOnClick(save)}
              >
                {saveTitle}
              </button>
              <button type="button" onClick={closeForm}>
                {t("common.cancel")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {canCall && !library && !source && !saveOpen && (
        <div class="erp-snippets-actions">
          {reference && event?.kind !== "saved" && (
            <button
              type="button"
              disabled={busy}
              ref={saveButton}
              onClick={() => {
                setError("");
                setSaveOpen(true);
              }}
            >
              {saveTitle}
            </button>
          )}
          <button
            class={event?.kind === "saved" ? "erp-snippets-primary" : undefined}
            type="button"
            disabled={busy}
            ref={libraryButton}
            onClick={() => void submit({ snippets: true })}
          >
            {libraryTitle}
          </button>
        </div>
      )}
      {busy && <p role="status">{t("common.loading")}</p>}
      {error && (
        <p class="erp-snippets-error" role="alert" tabIndex={-1} ref={alert}>
          {error}
        </p>
      )}
    </div>
  );
}
