"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui";
import type { ComicChapter } from "@/modules/comics/queries/get-comic-chapters";

type Chapter = Omit<ComicChapter, "releasedAt">;
type Props = { comicId: number; chapters: Chapter[]; readIds: number[]; canMark: boolean };

function safeSource(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? value : null; }
  catch { return null; }
}

export function ChapterReadingPanel({ comicId, chapters, readIds, canMark }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("MAIN");
  const [limit, setLimit] = useState(30);
  const read = new Set(readIds);
  const active = chapters.filter((c) => c.status === "RELEASED");
  const main = active.filter((c) => c.kind === "MAIN");
  const filtered = active.filter((c) => c.kind === kind &&
    `${c.displayCode} ${c.title ?? ""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const history = chapters.filter((c) => c.status === "ARCHIVED" && read.has(c.id));
  const control = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm";

  return (
    <section className="chapter-panel" aria-label="Главы и история чтения">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Главы</h2>
        <span className="text-sm text-[var(--text-secondary)]">Основных: {main.length} · Спецвыпусков: {active.length - main.length}</span>
      </div>
      {canMark && main.length > 0 ? (
        <details className="chapter-bulk"><summary>Отметить несколько глав прочитанными</summary>
          <form action="/api/library/reading-state" method="post">
            <input type="hidden" name="comicId" value={comicId} />
            <input type="hidden" name="intent" value="chapter-reading" />
            <input type="hidden" name="action" value="read-through" />
            <label className="block text-sm font-medium">
              Прочитано до главы
              <select name="chapterId" required defaultValue="" className={`${control} mt-2`}>
                <option value="" disabled>Выберите последнюю прочитанную главу</option>
                {main.map((c) => <option key={c.id} value={c.id}>{c.displayCode}{c.title ? ` — ${c.title}` : ""}{c.supersedesChapterId ? " (новая редакция)" : ""}</option>)}
              </select>
            </label>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Отметит основные главы до выбранной включительно в текущем порядке. Спецвыпуски и архивные версии останутся без изменений.</p>
            <Button type="submit" className="mt-3 w-full sm:w-auto">Отметить прочитанное до выбранной</Button>
          </form>
        </details>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Поиск по коду или названию
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(30); }} placeholder="15.5, спецвыпуск, название…" className={`${control} mt-2`} />
        </label>
        <label className="block text-sm">Раздел
          <select value={kind} onChange={(e) => { setKind(e.target.value); setLimit(30); }} className={`${control} mt-2`}>
            <option value="MAIN">Основные главы</option><option value="SPECIAL">Спецвыпуски и бонусы</option>
          </select>
        </label>
      </div>
      <ul className="chapter-list">
        {filtered.slice(0, limit).map((c) => {
          const source = safeSource(c.sourceUrl);
          const isRead = read.has(c.id);
          return <li key={c.id} className={`chapter-line ${isRead ? "is-read" : ""}`}>
            <div className="chapter-line-title">
              <h3>{c.displayCode}</h3>
              {c.title ? <p>{c.title}</p> : null}
              {c.supersedesChapterId ? <details className="chapter-revision"><summary>Новая редакция</summary><p>Отметка старой версии хранится в архиве. Эту версию можно отметить отдельно.</p></details> : null}
            </div>
            <div className="chapter-line-actions">
              {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="tea-text-action" aria-label={`Читать главу ${c.displayCode} в источнике, новая вкладка`}>Читать ↗</a> : null}
              {canMark ? <form action="/api/library/reading-state" method="post">
                <input type="hidden" name="comicId" value={comicId} />
                <input type="hidden" name="intent" value="chapter-reading" />
                <input type="hidden" name="chapterId" value={c.id} />
                <input type="hidden" name="action" value={isRead ? "unread" : "read"} />
                <button type="submit" className="chapter-mark" aria-label={`${isRead ? "Снять отметку прочитанного" : "Отметить прочитанной"}: глава ${c.displayCode}`} title={isRead ? "Прочитано — снять отметку" : "Отметить прочитанной"}>
                  <span aria-hidden="true">{isRead ? "✓" : "○"}</span>
                  <span className="chapter-mark-caption">{isRead ? "Прочитано" : "Отметить"}</span>
                </button>
              </form> : null}
            </div>
          </li>;
        })}
      </ul>
      {filtered.length === 0 ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{query ? "По запросу ничего не найдено." : "В этом разделе пока нет опубликованных глав."}</p> : null}
      {filtered.length > limit ? <Button variant="secondary" className="mt-3" onClick={() => setLimit(limit + 30)}>Показать ещё 30</Button> : null}
      {history.length ? <details className="mt-5 rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer font-semibold">Прочитанные архивные версии ({history.length})</summary><ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{history.map((c) => <li key={c.id}>{c.displayCode}{c.title ? ` — ${c.title}` : ""} · прочитано</li>)}</ul></details> : null}
      {!canMark ? <p className="mt-4 text-sm text-[var(--text-secondary)]">Добавьте комикс в свою библиотеку, чтобы отмечать чтение.</p> : null}
    </section>
  );
}
