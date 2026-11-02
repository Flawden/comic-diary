"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { parseChapterBatch, type ChapterBatchRow } from "../chapter-batch-input";

type Preview = { snapshot: string; rows: (ChapterBatchRow & { sortOrder: number; status: string })[] };
const errors: Record<string, string> = {
  "chapter-display-code-conflict": "В реестре уже есть активная глава с таким кодом. Исправьте список и повторите предпросмотр.",
  "chapter-batch-stale": "Реестр изменился после предпросмотра. Проверьте пакет заново.",
  "forbidden": "Недостаточно прав для изменения каталога.",
};

export function ChapterBatchEditor({ comicId, disabled, onBusyChange }: { comicId: number; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const id = useId();
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"SCHEDULED" | "RELEASED">("SCHEDULED");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function send(create: boolean) {
    if (busy || disabled || (create && !preview)) return;
    setError(null); setMessage(null);
    try { parseChapterBatch(text); } catch (error) { setError((error as Error).message); return; }
    setBusy(true); onBusyChange(true);
    try {
      const response = await fetch(`/api/admin/catalog/comics/${comicId}/chapters`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: create ? "batch-create" : "batch-preview", text, status, snapshot: create ? preview!.snapshot : undefined }),
      });
      const body = await response.json();
      if (response.status === 401) { router.replace("/login?next=%2Fadmin%2Fcomics"); return; }
      if (!response.ok) {
        if (create) setPreview(null);
        setError(body.error?.message ?? errors[body.error?.kind] ?? "Не удалось обработать пакет. Проверьте данные и повторите предпросмотр.");
        return;
      }
      if (create) {
        setText(""); setPreview(null); setMessage(`Добавлено глав: ${body.createdCount}.`); router.refresh();
      } else setPreview({ snapshot: body.snapshot, rows: body.rows });
    } catch {
      setPreview(null);
      setError("Связь с сервером прервалась. Если вы сохраняли пакет, обновите страницу и проверьте реестр перед повтором.");
    } finally { setBusy(false); onBusyChange(false); }
  }
  return <details className="mt-5 rounded-xl border border-[var(--cd-border)] bg-[var(--cd-surface-raised)] p-4">
    <summary className="min-h-11 cursor-pointer font-semibold">Добавить несколько глав</summary>
    <div className="mt-3 space-y-3">
      <p className="text-sm text-[var(--cd-text-secondary)]">До 100 новых глав. По одной главе на строку; порядок строк станет порядком глав в конце реестра. Замены редакций добавляются отдельно.</p>
      <label htmlFor={`${id}-text`} className="block text-sm font-medium">Список глав</label>
      <textarea id={`${id}-text`} rows={7} maxLength={20000} value={text} disabled={busy || disabled}
        onChange={event => { setText(event.target.value); setPreview(null); setError(null); setMessage(null); }}
        placeholder={"1\n2\nExtra A"} aria-describedby={`${id}-help`}
        className="w-full rounded-xl border border-[var(--cd-border)] bg-[var(--cd-surface)] p-3 text-sm text-[var(--cd-text-primary)]" />
      <p id={`${id}-help`} className="text-xs text-[var(--cd-text-secondary)]">Можно вставить 4 столбца из таблицы: код, название, MAIN или SPECIAL, ссылка. Для главы без номера оставьте первый столбец пустым и заполните название. Разделитель — табуляция. Без дополнительных столбцов тип будет MAIN; спешалы укажите явно. Дату выхода не придумываем.</p>
      <label className="block text-sm font-medium">Статус всех новых глав
        <select value={status} disabled={busy || disabled} onChange={event => { setStatus(event.target.value as typeof status); setPreview(null); setError(null); setMessage(null); }}
          className="mt-2 min-h-11 w-full rounded-xl border border-[var(--cd-border)] bg-[var(--cd-surface)] px-3 py-2">
          <option value="SCHEDULED">Запланированы</option><option value="RELEASED">Опубликованы</option>
        </select>
      </label>
      {error ? <p role="alert" className="text-sm text-[var(--cd-danger)]">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-[var(--cd-text-primary)]">{message}</p> : null}
      <button type="button" disabled={busy || disabled} onClick={() => void send(false)} className="min-h-11 rounded-xl border border-[var(--cd-primary)] px-4 py-2 text-sm font-semibold text-[var(--cd-primary)] disabled:opacity-60">{busy ? "Проверяем…" : "Предпросмотр"}</button>
      {preview ? <div className="space-y-3">
        <p className="text-sm font-semibold">Добавится {preview.rows.length} глав: {status === "RELEASED" ? "опубликованных" : "запланированных"}. Существующие главы и отметки чтения сохранятся.</p>
        <ol className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-[var(--cd-border)] p-3">
          {preview.rows.map(row => <li key={row.sortOrder} className="break-words text-sm"><strong>{row.displayCode}</strong>{row.title ? `${row.displayCode ? " — " : ""}${row.title}` : ""}<span className="block text-xs text-[var(--cd-text-secondary)]">{row.kind === "SPECIAL" ? "Спешиал" : "Основная"} · Порядок {row.sortOrder} · {row.sourceUrl ?? "Без ссылки"}</span></li>)}
        </ol>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || disabled} onClick={() => void send(true)} className="min-h-11 rounded-xl bg-[var(--cd-primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60">Подтвердить добавление</button>
          <button type="button" disabled={busy || disabled} onClick={() => setPreview(null)} className="min-h-11 rounded-xl border border-[var(--cd-border)] px-4 py-2 text-sm">Отмена</button>
        </div>
      </div> : null}
    </div>
  </details>;
}
