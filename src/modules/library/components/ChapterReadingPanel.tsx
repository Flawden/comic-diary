"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/shared/components/ui";
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
    <section className="mt-6" aria-label="Главы и история чтения">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Главы</h2>
        <span className="text-sm text-[var(--text-secondary)]">Основных: {main.length} · Спешиалов: {active.length - main.length}</span>
      </div>
      {canMark && main.length > 0 ? (
        <Card padding="sm" className="mt-4">
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
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Отметит основные главы до выбранной включительно в текущем порядке. Спешиалы и архивные версии останутся без изменений.</p>
            <Button type="submit" className="mt-3 w-full sm:w-auto">Отметить прочитанное до выбранной</Button>
          </form>
        </Card>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Поиск по коду или названию
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(30); }} placeholder="15.5, спешиал, название…" className={`${control} mt-2`} />
        </label>
        <label className="block text-sm">Раздел
          <select value={kind} onChange={(e) => { setKind(e.target.value); setLimit(30); }} className={`${control} mt-2`}>
            <option value="MAIN">Основные главы</option><option value="SPECIAL">Спешиалы и бонусы</option>
          </select>
        </label>
      </div>
      <ul className="mt-4 space-y-3">
        {filtered.slice(0, limit).map((c) => {
          const source = safeSource(c.sourceUrl);
          return <li key={c.id}>
            <Card padding="sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 break-words"><h3 className="font-semibold">{c.displayCode}</h3>{c.title ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{c.title}</p> : null}</div>
                {canMark ? <Badge variant={read.has(c.id) ? "success" : "neutral"}>{read.has(c.id) ? "Прочитано" : "Не прочитано"}</Badge> : null}
              </div>
              {c.supersedesChapterId ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Новая редакция · отметка старой версии хранится отдельно</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--text-accent)]">Читать в источнике ↗</a> : null}
                {canMark ? <form action="/api/library/reading-state" method="post">
                  <input type="hidden" name="comicId" value={comicId} />
                  <input type="hidden" name="intent" value="chapter-reading" />
                  <input type="hidden" name="chapterId" value={c.id} />
                  <input type="hidden" name="action" value={read.has(c.id) ? "unread" : "read"} />
                  <Button type="submit" variant="secondary">{read.has(c.id) ? "Снять отметку" : "Прочитал эту главу"}</Button>
                </form> : null}
              </div>
            </Card>
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
