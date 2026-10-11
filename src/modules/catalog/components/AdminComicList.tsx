"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/shared/components/ui/Button";

type Comic = {
  id: number;
  title: string;
  slug: string;
  publicationStatus: "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  categorySlug: string | null;
};
const PAGE_SIZE = 20;

export function AdminComicList({ comics, categories, locked, children }: {
  comics: Comic[];
  categories: { slug: string; name: string }[];
  locked: boolean;
  children: (visibleIds: Set<number>) => ReactNode;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const query = search.trim().toLocaleLowerCase("ru");
  const filtered = comics.filter(comic =>
    (status === "ALL" || comic.publicationStatus === status) &&
    (category === "ALL" || (category === "UNCATEGORIZED" ? comic.categorySlug === null : `category:${comic.categorySlug}` === category)) &&
    (!query || `${comic.title} ${comic.slug}`.toLocaleLowerCase("ru").includes(query))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleIds = new Set(filtered.slice(start, start + PAGE_SIZE).map(comic => comic.id));
  const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]";
  function reset() { setSearch(""); setStatus("ALL"); setCategory("ALL"); setPage(1); }

  return <div className="mt-4 space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <label htmlFor={`${id}-search`} className="text-sm font-medium">Найти тайтл
        <input id={`${id}-search`} type="search" value={search} disabled={locked} maxLength={255}
          placeholder="Название или slug" className={fieldClass}
          onChange={event => { setSearch(event.target.value); setPage(1); }} />
      </label>
      <label htmlFor={`${id}-status`} className="text-sm font-medium">Статус в каталоге
        <select id={`${id}-status`} value={status} disabled={locked} className={fieldClass}
          onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="ALL">Все статусы</option><option value="PUBLISHED">Опубликованные</option>
          <option value="HIDDEN">Скрытые</option><option value="ARCHIVED">Архив</option>
        </select>
      </label>
      <label htmlFor={`${id}-category`} className="text-sm font-medium">Категория
        <select id={`${id}-category`} value={category} disabled={locked} className={fieldClass}
          onChange={event => { setCategory(event.target.value); setPage(1); }}>
          <option value="ALL">Все категории</option><option value="UNCATEGORIZED">Без категории</option>
          {categories.map(item => <option key={item.slug} value={`category:${item.slug}`}>{item.name}</option>)}
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p role="status">Найдено: {filtered.length} из {comics.length}{filtered.length ? ` · Показаны ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)}` : ""}</p>
      <Button variant="ghost" disabled={locked} onClick={reset}>Сбросить фильтры</Button>
    </div>
    {locked ? <p className="text-sm text-[var(--text-secondary)]">Завершите загрузку, редактирование или подтверждение действия, чтобы переключить список.</p> : null}
    {!filtered.length ? <p className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">Тайтлы не найдены. Измените условия или сбросьте фильтры.</p> : null}
    {/* Keep forms mounted: filtering and pagination must not discard drafts. */}
    {children(visibleIds)}
    {pages > 1 ? <nav aria-label="Страницы списка тайтлов" className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={locked || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</Button>
      <span className="text-sm">{currentPage} / {pages}</span>
      <Button variant="secondary" disabled={locked || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</Button>
    </nav> : null}
  </div>;
}
