"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseChapterBatch, CHAPTER_BATCH_LIMIT } from "../chapter-batch-input";
import { parseStructuredChapterBatch, type StructuredChapterRow } from "../chapter-structured-batch";
import { expectedReleasePrecision, type ExpectedReleasePrecision } from "../chapter-release-dates";

type ChapterKind = "MAIN" | "SPECIAL";
type ChapterStatus = "SCHEDULED" | "RELEASED";
type ExistingChapter = {
  id: number;
  kind: string;
  displayCode: string;
  title: string | null;
  sourceUrl: string | null;
  status: string;
  sortOrder: number;
  volumeNumber: number | null;
};
type DraftRow = {
  key: number;
  title: string;
  sourceUrl: string;
  displayCode: string;
  kind: ChapterKind;
  status: ChapterStatus;
  volumeNumber: string;
  placementMode: "AUTO" | "BEFORE" | "AFTER";
  anchorChapterId: string;
  releasedDate: string;
  expectedPrecision: ExpectedReleasePrecision;
  expectedRelease: string;
  supersedesChapterId: string;
  revisionConfirmed: boolean;
};
type Preview = {
  snapshot: string;
  rows: Array<{ displayCode: string; title: string | null; kind: ChapterKind; sortOrder: number; status: ChapterStatus; supersedesChapterId?: number | null }>;
};
const blankRow = (key: number, status: ChapterStatus): DraftRow => ({
  key, title: "", sourceUrl: "", displayCode: "", kind: "MAIN", status,
  volumeNumber: "", placementMode: "AUTO", anchorChapterId: "", releasedDate: "", expectedPrecision: "NONE",
  expectedRelease: "", supersedesChapterId: "", revisionConfirmed: false,
});
const errors: Record<string, string> = {
  "chapter-display-code-conflict": "У активной главы уже есть такой код. Проверьте пакет.",
  "chapter-batch-stale": "Список глав изменился после предпросмотра. Проверьте пакет ещё раз.",
  "forbidden": "Недостаточно прав для изменения каталога.",
};
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]";

function normalizeRow(row: DraftRow): StructuredChapterRow {
  const toInteger = (text: string, name: string): number | null => {
    if (!text.trim()) return null;
    if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(Number(text))) throw new Error(`${name}: укажите целое неотрицательное число.`);
    return Number(text);
  };
  if (row.status === "SCHEDULED" && row.expectedPrecision !== "NONE" && !row.expectedRelease.trim()) {
    throw new Error("Укажите ожидаемую дату полностью или выберите «Дата неизвестна».");
  }
  if (row.expectedRelease && expectedReleasePrecision(row.expectedRelease) !== row.expectedPrecision) {
    throw new Error("Точность ожидаемой даты не совпадает с введённым значением.");
  }
  return {
    displayCode: row.displayCode, title: row.title.trim() || null,
    sourceUrl: row.sourceUrl.trim() || null, kind: row.kind, status: row.status,
    volumeNumber: toInteger(row.volumeNumber, "Том"),
    placementMode: row.placementMode,
    anchorChapterId: toInteger(row.anchorChapterId, "Соседняя глава"),
    releasedAt: row.status === "RELEASED" && row.releasedDate ? `${row.releasedDate}T12:00:00.000Z` : null,
    expectedRelease: row.status === "SCHEDULED" ? row.expectedRelease.trim() || null : null,
    supersedesChapterId: toInteger(row.supersedesChapterId, "Заменяемая глава"),
    revisionConfirmed: row.revisionConfirmed,
  };
}

