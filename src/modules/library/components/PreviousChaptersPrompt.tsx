"use client";

import { useEffect, useRef, useState } from "react";
import type { ComicChapter } from "@/modules/comics/queries/get-comic-chapters";

type Chapter = Omit<ComicChapter, "releasedAt">;
type Phase = "confirm" | "rate" | "done";

type Props = {
  comicId: number;
  target: Chapter;
  missing: Chapter[];
  offerRatings: boolean;
  onClose: () => void;
  onDecline: () => void;
  onChanged: () => void;
  onRemember: (dontAsk: boolean) => void;
};

async function submit(comicId: number, fields: Record<string, string>) {
  const response = await fetch("/api/library/reading-state", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({ comicId: String(comicId), ...fields }),
  });
  const result: { ok?: boolean; addedIds?: number[] } = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error("Не удалось сохранить. Проверьте соединение и повторите попытку.");
  return result;
}

function chapterTitle(chapter: Chapter) {
  return [chapter.displayCode, chapter.title].filter(Boolean).join(" · ") || "Глава";
}

export function PreviousChaptersPrompt({ comicId, target, missing, offerRatings, onClose, onDecline, onChanged, onRemember }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>("confirm");
  const [dontAsk, setDontAsk] = useState(false);
  const [addedIds, setAddedIds] = useState<number[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [hover, setHover] = useState<{ id: number; value: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ratingsSaved, setRatingsSaved] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const ratedChapters = [...missing.filter((chapter) => addedIds.includes(chapter.id)), target];
  const chosen = Object.entries(scores).filter(([, value]) => value >= 1 && value <= 5)
    .map(([id, rating]) => ({ id: Number(id), rating }));

  function remember() { if (dontAsk) onRemember(true); }
  function decline() { remember(); onDecline(); }
  function dismiss() { if (!lock.current) { remember(); onClose(); } }

  async function markPrevious() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await submit(comicId, { intent: "bulk-read-previous", chapterId: String(target.id) });
      if (!Array.isArray(response.addedIds) || !response.addedIds.every((id) => Number.isSafeInteger(id)))
        throw new Error("Сервер не подтвердил список новых отметок. Обновите страницу.");
      setAddedIds(response.addedIds.filter((id) => id !== target.id));
      remember();
      setPhase(response.addedIds.some((id) => id !== target.id) && offerRatings ? "rate" : "done");
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function saveRatings() {
    if (lock.current || !chosen.length) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await submit(comicId, { intent: "bulk-chapter-ratings", ratings: JSON.stringify(chosen) });
      setRatingsSaved(true); setPhase("done"); onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function undo() {
    if (lock.current || ratingsSaved || !addedIds.length) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await submit(comicId, { intent: "bulk-undo", chapterIds: JSON.stringify(addedIds) });
      setAddedIds([]); setScores({}); setPhase("done"); onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} className="wd-sheet wd-bulk-sheet" aria-labelledby="wd-bulk-title"
    onCancel={(event) => { event.preventDefault(); dismiss(); }}
    onClick={(event) => { if (event.target === dialog.current) dismiss(); }}>
    <div className="wd-sheet-body wd-bulk-body">
      <button className="wd-close" type="button" aria-label="Закрыть предложение о предыдущих главах" disabled={busy} onClick={dismiss}>×</button>
      <small>ДНЕВНИК ЧТЕНИЯ</small>
      {phase === "confirm" ? <>
        <h2 id="wd-bulk-title">Отметить предыдущие главы?</h2>
        <p>«{chapterTitle(target)}» уже отмечена прочитанной. До неё остались неотмеченные основные главы: {missing.length}.</p>
        <ul className="wd-bulk-preview">{missing.map((chapter) => <li key={chapter.id}>{chapterTitle(chapter)}</li>)}</ul>
        <p className="wd-bulk-hint">Отметим только вышедшие основные главы. Существующие оценки и спецвыпуски не меняем.</p>
        <label className="wd-bulk-remember"><input type="checkbox" checked={dontAsk} disabled={busy} onChange={(e) => setDontAsk(e.target.checked)}/>Больше не предлагать для этого произведения на этом устройстве</label>
        <div className="wd-bulk-buttons"><button className="wd-bulk-primary" type="button" disabled={busy} onClick={() => void markPrevious()}>{busy ? "Отмечаем…" : `Отметить предыдущие (${missing.length})`}</button>
          <button className="wd-bulk-secondary" type="button" disabled={busy} onClick={decline}>Нет, оставить как есть</button></div>
      </> : phase === "rate" ? <>
        <h2 id="wd-bulk-title">Готово! Хотите оценить?</h2>
        <p>{addedIds.length} предыдущих глав отмечено. Оценивать каждую необязательно — пропускайте те, которые не помните.</p>
        <div className="wd-bulk-ratings">{ratedChapters.map((chapter) => <div className="wd-bulk-rating-row" key={chapter.id}>
          <span>{chapterTitle(chapter)}</span><div role="group" aria-label={`Оценка: ${chapterTitle(chapter)}`} className="wd-bulk-stars"
            onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} disabled={busy}
              aria-label={`${chapterTitle(chapter)}: ${value} из 5`} aria-pressed={scores[chapter.id] === value}
              onMouseEnter={() => setHover({ id: chapter.id, value })} onFocus={() => setHover({ id: chapter.id, value })}
              onBlur={() => setHover(null)} onClick={() => setScores((prev) => ({ ...prev, [chapter.id]: prev[chapter.id] === value ? 0 : value }))}>
              {value <= (hover?.id === chapter.id ? hover.value : scores[chapter.id] ?? 0) ? "★" : "☆"}</button>)}</div>
        </div>)}</div>
        <div className="wd-bulk-buttons"><button className="wd-bulk-primary" type="button" disabled={busy || !chosen.length} onClick={() => void saveRatings()}>{busy ? "Сохраняем…" : `Сохранить выбранные оценки (${chosen.length})`}</button>
          <button className="wd-bulk-secondary" type="button" disabled={busy} onClick={() => setPhase("done")}>Пропустить оценки</button></div>
        {!ratingsSaved && addedIds.length > 0 ? <button type="button" className="wd-bulk-undo" disabled={busy} onClick={() => void undo()}>Отменить массовую отметку</button> : null}
      </> : <>
        <h2 id="wd-bulk-title">{ratingsSaved ? "Оценки сохранены" : addedIds.length ? "Предыдущие главы отмечены" : "Отметки отменены"}</h2>
        <p>{ratingsSaved ? "Оценки останутся в вашем дневнике." : addedIds.length ? "Можно оценить главы позже, в любое время." : "Ранее прочитанные главы и выбранная последняя глава не изменились."}</p>
        {!ratingsSaved && addedIds.length > 0 ? <button type="button" className="wd-bulk-undo" disabled={busy} onClick={() => void undo()}>Отменить массовую отметку</button> : null}
        <button type="button" className="wd-bulk-primary" disabled={busy} onClick={dismiss}>Готово</button>
      </>}
      {error && <p role="alert" className="wd-bulk-error">{error}</p>}
    </div>
  </dialog>;
}
