import Link from "next/link";

import type { UserLibraryItem } from "@/modules/library/queries/get-user-library";
import { getLibraryProgressPercent } from "@/modules/library/library-view";
import { calculateAverageRating } from "@/modules/library/ratings/calculate-average-rating";
import { CoverImage } from "@/shared/components/media";
import { Badge, Card } from "@/shared/components/ui";

const statuses = {
  WANT_TO_READ: { label: "Хочу прочитать", variant: "neutral" },
  READING: { label: "Читаю", variant: "primary" },
  COMPLETED: { label: "Прочитано", variant: "success" },
  ON_HOLD: { label: "Отложено", variant: "warning" },
} as const;

export function LibraryComicCard({ item }: { item: UserLibraryItem }) {
  const href = `/comics/${item.slug}`;
  const status = statuses[item.status];
  const percent = item.chapterReading.registered ? getLibraryProgressPercent(item.currentChapter, item.progressCeiling) : null;
  const rating = calculateAverageRating(item);
  const note = item.personalNote?.trim();

  return (
    <Card padding="sm">
      <article aria-label={item.title}>
        <div className="flex gap-4">
          <Link href={href} className="w-16 shrink-0 self-start rounded-xl focus-visible:outline-2 focus-visible:outline-[var(--primary)] sm:w-20">
            <CoverImage src={item.coverUrl} alt={`Обложка ${item.title}`} className="aspect-[3/4] rounded-xl" />
          </Link>
          <div className="min-w-0 flex-1 py-1">
            <p className="text-xs font-medium text-[var(--text-accent)]">
              {item.visibility === "PRIVATE" ? "Личный тайтл" : item.categoryName ?? "Без категории"}
            </p>
            <h2 className="mt-1 break-words text-lg font-bold leading-snug text-[var(--text-primary)]">
              <Link href={href} className="hover:underline">{item.title}</Link>
            </h2>
            <div className="mt-2"><Badge variant={status.variant}>{status.label}</Badge></div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {item.chapterReading.registered ? "Основные главы" : "Общий счётчик"}: <strong className="text-[var(--text-primary)]">{item.currentChapter}{item.progressCeiling === null ? "" : ` / ${item.progressCeiling}`}</strong>
              {item.chapterReading.specialCount > 0 ? ` · Спешиалы ${item.chapterReading.specialReadCount}/${item.chapterReading.specialCount}` : ""}
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {rating === null ? "Без оценки" : `★ ${rating.toFixed(1)} / 5`}
            </p>
          </div>
        </div>
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] [&::-webkit-details-marker]:hidden">
            <span>Прогресс и дневник{note ? " · Есть заметка" : ""}</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
          </summary>
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-[var(--text-secondary)]">{item.chapterReading.registered ? "Основных глав прочитано" : "Общий счётчик без привязки к главам"}</span>
            <strong>{item.currentChapter}{item.progressCeiling === null ? "" : ` / ${item.progressCeiling}`}</strong>
          </div>
          {percent !== null ? (
            <div className="mt-3">
              <div className="mb-1 text-right text-xs text-[var(--text-secondary)]">{percent}%</div>
              <div role="progressbar" aria-label={`Прогресс чтения: ${item.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-[var(--surface)]">
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ) : <p className="mt-2 text-xs text-[var(--text-secondary)]">{item.chapterReading.registered ? "Нет опубликованных основных глав" : "Список глав не заполнен. Процент чтения не рассчитывается."}</p>}
          {item.chapterReading.registered ? <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
            {item.chapterReading.lastReadLabel ? <p className="break-words">Последняя отмеченная: {item.chapterReading.lastReadLabel}</p> : null}
            <p>{item.chapterReading.caughtUp ? "Все вышедшие основные главы прочитаны" : `Непрочитанных основных: ${item.chapterReading.unreadChapters}`}</p>
            {item.chapterReading.updatedChapters ? <p>Новых редакций к чтению: {item.chapterReading.updatedChapters}</p> : null}
            {item.chapterReading.specialCount ? <p>Спешиалы: {item.chapterReading.specialReadCount} / {item.chapterReading.specialCount}</p> : null}
          </div> : null}
          {note ? <p className="mt-3 line-clamp-2 break-words border-t border-[var(--border)] pt-3 text-sm leading-6 text-[var(--text-secondary)]">«{note}»</p> : null}
        </div>
        <Link href={href} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[var(--cd-radius-button)] border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
          Открыть комикс →
        </Link>
        </details>
      </article>
    </Card>
  );
}
