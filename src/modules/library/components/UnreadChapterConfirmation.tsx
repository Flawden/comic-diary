"use client";

import { useEffect, useRef } from "react";

type Chapter = { displayCode: string; title: string | null };

type Props = {
  chapter: Chapter;
  preservePublicRating?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Native <dialog> is styled by the existing ChapterRating sheet, not window.confirm(). */
export function UnreadChapterConfirmation({ chapter, preservePublicRating = false, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  const label = [chapter.displayCode, chapter.title].filter(Boolean).join(" · ") || "Глава";
  return <dialog ref={dialog} className="wd-sheet" aria-labelledby="wd-unread-title"
    aria-describedby="wd-unread-description"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
    onClick={(event) => { if (event.target === dialog.current) onCancel(); }}>
    <div className="wd-sheet-body">
      <small>ДНЕВНИК ЧТЕНИЯ</small>
      <h2 id="wd-unread-title">Снять отметку прочтения?</h2>
      <p id="wd-unread-description">Снятие отметки «{label}» удалит личную оценку дневника. Она не восстановится автоматически.</p>
      {preservePublicRating && <p>Публичная оценка главы сохранится.</p>}
      <div className="wd-bulk-buttons">
        <button type="button" className="wd-bulk-primary" onClick={onConfirm}>Снять отметку и удалить личную оценку</button>
        <button type="button" className="wd-bulk-secondary" onClick={onCancel}>Отмена, оставить прочитанной</button>
      </div>
    </div>
  </dialog>;
}
