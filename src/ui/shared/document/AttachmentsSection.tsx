/** @jsxImportSource preact */

import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "../i18n-hook.ts";
import type { ViewerLayout } from "../useViewerLayout.ts";
import { cx } from "../ui.tsx";
import {
  type AttachmentPreviewContextController,
  AttachmentPreviewSheet,
} from "./AttachmentPreviewSheet.tsx";
import {
  isAttachmentPreviewCandidate,
  MAX_BINARY_PREVIEW_BYTES,
} from "./attachment-preview.ts";
import type { DocumentCapabilities } from "./capabilities.ts";
import type {
  AttachmentsController,
  PreparedDocumentAttachment,
} from "./useAttachments.ts";

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" class="size-3.5" fill="none">
      <path
        d="m5.25 8.9 4.2-4.2a2.05 2.05 0 0 1 2.9 2.9l-5.3 5.3a3.15 3.15 0 0 1-4.45-4.45l5-5"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
      />
    </svg>
  );
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

function PreviewIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" class="size-3.5" fill="none">
      <path
        d="M1.75 8s2.15-3.5 6.25-3.5S14.25 8 14.25 8 12.1 11.5 8 11.5 1.75 8 1.75 8Z"
        stroke="currentColor"
        stroke-width="1.2"
      />
      <circle cx="8" cy="8" r="1.6" stroke="currentColor" stroke-width="1.2" />
    </svg>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsSection({
  controller,
  capabilities,
  layout,
  context,
}: {
  controller: AttachmentsController;
  capabilities: DocumentCapabilities;
  layout: ViewerLayout;
  context?: AttachmentPreviewContextController;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const [isPrivate, setIsPrivate] = useState(true);
  const [prepared, setPrepared] = useState<PreparedDocumentAttachment | null>(
    null,
  );
  const { state, files, readProgress } = controller;
  const narrow = layout !== "wide";
  const uploadBusy = state.upload !== "idle" && state.upload !== "error";
  const transferBusy = state.previewingFile !== null ||
    state.downloadingFile !== null;
  const uploadBlocked = uploadBusy || state.load === "loading" || transferBusy;

  useEffect(() => {
    if (
      prepared &&
      (prepared.documentKey !== controller.documentKey ||
        !files.some((file) => file.id === prepared.fileId))
    ) {
      setPrepared(null);
    }
  }, [controller.documentKey, files, prepared]);

  const chooseFile = () => {
    if (!uploadBlocked) inputRef.current?.click();
  };
  const selectedFile = (event: JSX.TargetedEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void controller.upload(file, isPrivate);
  };

  const uploadLabel = state.upload === "reading"
    ? readProgress === null
      ? t("document.attachments.reading")
      : t("document.attachments.reading_progress", {
        value: Math.round(readProgress * 100),
      })
    : state.upload === "uploading"
    ? t("document.attachments.uploading")
    : state.upload === "relisting"
    ? t("document.attachments.relisting")
    : t("document.attachments.add");

  const openPreview = async (file: (typeof files)[number]) => {
    const next = await controller.preview(file);
    if (next) setPrepared(next);
  };

  const closePreview = () => {
    setPrepared(null);
    globalThis.requestAnimationFrame(() => previewTriggerRef.current?.focus());
  };

  const preparedFile = prepared
    ? files.find((file) => file.id === prepared.fileId) ?? null
    : null;

  return (
    <section
      aria-labelledby="document-attachments-title"
      aria-busy={uploadBusy || transferBusy || state.load === "loading"}
      class="min-w-0"
    >
      <div class="flex min-h-10 items-center gap-2 border-b border-line-soft px-3.5 py-2">
        <h3
          id="document-attachments-title"
          class="m-0 font-mono text-micro uppercase tracking-label text-ink-muted"
        >
          {t("document.attachments")}
          <span class="ml-1.5 text-ink-faint">{files.length}</span>
        </h3>
        <div class="flex-1" />
        {capabilities.canListAttachments && (
          <button
            type="button"
            aria-label={t("document.attachments.refresh")}
            title={t("document.attachments.refresh")}
            disabled={state.load === "loading" || uploadBusy || transferBusy}
            onClick={() => void controller.refresh()}
            class={cx(
              "grid place-items-center rounded-control text-ink-faint transition-colors",
              narrow ? "size-11" : "size-7",
              "hover:bg-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <span
              aria-hidden="true"
              class={state.load === "loading" ? "animate-spin" : ""}
            >
              ↻
            </span>
          </button>
        )}
      </div>

      {state.error && (
        <div
          role="alert"
          class="mx-3.5 mt-3 flex items-start gap-2 rounded-control border border-bad/25 bg-bad/8 px-2.5 py-2 font-mono text-chip text-bad"
        >
          <span class="min-w-0 flex-1 break-words">{state.error.message}</span>
          <button
            type="button"
            aria-label={t("document.attachments.dismiss_error")}
            onClick={controller.dismissError}
            class={cx(
              "grid shrink-0 place-items-center rounded-sm hover:bg-bad/10 focus-visible:outline-2 focus-visible:outline-bad",
              narrow ? "size-11" : "size-5",
            )}
          >
            ×
          </button>
        </div>
      )}

      <div class={cx("flex flex-col", narrow ? "px-3 py-2.5" : "px-3.5 py-3")}>
        {state.load === "loading" && files.length === 0
          ? (
            <div
              role="status"
              class="py-6 text-center font-mono text-chip text-ink-faint"
            >
              {t("document.attachments.loading")}
            </div>
          )
          : files.length === 0
          ? (
            <div class="rounded-control border border-dashed border-line px-3 py-5 text-center">
              <PaperclipIcon />
              <p class="mt-2 font-mono text-chip text-ink-faint">
                {capabilities.canListAttachments
                  ? t("document.attachments.empty")
                  : t("document.attachments.unavailable")}
              </p>
            </div>
          )
          : (
            <div class="overflow-hidden rounded-control border border-line-soft">
              {files.map((file) => {
                const downloading = state.downloadingFile === file.id;
                const previewing = state.previewingFile === file.id;
                const previewable = capabilities.canPreviewAttachment &&
                  isAttachmentPreviewCandidate(file.fileName) &&
                  (file.fileSize === null ||
                    file.fileSize <= MAX_BINARY_PREVIEW_BYTES);
                return (
                  <div
                    key={file.id}
                    aria-busy={previewing || downloading}
                    class="group flex min-h-12 items-center gap-2.5 border-b border-line-soft px-2.5 py-1.5 last:border-b-0 hover:bg-row-hover"
                  >
                    <span class="shrink-0 text-ink-faint">
                      <PaperclipIcon />
                    </span>
                    {previewable
                      ? (
                        <button
                          type="button"
                          aria-label={t("document.attachments.preview", {
                            name: file.fileName,
                          })}
                          title={t("document.attachments.preview", {
                            name: file.fileName,
                          })}
                          disabled={transferBusy}
                          onClick={(event) => {
                            previewTriggerRef.current = event.currentTarget;
                            void openPreview(file);
                          }}
                          class={cx(
                            "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-control text-left",
                            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                            "disabled:cursor-wait disabled:opacity-60",
                          )}
                        >
                          <AttachmentLabel file={file} />
                          <span
                            class={cx(
                              "grid size-6 shrink-0 place-items-center text-ink-faint transition-opacity",
                              !narrow && !previewing &&
                                "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                            )}
                          >
                            {previewing
                              ? <span aria-hidden="true">…</span>
                              : <PreviewIcon />}
                          </span>
                        </button>
                      )
                      : <AttachmentLabel file={file} />}
                    {capabilities.canDownloadAttachment && (
                      <button
                        type="button"
                        aria-label={t("document.attachments.download", {
                          name: file.fileName,
                        })}
                        title={t("document.attachments.download", {
                          name: file.fileName,
                        })}
                        disabled={transferBusy}
                        onClick={() => void controller.download(file)}
                        class={cx(
                          "grid shrink-0 place-items-center rounded-control text-ink-faint transition-colors",
                          narrow ? "size-11" : "size-8",
                          "hover:bg-control hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
                          "disabled:cursor-not-allowed disabled:opacity-45",
                          !narrow && !downloading &&
                            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                        )}
                      >
                        {downloading
                          ? (
                            <span aria-hidden="true" class="animate-pulse">
                              …
                            </span>
                          )
                          : <DownloadIcon />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        {capabilities.canUploadAttachment && (
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              class="sr-only"
              type="file"
              tabIndex={-1}
              onChange={selectedFile}
            />
            <button
              type="button"
              disabled={uploadBlocked}
              onClick={chooseFile}
              class={cx(
                "inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line bg-control px-2.5",
                "font-mono text-chip text-ink-muted transition-colors hover:border-line-hover hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "disabled:cursor-wait disabled:opacity-55",
                narrow && "min-h-11",
              )}
            >
              <span aria-hidden="true">＋</span>
              {uploadLabel}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={isPrivate}
              aria-label={t(
                isPrivate
                  ? "document.attachments.privacy_private"
                  : "document.attachments.privacy_public",
              )}
              title={t(
                isPrivate
                  ? "document.attachments.private_hint"
                  : "document.attachments.public_hint",
              )}
              disabled={uploadBlocked}
              onClick={() => setIsPrivate((value) => !value)}
              class={cx(
                "min-h-8 rounded-pill border px-2.5 font-mono text-nano uppercase tracking-chip transition-colors",
                isPrivate
                  ? "border-line bg-sunken text-ink-muted"
                  : "border-warn/45 bg-warn/10 text-warn",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "disabled:cursor-not-allowed disabled:opacity-50",
                narrow && "min-h-11",
              )}
            >
              {isPrivate
                ? `⌁ ${t("document.attachments.private")}`
                : `◌ ${t("document.attachments.public")}`}
            </button>
          </div>
        )}
      </div>
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.previewingFile
          ? t("document.attachments.preview_loading_name", {
            name: files.find((file) => file.id === state.previewingFile)
              ?.fileName ?? "",
          })
          : state.downloadingFile
          ? t("document.attachments.download_in_progress")
          : uploadBusy
          ? uploadLabel
          : ""}
      </span>
      {prepared && preparedFile && (
        <AttachmentPreviewSheet
          file={preparedFile}
          prepared={prepared}
          canDownload={capabilities.canDownloadAttachment}
          downloading={state.downloadingFile === preparedFile.id}
          documentLabel={`${controller.document.doctype} · ${controller.document.name}`}
          context={context}
          onDownload={() => void controller.download(preparedFile, prepared)}
          onClose={closePreview}
        />
      )}
    </section>
  );
}

function AttachmentLabel({
  file,
}: {
  file: AttachmentsController["files"][number];
}) {
  const t = useT();
  return (
    <span class="min-w-0 flex-1">
      <span class="block truncate text-data text-ink" title={file.fileName}>
        {file.fileName}
      </span>
      <span class="mt-0.5 flex items-center gap-1.5 font-mono text-nano text-ink-faint">
        <span>{formatBytes(file.fileSize)}</span>
        <span aria-hidden="true">·</span>
        <span>
          {file.isPrivate
            ? t("document.attachments.private")
            : t("document.attachments.public")}
        </span>
      </span>
    </span>
  );
}
