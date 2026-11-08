"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { writeReading } from "./reading-state-client";

type RemoveFromLibraryControlProps = {
  comicId: number;
  comicTitle?: string;
  variant?: "library" | "work" | "icon";
};

export function RemoveFromLibraryControl({
  comicId,
  comicTitle = "этот комикс",
  variant = "library",
}: RemoveFromLibraryControlProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const isIcon = variant === "icon";
  const isWork = variant === "work";

  useEffect(() => {
    if (!isIcon) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) {
      dialog.showModal();
      stayRef.current?.focus();
    } else if (!confirming && dialog.open) {
      dialog.close();
    }
  }, [confirming, isIcon]);

  async function remove() {
    if (pending) return;

    setPending(true);
    setError("");

    try {
      await writeReading(comicId, {
        intent: "remove-from-library",
      });
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Не удалось убрать комикс. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  const confirmation = (
    <>
      <p>
        Комикс исчезнет с вашей полки и из списка обновлений. История
        чтения, прогресс, оценки и заметка останутся сохранены. При
        повторном добавлении прежний дневник вернётся.
      </p>
      <div className="library-remove-actions">
        <button
          type="button"
          data-action="confirm"
          disabled={pending}
          onClick={remove}
        >
          {pending ? "Убираем…" : "Убрать из библиотеки"}
        </button>
        <button
          type="button"
          data-action="cancel"
          ref={stayRef}
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Остаться
        </button>
      </div>
    </>
  );

  return (
    <div className={`library-remove-control${isWork ? " is-work" : ""}${isIcon ? " is-icon" : ""}`}>
      <button
        type="button"
        className={isIcon ? "library-remove-icon-button" : isWork ? "wd-bookmark wd-bookmark-remove" : "library-remove-trigger"}
        aria-label={isIcon ? `Убрать «${comicTitle}» из библиотеки` : undefined}
        title={isIcon ? "Убрать из библиотеки" : undefined}
        aria-haspopup={isIcon ? "dialog" : undefined}
        aria-expanded={isIcon ? undefined : confirming}
        disabled={pending}
        onClick={() => {
          setError("");
          setConfirming((current) => !current);
        }}
      >
        {isIcon ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        ) : "Убрать из библиотеки"}
      </button>
      {isIcon ? (
        <dialog
          ref={dialogRef}
          className="library-remove-dialog"
          aria-labelledby={headingId}
          aria-describedby={descriptionId}
          onClose={() => setConfirming(false)}
          onCancel={(event) => {
            if (pending) event.preventDefault();
            else setConfirming(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) setConfirming(false);
          }}
        >
          <div className="library-remove-dialog-content">
            <p className="library-remove-dialog-eyebrow">БЕЛЫЙ ДРАКОН · МОЙ ДНЕВНИК</p>
            <h2 id={headingId}>Убрать с полки?</h2>
            <p id={descriptionId} className="library-remove-dialog-title">«{comicTitle}»</p>
            <div className="library-remove-confirm">{confirmation}</div>
            {error ? <p className="library-remove-error" role="alert">{error}</p> : null}
          </div>
        </dialog>
      ) : confirming ? (
        <section
          className="library-remove-confirm"
          role="group"
          aria-label="Подтверждение удаления из библиотеки"
        >
          {confirmation}
        </section>
      ) : null}
      {!isIcon && error ? (
        <p className="library-remove-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
