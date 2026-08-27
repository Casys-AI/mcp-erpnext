/** @jsxImportSource preact */

import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import type {
  ActiveContextLocalResource,
  ContextSelectionItem,
} from "../active-context.ts";
import { useT } from "../i18n-hook.ts";
import { Button, cx, DetailSheet, SheetActions } from "../ui.tsx";
import type { DocumentAttachment } from "./attachment-results.ts";
import type { PreparedDocumentAttachment } from "./useAttachments.ts";

export interface AttachmentPreviewContextController {
  canShareResource: (resource: ActiveContextLocalResource) => boolean;
  isSelected: (item: ContextSelectionItem) => boolean;
  activate: (item: ContextSelectionItem) => Promise<unknown>;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" class="size-3.5" fill="none">
      <path
        d="M8 2.5v7m0 0 2.5-2.5M8 9.5 5.5 7M3 12.5h10"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPreviewSheet({
  file,
  prepared,
  canDownload,
  downloading,
  documentLabel,
  context,
  onDownload,
  onClose,
}: {
  file: DocumentAttachment;
  prepared: PreparedDocumentAttachment;
  canDownload: boolean;
  downloading: boolean;
  documentLabel: string;
  context?: AttachmentPreviewContextController;
  onDownload: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const preview = prepared.preview;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState("");
  const [contextBusy, setContextBusy] = useState(false);
  const [contextFailed, setContextFailed] = useState(false);

  const contextResource: ActiveContextLocalResource = {
    uri: preview.uri,
    mimeType: preview.mimeType,
    bytes: preview.bytes,
  };
  const contextItem = (): ContextSelectionItem => ({
    id: `attachment:${file.id}:${file.modifiedAt ?? "current"}`,
    view: documentLabel,
    label: file.fileName,
    value: note.trim() || t("document.attachments.context_entire_file"),
    resource: contextResource,
  });
  const canShareContext = context?.canShareResource(contextResource) ?? false;
  const contextSelected = canShareContext &&
    Boolean(context?.isSelected(contextItem()));

  const shareContext = async () => {
    if (!context || !canShareContext || contextBusy) return;
    setContextBusy(true);
    setContextFailed(false);
    try {
      const result = await context.activate(contextItem());
      if (result !== "context") setContextFailed(true);
    } catch {
      setContextFailed(true);
    } finally {
      setContextBusy(false);
    }
  };

  useEffect(() => {
    if (preview.kind !== "image" && preview.kind !== "pdf") {
      setObjectUrl(null);
      return;
    }
    const blob = new Blob([preview.bytes.slice()], {
      type: preview.mimeType,
    });
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  const body = preview.kind === "image"
    ? objectUrl
      ? (
        <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sunken p-4">
          <img
            src={objectUrl}
            alt={file.fileName}
            class="max-h-full max-w-full object-contain shadow-card"
          />
        </div>
      )
      : <PreviewLoading />
    : preview.kind === "pdf"
    ? objectUrl
      ? (
        <iframe
          src={`${objectUrl}#page=1&pagemode=thumbs&navpanes=1&toolbar=1`}
          title={t("document.attachments.preview_pdf", {
            name: file.fileName,
          })}
          referrerPolicy="no-referrer"
          class="min-h-0 flex-1 border-0 bg-sunken"
        />
      )
      : <PreviewLoading />
    : preview.kind === "text"
    ? (
      <div class="scroll-slim min-h-0 flex-1 overflow-auto bg-sunken p-4">
        <pre class="m-0 whitespace-pre-wrap break-words font-mono text-chip leading-relaxed text-ink-2">
          {preview.text ?? ""}
        </pre>
        {preview.textTruncated && (
          <p
            role="status"
            class="sticky bottom-0 mt-4 border-t border-line bg-sunken/95 py-2 font-mono text-nano text-warn"
          >
            {t("document.attachments.preview_truncated")}
          </p>
        )}
      </div>
    )
    : (
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-sunken p-6 text-center">
        <span aria-hidden="true" class="text-title text-ink-faint">◇</span>
        <p class="m-0 max-w-md text-data text-ink-muted">
          {t("document.attachments.preview_unsupported")}
        </p>
        {canDownload && (
          <p class="m-0 font-mono text-chip text-ink-faint">
            {t("document.attachments.preview_download_fallback")}
          </p>
        )}
      </div>
    );

  return (
    <DetailSheet
      size="preview"
      bodyClass="flex-1"
      eyebrow={`${preview.mimeType} · ${formatBytes(preview.bytes.length)}`}
      title={file.fileName}
      onClose={onClose}
      footer={canDownload || canShareContext
        ? (
          <>
            {canShareContext && editingNote && (
              <div class="border-b border-line-soft px-4 py-3">
                <label class="flex flex-col gap-1.5">
                  <span class="font-mono text-chip text-ink-faint">
                    {t("document.attachments.context_note")}
                  </span>
                  <input
                    type="text"
                    maxLength={220}
                    value={note}
                    placeholder={t(
                      "document.attachments.context_note_placeholder",
                    )}
                    onInput={(event: JSX.TargetedEvent<HTMLInputElement>) =>
                      setNote(event.currentTarget.value)}
                    class={cx(
                      "min-h-10 rounded-control border border-line bg-surface px-2.5",
                      "text-data text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none",
                    )}
                  />
                </label>
              </div>
            )}
            <SheetActions>
              <span class="min-w-0 flex-1 font-mono text-nano text-ink-faint">
                {contextFailed
                  ? (
                    <span role="status" class="text-bad">
                      {t("document.attachments.context_error")}
                    </span>
                  )
                  : file.isPrivate
                  ? t("document.attachments.private")
                  : t("document.attachments.public")}
              </span>
              {canShareContext && (
                <>
                  <button
                    type="button"
                    aria-pressed={editingNote}
                    aria-label={t("document.attachments.context_note")}
                    title={t("document.attachments.context_note")}
                    onClick={() => setEditingNote((value) => !value)}
                    class={cx(
                      "grid size-10 place-items-center rounded-control border border-line bg-control",
                      "text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
                    )}
                  >
                    <span aria-hidden="true">✎</span>
                  </button>
                  <Button
                    variant={contextSelected ? "quiet" : "accent"}
                    class="inline-flex min-h-10 items-center gap-1.5"
                    disabled={contextBusy}
                    aria-pressed={contextSelected}
                    onClick={() => void shareContext()}
                  >
                    <span aria-hidden="true">
                      {contextBusy ? "…" : contextSelected ? "✓" : "＋"}
                    </span>
                    {contextBusy
                      ? t("document.attachments.context_sharing")
                      : contextSelected && !editingNote
                      ? t("document.attachments.context_added")
                      : contextSelected
                      ? t("document.attachments.context_update")
                      : t("document.attachments.context_add")}
                  </Button>
                </>
              )}
              {canDownload && (
                <Button
                  variant="secondary"
                  class="inline-flex min-h-10 items-center gap-1.5"
                  disabled={downloading}
                  onClick={onDownload}
                >
                  {downloading
                    ? <span aria-hidden="true">…</span>
                    : <DownloadIcon />}
                  {t("document.attachments.download_short")}
                </Button>
              )}
            </SheetActions>
          </>
        )
        : undefined}
    >
      {body}
    </DetailSheet>
  );
}

function PreviewLoading() {
  const t = useT();
  return (
    <div
      role="status"
      class="flex min-h-0 flex-1 items-center justify-center bg-sunken font-mono text-chip text-ink-faint"
    >
      {t("document.attachments.preview_loading")}
    </div>
  );
}
