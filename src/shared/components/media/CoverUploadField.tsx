"use client";

import {
  useId,
  useRef,
  useState,
} from "react";

import {
  CoverImage,
} from "./CoverImage";

const MAX_CLIENT_BYTES =
  6 * 1024 * 1024;

type CoverUploadFieldProps = {
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (value: string) => void;
  uploadSuccessMessage?: string;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
};

type UploadResponse = {
  ok?: unknown;

  cover?: {
    url?: unknown;
  };

  error?: {
    kind?: unknown;
  };
};

function uploadErrorLabel(
  kind: unknown,
) {
  switch (kind) {
    case "cover-file-too-large":
    case "request-too-large":
      return "Файл слишком большой. Максимум 6 МБ.";

    case "unsupported-cover":
    case "unsupported-media-type":
      return "Поддерживаются JPEG, PNG и WebP.";

    case "unauthorized":
      return "Недостаточно прав для загрузки.";

    case "origin-not-allowed":
      return "Запрос отклонён политикой безопасности.";

    default:
      return "Не удалось загрузить обложку.";
  }
}

export function CoverUploadField({
  defaultValue = "",
  value,
  onValueChange,
  uploadSuccessMessage = "Обложка загружена. Нажмите «Сохранить изменения», чтобы закрепить её за тайтлом.",
  disabled = false,
  onUploadingChange,
}: CoverUploadFieldProps) {
  const inputId =
    useId();

  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const [localUrl, setLocalUrl] =
    useState(
      defaultValue ?? "",
    );

  const url = value ?? localUrl;
  function setUrl(next: string) {
    setLocalUrl(next);
    onValueChange?.(next);
  }

  const [
    selectedName,
    setSelectedName,
  ] =
    useState<string | null>(
      null,
    );

  const [uploading, setUploading] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(
      null,
    );

  async function uploadFile(
    file: File,
  ) {
    if (disabled || uploading) return;

    if (
      file.size >
      MAX_CLIENT_BYTES
    ) {
      setMessage(
        "Файл слишком большой. Максимум 6 МБ.",
      );

      return;
    }

    setUploading(true);
    onUploadingChange?.(true);

    setMessage(
      "Загружаю обложку…",
    );

    const body =
      new FormData();

    body.set(
      "file",
      file,
    );

    try {
      const response =
        await fetch(
          "/api/admin/media/covers",
          {
            method: "POST",
            body,
            credentials:
              "same-origin",
          },
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () => ({}),
            )
        ) as UploadResponse;

      if (
        !response.ok ||
        payload.ok !== true ||
        typeof payload.cover
          ?.url !== "string"
      ) {
        setMessage(
          uploadErrorLabel(
            payload.error?.kind,
          ),
        );

        return;
      }

      /*
       * This is the canonical form value.
       *
       * The user never has to copy or type
       * /media/covers/<uuid> manually.
       */
      setUrl(
        payload.cover.url,
      );

      setMessage(
        uploadSuccessMessage,
      );
    } catch {
      setMessage(
        "Сеть недоступна или сервер не ответил.",
      );
    } finally {
      setUploading(false);
      onUploadingChange?.(false);

      /*
       * Allow selecting the same physical
       * file again if necessary.
       */
      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    }
  }

  return (
    <div className="md:col-span-2">
      {/*
       * coverUrl remains part of the existing
       * comic form contract, but it is now
       * filled automatically after upload.
       */}
      <input type="hidden" name="coverUploading" value={uploading ? "yes" : "no"} />
      <input
        type="hidden"
        name="coverUrl"
        value={url}
      />

      <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
        Обложка
      </span>

      <div className="grid gap-4 sm:grid-cols-[112px_1fr]">
        <CoverImage
          src={url}
          alt="Предпросмотр обложки"
          className="aspect-[3/4] w-28 rounded-[var(--cd-radius-card)] border border-[var(--border)]"
        />

        <div className="space-y-4">
          <input
            ref={
              fileInputRef
            }
            id={
              `${inputId}-file`
            }
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={uploading || disabled}
            onChange={
              (event) => {
                const selected =
                  event.target
                    .files?.[0] ??
                  null;

                if (!selected) {
                  return;
                }

                setSelectedName(
                  selected.name,
                );

                void uploadFile(
                  selected,
                );
              }
            }
            className="sr-only"
          />

          <div className="space-y-2">
            <label
              htmlFor={
                `${inputId}-file`
              }
              aria-disabled={
                uploading || disabled
              }
              className={[
                "inline-flex min-h-11 items-center justify-center",
                "rounded-[var(--cd-radius-button)]",
                "border border-[var(--border)]",
                "bg-[var(--surface-raised)]",
                "px-4 py-2",
                "text-sm font-semibold",
                uploading || disabled
                  ? "cursor-wait opacity-60"
                  : "cursor-pointer",
                "text-[var(--text-primary)]",
              ].join(" ")}
            >
              {uploading
                ? "Загрузка…"
                : url
                  ? "Заменить изображение"
                  : "Выбрать изображение"}
            </label>

            <p
              className="text-sm text-[var(--text-secondary)]"
            >
              {selectedName ??
                "JPEG, PNG или WebP · до 6 МБ"}
            </p>
          </div>

          {message ? (
            <p
              className="text-sm text-[var(--text-secondary)]"
              aria-live="polite"
            >
              {message}
            </p>
          ) : null}

          <details
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          >
            <summary
              className="cursor-pointer px-3 py-3 text-sm font-medium text-[var(--text-secondary)]"
            >
              Использовать внешний URL
            </summary>

            <div className="px-3 pb-3">
              <input
                id={
                  `${inputId}-url`
                }
                type="text"
                inputMode="url"
                disabled={uploading || disabled}
                value={url}
                onChange={
                  (event) => {
                    setUrl(
                      event.target.value,
                    );

                    setSelectedName(
                      null,
                    );

                    setMessage(
                      null,
                    );
                  }
                }
                placeholder="https://example.com/cover.jpg"
                className={[
                  "w-full rounded-xl border",
                  "border-[var(--border)]",
                  "bg-[var(--surface-raised)]",
                  "px-3 py-3",
                  "text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-muted)]",
                ].join(" ")}
              />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
