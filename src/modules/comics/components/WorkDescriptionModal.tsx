"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./WorkDescriptionModal.module.css";

type WorkDescriptionModalProps = {
  text: string;
  previewChars?: number;
};

/** Only the comic hero description opens a modal; translator notes stay inline. */
export function WorkDescriptionModal({ text, previewChars = 245 }: WorkDescriptionModalProps) {
  const full = text.trim();
  const characters = Array.from(full);
  const intro = characters.slice(0, previewChars).join("").replace(/\s+/g, " ").trimEnd();
  const needsModal = characters.length > previewChars;
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousOverflowRef = useRef<string | null>(null);

  // Restore scroll state if the route changes while the dialog is open.
  useEffect(() => () => {
    if (previousOverflowRef.current !== null) {
      document.body.style.overflow = previousOverflowRef.current;
      previousOverflowRef.current = null;
    }
  }, []);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    if (previousOverflowRef.current !== null) {
      document.body.style.overflow = previousOverflowRef.current;
      previousOverflowRef.current = null;
    }
    triggerRef.current?.focus();
  }

  return (
    <section className="wd-story-block">
      <h2>Об истории</h2>
      {needsModal ? (
        <>
          <p className={`wd-story-text ${styles.preview}`}>
            {intro}…{" "}
            <button
              ref={triggerRef}
              type="button"
              className={styles.more}
              aria-label="Читать полное описание произведения"
              aria-haspopup="dialog"
              aria-controls={dialogId}
              onClick={openDialog}
            >
              Ещё
            </button>
          </p>
          <dialog
            ref={dialogRef}
            id={dialogId}
            className={styles.dialog}
            aria-labelledby={`${dialogId}-title`}
            onClose={handleClose}
            onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
          >
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Описание произведения</p>
                <h2 id={`${dialogId}-title`}>Об истории</h2>
              </div>
              <button type="button" className={styles.close} aria-label="Закрыть описание" onClick={closeDialog}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5 19 19M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div className={styles.scroll}>
              <p className={styles.fullText}>{full}</p>
            </div>
          </dialog>
        </>
      ) : (
        <p className="wd-story-text whitespace-pre-wrap">{full}</p>
      )}
    </section>
  );
}
