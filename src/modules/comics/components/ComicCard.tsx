import { seriesStatusLabels } from "@/modules/comics/series-status";
import Link from "next/link";

import type { ComicListItem } from "@/modules/comics/queries/get-comics";
import { getLibraryProgressPercent } from "@/modules/library/library-view";
import { CoverImage } from "@/shared/components/media";
import { Badge, Card } from "@/shared/components/ui";

type PersonalState = {
  status: "WANT_TO_READ" | "READING" | "COMPLETED" | "ON_HOLD";
  currentChapter: number;
  chapterReading: { registered: boolean };
};

type ComicCardProps = {
  comic: ComicListItem;
  progressCeiling: number | null;
  personalState?: PersonalState | null;
};

const statusLabels = {
  WANT_TO_READ: "Хочу прочитать",
  READING: "Читаю",
  COMPLETED: "Прочитано",
  ON_HOLD: "Отложено",
} as const;

export function ComicCard({ comic, progressCeiling, personalState = null }: ComicCardProps) {
  const currentChapter = personalState
    ? !personalState.chapterReading.registered || progressCeiling === null
      ? personalState.currentChapter
      : Math.min(personalState.currentChapter, progressCeiling)
    : 0;
  const percent = personalState?.chapterReading.registered
    ? getLibraryProgressPercent(currentChapter, progressCeiling)
    : null;

  return (
    <Card padding="sm" className="h-full">
      <article className="flex h-full gap-4">
        <Link href={`/comics/${comic.slug}`} className="w-24 shrink-0 self-start rounded-[var(--cd-radius-card)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] sm:w-32">
          <CoverImage src={comic.coverUrl} alt={`Обложка ${comic.title}`} className="aspect-[3/4] rounded-[var(--cd-radius-card)]" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <p className="text-xs font-medium text-[var(--text-accent)]">{comic.categoryName ?? "Без категории"}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-[var(--text-primary)]">
            <Link href={`/comics/${comic.slug}`} className="break-words hover:underline">{comic.title}</Link>
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={comic.seriesStatus === "FINISHED" ? "success" : "neutral"}>{seriesStatusLabels[comic.seriesStatus]}</Badge>
            <span className="text-xs text-[var(--text-secondary)]">
              {progressCeiling === null ? "Главы не указаны" : `Основных глав доступно: ${progressCeiling}`}
            </span>
          </div>
          {comic.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{comic.description}</p> : null}
          {personalState ? (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <Badge variant="primary">{statusLabels[personalState.status]}</Badge>
                <span className="text-[var(--text-secondary)]">{personalState.chapterReading.registered ? "Прочитано" : "Общий счётчик"} {currentChapter}{!personalState.chapterReading.registered || progressCeiling === null ? "" : ` / ${progressCeiling}`}</span>
              </div>
              {percent !== null ? (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]"><span>Мой прогресс</span><span>{percent}%</span></div>
                  <div role="progressbar" aria-label={`Прогресс чтения: ${comic.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-4 text-sm font-semibold">
            <Link href={`/comics/${comic.slug}`} className="inline-flex min-h-11 items-center rounded-[var(--cd-radius-button)] border border-[var(--border)] px-3 text-[var(--text-primary)] hover:bg-[var(--surface-raised)]">Подробнее</Link>
            <a href={comic.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-[var(--cd-radius-button)] bg-[var(--primary)] px-3 text-[var(--primary-foreground)] hover:opacity-90">Читать в источнике ↗</a>
          </div>
        </div>
      </article>
    </Card>
  );
}