export function ChapterBatchEditor({ comicId, chapters, disabled, onBusyChange }: {
  comicId: number;
  chapters: ExistingChapter[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextKey = useRef(2);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([blankRow(1, "SCHEDULED")]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [status, setStatus] = useState<ChapterStatus>("SCHEDULED");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  function resetPreview() { setPreview(null); setError(null); }
  function updateRow(key: number, change: Partial<DraftRow>) {
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...change } : row));
    resetPreview();
  }
  function chooseRevision(row: DraftRow, previousId: string) {
    const previous = chapters.find(chapter => String(chapter.id) === previousId && chapter.status === "RELEASED");
    updateRow(row.key, previous ? {
      supersedesChapterId: previousId, revisionConfirmed: false,
      status: "RELEASED", kind: previous.kind as ChapterKind,
      displayCode: previous.displayCode, title: previous.title ?? "",
      sourceUrl: previous.sourceUrl ?? "", placementMode: "AUTO", anchorChapterId: "",
      volumeNumber: previous.volumeNumber ? String(previous.volumeNumber) : "",
      expectedPrecision: "NONE", expectedRelease: "",
    } : { supersedesChapterId: "", revisionConfirmed: false });
  }
  function close() { if (!busy) setOpen(false); }
  function addRow() {
    if (rows.length >= CHAPTER_BATCH_LIMIT) return;
    setRows(previous => [...previous, blankRow(nextKey.current++, status)]);
    resetPreview();
  }
  async function send(create: boolean) {
    if (busy || disabled || (create && !preview)) return;
    setError(null); setMessage(null);
    let payload: Record<string, unknown>;
    try {
      if (pasteMode) {
        parseChapterBatch(pasteText);
        payload = { intent: create ? "batch-create" : "batch-preview", text: pasteText, status };
      } else {
        const normalized = rows.map(normalizeRow);
        parseStructuredChapterBatch(normalized);
        payload = { intent: create ? "batch-structured-create" : "batch-structured-preview", rows: normalized };
      }
    } catch (cause) { setError((cause as Error).message); return; }
    if (create) payload.snapshot = preview!.snapshot;
    setBusy(true); onBusyChange(true);
    try {
      const response = await fetch(`/api/admin/catalog/comics/${comicId}/chapters`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?next=%2Fadmin%2Fcomics"); return; }
      if (!response.ok) {
        if (create) setPreview(null);
        setError(body.error?.message ?? errors[body.error?.kind] ?? "Не удалось обработать главы. Проверьте данные и повторите предпросмотр.");
        return;
      }
      if (create) {
        setRows([blankRow(nextKey.current++, "SCHEDULED")]);
        setPasteText(""); setPasteMode(false); setPreview(null); setOpen(false); setStatus("SCHEDULED");
        setMessage(`Добавлено глав: ${body.createdCount}.`);
        router.refresh();
      } else setPreview({ snapshot: body.snapshot, rows: body.rows });
    } catch {
      setPreview(null);
      setError("Связь с сервером прервалась. Если пакет уже сохранялся, обновите реестр перед повтором.");
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <div className="mt-5">
    <button type="button" disabled={disabled} onClick={() => { resetPreview(); setOpen(true); }}
      className="min-h-11 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">+ Добавить главы</button>
    {message ? <p role="status" className="mt-2 text-sm text-[var(--text-primary)]">{message}</p> : null}
    <dialog ref={dialogRef} aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}
      className="fixed inset-0 m-auto w-[min(760px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/70 sm:max-h-[90dvh]">
      <div className="flex max-h-[calc(100dvh-16px)] flex-col sm:max-h-[90dvh]">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
        <div><h4 id={`${id}-title`} className="text-lg font-semibold">Добавить главы</h4>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Одна глава или до {CHAPTER_BATCH_LIMIT} за один раз. Дополнительные настройки находятся внутри каждой строки.</p></div>
        <button type="button" aria-label="Закрыть добавление глав" disabled={busy} onClick={close}
          className="min-h-11 shrink-0 rounded-lg border border-[var(--border)] px-3 text-lg">×</button>
      </div>
      <div data-chapter-dialog-scroll className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <label className="block text-sm font-medium">Статус добавляемых глав
          <select value={status} disabled={busy} onChange={event => {
            const next = event.target.value as ChapterStatus;
            setStatus(next); setRows(previous => previous.map(row => ({ ...row, status: next })));
            resetPreview();
          }} className={field}>
            <option value="SCHEDULED">Запланированы</option><option value="RELEASED">Опубликованы</option>
          </select>
        </label>
        {!pasteMode ? <div className="space-y-3">
          {rows.map((row, index) => <section key={row.key} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold">Глава {index + 1}</h5>
              {rows.length > 1 ? <button type="button" disabled={busy} className="text-sm text-[var(--danger)]"
                onClick={() => { setRows(previous => previous.filter(item => item.key !== row.key)); resetPreview(); }}>Убрать</button> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">Ссылка на главу
                <input type="url" value={row.sourceUrl} disabled={busy} placeholder="https://... (необязательно)"
                  onChange={event => updateRow(row.key, { sourceUrl: event.target.value })} className={field} />
              </label>
              <label className="block text-sm font-medium">Название главы
                <input value={row.title} disabled={busy} maxLength={255} placeholder="Например, Новая встреча"
                  onChange={event => updateRow(row.key, { title: event.target.value })} className={field} />
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">Укажите название или код главы. Одной ссылки недостаточно.</p>
            <details className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Дополнительные настройки</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">Код главы
                  <input value={row.displayCode} disabled={busy} maxLength={160} placeholder="1, 1.5, Extra…"
                    onChange={event => updateRow(row.key, { displayCode: event.target.value })} className={field} />
                </label>
                <label className="block text-sm">Тип главы
                  <select value={row.kind} disabled={busy} onChange={event => updateRow(row.key, { kind: event.target.value as ChapterKind })} className={field}>
                    <option value="MAIN">Основная</option><option value="SPECIAL">Спешиал / бонус</option>
                  </select>
                </label>
                <label className="block text-sm">Том (необязательно)
                  <input type="number" min={1} max={99} step={1} value={row.volumeNumber} disabled={busy} placeholder="Без тома"
                    onChange={event => updateRow(row.key, { volumeNumber: event.target.value, placementMode: "AUTO", anchorChapterId: "" })} className={field} />
                </label>
                <label className="block text-sm">Расположение в томе
                  <select value={row.placementMode} disabled={busy} onChange={event => updateRow(row.key, {
                    placementMode: event.target.value as DraftRow["placementMode"], anchorChapterId: "",
                  })} className={field}>
                    <option value="AUTO">{row.supersedesChapterId ? "На месте старой редакции" : "В конец тома"}</option>
                    <option value="BEFORE">Перед выбранной главой</option>
                    <option value="AFTER">После выбранной главы</option>
                  </select>
                </label>
                {row.placementMode !== "AUTO" ? <label className="block text-sm">Соседняя глава в том же томе
                  <select value={row.anchorChapterId} disabled={busy} onChange={event => updateRow(row.key, { anchorChapterId: event.target.value })} className={field}>
                    <option value="">Выберите главу</option>
                    {chapters.filter(chapter => chapter.status !== "ARCHIVED" &&
                      (chapter.volumeNumber === (row.volumeNumber.trim() ? Number(row.volumeNumber) : null)) &&
                      String(chapter.id) !== row.supersedesChapterId)
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
                      .map(chapter => <option key={chapter.id} value={chapter.id}>
                        {chapter.displayCode || chapter.title || `ID ${chapter.id}`}{chapter.displayCode && chapter.title ? ` — ${chapter.title}` : ""}
                      </option>)}
                  </select>
                </label> : null}
                <label className="block text-sm">Статус этой главы
                  <select value={row.status} disabled={busy} onChange={event => updateRow(row.key, { status: event.target.value as ChapterStatus, releasedDate: "", expectedRelease: "", expectedPrecision: "NONE" })} className={field}>
                    <option value="SCHEDULED">Запланирована</option><option value="RELEASED">Опубликована</option>
                  </select>
                </label>
                {row.status === "RELEASED" ? <label className="block text-sm">Дата выхода (необязательно)
                  <input type="date" value={row.releasedDate} disabled={busy} onChange={event => updateRow(row.key, { releasedDate: event.target.value })} className={field} />
                </label> : <>
                  <label className="block text-sm">Точность ожидаемой даты
                    <select value={row.expectedPrecision} disabled={busy} onChange={event => updateRow(row.key, { expectedPrecision: event.target.value as ExpectedReleasePrecision, expectedRelease: "" })} className={field}>
                      <option value="NONE">Дата неизвестна</option><option value="YEAR">Год</option><option value="MONTH">Месяц и год</option><option value="DAY">Точная дата</option>
                    </select>
                  </label>
                  {row.expectedPrecision !== "NONE" ? <label className="block text-sm">Ожидаемый выход
                    <input type={row.expectedPrecision === "DAY" ? "date" : row.expectedPrecision === "MONTH" ? "month" : "text"}
                      inputMode={row.expectedPrecision === "YEAR" ? "numeric" : undefined}
                      placeholder={row.expectedPrecision === "YEAR" ? "2027" : undefined}
                      value={row.expectedRelease} disabled={busy}
                      onChange={event => updateRow(row.key, { expectedRelease: event.target.value })} className={field} />
                  </label> : null}
                </>}
              </div>
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <label className="block text-sm font-medium">Новая редакция вместо существующей главы
                  <select value={row.supersedesChapterId} disabled={busy} onChange={event => chooseRevision(row, event.target.value)} className={field}>
                    <option value="">Обычная новая глава (без замены)</option>
                    {chapters.filter(chapter => chapter.status === "RELEASED").map(chapter => <option key={chapter.id} value={chapter.id}>
                      Заменить: {chapter.displayCode || chapter.title || `ID ${chapter.id}`} (ID {chapter.id})
                    </option>)}
                  </select>
                </label>
                {row.supersedesChapterId ? <div className="mt-2 space-y-2">
                  <p className="text-xs text-[var(--text-secondary)]">Новая редакция будет опубликована, старая перейдёт в архив. История чтения старой версии сохранится.</p>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={row.revisionConfirmed} disabled={busy}
                      onChange={event => updateRow(row.key, { revisionConfirmed: event.target.checked })} className="mt-1 size-5" />
                    Подтверждаю замену старой редакции с сохранением истории чтения
                  </label>
                </div> : null}
              </div>
            </details>
          </section>)}
          <button type="button" disabled={busy || rows.length >= CHAPTER_BATCH_LIMIT} onClick={addRow}
            className="min-h-11 w-full rounded-xl border border-dashed border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-50">+ Ещё глава</button>
        </div> : <div>
          <label htmlFor={`${id}-paste`} className="block text-sm font-medium">Список из таблицы</label>
          <textarea id={`${id}-paste`} rows={7} maxLength={20000} disabled={busy} value={pasteText}
            onChange={event => { setPasteText(event.target.value); resetPreview(); }} placeholder={"1\tПервая глава\tMAIN\thttps://example.com/1\n2\tВторая глава"}
            className={`${field} resize-y`} />
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Столбцы через Tab: код, название, MAIN/SPECIAL, ссылка. Для размещения внутри тома, дат и замен редакций используйте обычные строки выше.</p>
        </div>}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={pasteMode} disabled={busy}
            onChange={event => { setPasteMode(event.target.checked); resetPreview(); }} className="size-5" />
          Вставить список из таблицы вместо ручного ввода
        </label>
        {error ? <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {preview ? <section className="space-y-3 rounded-xl border border-[var(--border)] p-3">
          <h5 className="font-semibold">Предпросмотр: {preview.rows.length} глав</h5>
          <p className="text-xs text-[var(--text-secondary)]">Всё сохраняется одной транзакцией. При замене редакции старая архивируется, а история чтения остаётся.</p>
          <ol className="max-h-52 space-y-2 overflow-y-auto">
            {preview.rows.map((row, index) => <li key={index} className="text-sm">{index + 1}. <strong>{row.displayCode || row.title}</strong>{row.displayCode && row.title ? ` — ${row.title}` : ""}
              <span className="block text-xs text-[var(--text-secondary)]">{row.kind === "SPECIAL" ? "Спешиал" : "Основная"} · позиция в томе рассчитана автоматически{row.supersedesChapterId ? " · новая редакция" : ""}</span>
            </li>)}
          </ol>
        </section> : null}
      </div>
        <div data-chapter-dialog-footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6 sm:py-4">
          <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm">Отмена</button>
          {preview ? <button type="button" disabled={busy || disabled} onClick={() => void send(true)}
            className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
            {busy ? "Сохраняем…" : preview.rows.length === 1 ? "Сохранить главу" : `Сохранить ${preview.rows.length} глав`}
          </button> : <button type="button" disabled={busy || disabled} onClick={() => void send(false)}
            className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
            {busy ? "Проверяем…" : "Проверить главы"}
          </button>}
        </div>
      </div>
    </dialog>
  </div>;
}
