"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseChapterBatch, type ChapterBatchRow, CHAPTER_BATCH_LIMIT } from "../chapter-batch-input";

type ChapterKind = "MAIN" | "SPECIAL";
type DraftRow = { key: number; title: string; sourceUrl: string; displayCode: string; kind: ChapterKind };
type Preview = { snapshot: string; rows: (ChapterBatchRow & { sortOrder: number; status: string })[] };
const blankRow = (key: number): DraftRow => ({ key, title: "", sourceUrl: "", displayCode: "", kind: "MAIN" });
const errors: Record<string, string> = {
  "chapter-display-code-conflict": "В реестре уже есть активная глава с таким кодом. Исправьте список и повторите проверку.",
  "chapter-batch-stale": "Список глав изменился после предпросмотра. Проверьте пакет заново.",
  "forbidden": "Недостаточно прав для изменения каталога.",
};

const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]";

export function ChapterBatchEditor({ comicId, disabled, onBusyChange }: { comicId: number; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextKey = useRef(2);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([blankRow(1)]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [status, setStatus] = useState<"SCHEDULED" | "RELEASED">("SCHEDULED");
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
  function close() { if (!busy) setOpen(false); }
  function addRow() {
    if (rows.length >= CHAPTER_BATCH_LIMIT) return;
    setRows(previous => [...previous, blankRow(nextKey.current++)]);
    resetPreview();
  }
  function currentText() {
    return pasteMode ? pasteText : rows.map(row => [row.displayCode, row.title, row.kind, row.sourceUrl].join("\t")).join("\n");
  }
  async function send(create: boolean) {
    if (busy || disabled || (create && !preview)) return;
    setError(null); setMessage(null);
    const text = currentText();
    try { parseChapterBatch(text); } catch (cause) { setError((cause as Error).message); return; }
    setBusy(true); onBusyChange(true);
    try {
      const response = await fetch(`/api/admin/catalog/comics/${comicId}/chapters`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: create ? "batch-create" : "batch-preview", text, status, snapshot: create ? preview!.snapshot : undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?next=%2Fadmin%2Fcomics"); return; }
      if (!response.ok) {
        if (create) setPreview(null);
        setError(body.error?.message ?? errors[body.error?.kind] ?? "Не удалось обработать главы. Проверьте данные и повторите предпросмотр.");
        return;
      }
      if (create) {
        setRows([blankRow(nextKey.current++)]);
        setPasteText(""); setPasteMode(false); setPreview(null); setOpen(false);
        setMessage(`Добавлено глав: ${body.createdCount}.`);
        router.refresh();
      } else {
        setPreview({ snapshot: body.snapshot, rows: body.rows });
      }
    } catch {
      setPreview(null);
      setError("Связь с сервером прервалась. Если пакет уже сохранялся, сначала обновите реестр и проверьте добавленные главы.");
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <div className="mt-5">
    <button type="button" disabled={disabled} onClick={() => { resetPreview(); setOpen(true); }}
      className="min-h-11 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
      + Добавить главы
    </button>
    {message ? <p role="status" className="mt-2 text-sm text-[var(--text-primary)]">{message}</p> : null}
    <dialog ref={dialogRef} aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}
      className="w-[min(760px,calc(100vw-24px))] max-h-[90dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/70 sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h4 id={`${id}-title`} className="text-lg font-semibold">Добавить главы</h4>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Заполни главы по очереди и сохрани их одним пакетом. До {CHAPTER_BATCH_LIMIT} за раз.</p>
        </div>
        <button type="button" aria-label="Закрыть добавление глав" disabled={busy} onClick={close}
          className="min-h-11 shrink-0 rounded-lg border border-[var(--border)] px-3 text-lg">×</button>
      </div>
      <div className="mt-4 space-y-4">
        <label className="block text-sm font-medium">Статус добавляемых глав
          <select value={status} disabled={busy} onChange={event => { setStatus(event.target.value as typeof status); resetPreview(); }} className={field}>
            <option value="SCHEDULED">Запланированы (не видны как вышедшие)</option>
            <option value="RELEASED">Опубликованы</option>
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
            <p className="mt-2 text-xs text-[var(--text-secondary)]">Нужно название или код главы. Одна ссылка без названия не сохранится.</p>
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
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Позиция назначается автоматически в порядке строк. Тома, даты, ручной порядок и замену редакции пока можно задать через «Расширенное создание» под списком глав.</p>
            </details>
          </section>)}
          <button type="button" disabled={busy || rows.length >= CHAPTER_BATCH_LIMIT} onClick={addRow}
            className="min-h-11 w-full rounded-xl border border-dashed border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-50">
            + Ещё глава
          </button>
        </div> : <div>
          <label htmlFor={`${id}-paste`} className="block text-sm font-medium">Список из таблицы</label>
          <textarea id={`${id}-paste`} rows={7} maxLength={20000} disabled={busy} value={pasteText}
            onChange={event => { setPasteText(event.target.value); resetPreview(); }} placeholder={"1\tПервая глава\tMAIN\thttps://example.com/1\n2\tВторая глава"}
            className={`${field} resize-y`} />
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Столбцы через Tab: код, название, MAIN/SPECIAL, ссылка. Одна глава в строке.</p>
        </div>}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={pasteMode} disabled={busy}
            onChange={event => { setPasteMode(event.target.checked); resetPreview(); }} className="size-5" />
          Вставить список из таблицы вместо ручного ввода
        </label>
        {error ? <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {preview ? <section className="space-y-3 rounded-xl border border-[var(--border)] p-3">
          <h5 className="font-semibold">Предпросмотр: {preview.rows.length} глав</h5>
          <p className="text-xs text-[var(--text-secondary)]">Существующие главы не изменятся. Добавление выполняется целиком: либо все, либо ни одной.</p>
          <ol className="max-h-52 space-y-2 overflow-y-auto">
            {preview.rows.map((row, index) => <li key={index} className="text-sm">{index + 1}. <strong>{row.displayCode || row.title}</strong>{row.displayCode && row.title ? ` — ${row.title}` : ""}<span className="block text-xs text-[var(--text-secondary)]">{row.kind === "SPECIAL" ? "Спешиал" : "Основная"} · порядок {row.sortOrder}</span></li>)}
          </ol>
        </section> : null}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] pt-4">
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
