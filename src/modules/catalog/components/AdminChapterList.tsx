"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/shared/components/ui/Button";

type Chapter = {
  id: number;
  displayCode: string;
  title: string | null;
  kind: string;
  status: "SCHEDULED" | "RELEASED" | "ARCHIVED";
  sortOrder: number;
  volumeNumber: number | null;
};
type StatusFilter = "ACTIVE" | "ALL" | Chapter["status"];
const PAGE_SIZE = 40;

export function AdminChapterList<T extends Chapter>({ chapters, locked, children }: {
  chapters: T[];
  locked: boolean;
  children: (visible: T[], canMove: boolean) => ReactNode;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [kind, setKind] = useState("ALL");
  const [page, setPage] = useState(1);
  const query = search.trim().toLocaleLowerCase("ru");
  const filtered = chapters.filter(chapter =>
    (status === "ALL" || (status === "ACTIVE" ? chapter.status !== "ARCHIVED" : chapter.status === status)) &&
    (kind === "ALL" || chapter.kind === kind) &&
    (!query || `${chapter.displayCode} ${chapter.title ?? ""}`.toLocaleLowerCase("ru").includes(query))
  ).sort((a, b) =>
    (a.volumeNumber === null ? 100 : a.volumeNumber) - (b.volumeNumber === null ? 100 : b.volumeNumber) ||
    a.sortOrder - b.sortOrder || a.id - b.id);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  function reset() { setSearch(""); setStatus("ACTIVE"); setKind("ALL"); setPage(1); }
  const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]";

  return <div className="mt-3 space-y-4">
    <p className="text-sm text-[var(--text-secondary)]">
      Опубликовано: {chapters.filter(c => c.status === "RELEASED").length} · Запланировано: {chapters.filter(c => c.status === "SCHEDULED").length} · В архиве: {chapters.filter(c => c.status === "ARCHIVED").length}
    </p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label htmlFor={`${id}-search`} className="text-sm font-medium">Найти главу
        <input id={`${id}-search`} type="search" value={search} disabled={locked} maxLength={255}
          placeholder="Код или название" className={fieldClass}
          onChange={event => { setSearch(event.target.value); setPage(1); }}
          onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
      </label>
      <label htmlFor={`${id}-status`} className="text-sm font-medium">Статус
        <select id={`${id}-status`} value={status} disabled={locked} className={fieldClass}
          onChange={event => { setStatus(event.target.value as StatusFilter); setPage(1); }}>
          <option value="ACTIVE">Без архива</option><option value="RELEASED">Опубликованные</option>
          <option value="SCHEDULED">Запланированные</option><option value="ARCHIVED">Архив</option><option value="ALL">Все</option>
        </select>
      </label>
      <label htmlFor={`${id}-kind`} className="text-sm font-medium">Тип главы
        <select id={`${id}-kind`} value={kind} disabled={locked} className={fieldClass}
          onChange={event => { setKind(event.target.value); setPage(1); }}>
          <option value="ALL">Все типы</option><option value="MAIN">Основные</option><option value="SPECIAL">Спешалы / бонусы</option>
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p role="status">Найдено: {filtered.length}{filtered.length ? ` · Показаны ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)}` : ""}</p>
      <Button variant="ghost" disabled={locked} onClick={reset}>Сбросить фильтры</Button>
    </div>
    <p className="text-xs text-[var(--text-secondary)]">Перемещение доступно без поиска и фильтров, в списке «Без архива», только в пределах одного тома. Соседняя глава может находиться на другой странице.</p>
    {locked ? <p className="text-xs text-[var(--text-secondary)]">Закончите редактирование или подтверждение действия, чтобы изменить фильтры и страницу.</p> : null}
    {filtered.length ? children(filtered.slice(start, start + PAGE_SIZE), !query && status === "ACTIVE" && kind === "ALL") :
      <p className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">По этим условиям глав нет. Измените поиск или сбросьте фильтры.</p>}
    {pages > 1 ? <nav aria-label="Страницы списка глав" className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={locked || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</Button>
      <span className="text-sm">{currentPage} / {pages}</span>
      <Button variant="secondary" disabled={locked || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</Button>
    </nav> : null}
  </div>;
}
