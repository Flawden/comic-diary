import { workTypeLabels, workFormatLabels } from "@/modules/comics/work-metadata";
import { seriesStatusLabels } from "@/modules/comics/series-status";
import Link from "next/link";

import type { ComicListItem } from "@/modules/comics/queries/get-comics";
import { getLibraryProgressPercent } from "@/modules/library/library-view";
import { CoverImage } from "@/shared/components/media";
import { Badge } from "@/shared/components/ui";

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

      <article className="catalog-book">
        <Link href={`/comics/${comic.slug}`} className="catalog-book-cover">
          <CoverImage src={comic.coverUrl} alt={`Обложка ${comic.title}`} className="aspect-[3/4] rounded-[var(--cd-radius-card)]" imageClassName="object-contain" fallback={comic.title} />
        </Link>
        <div className="catalog-book-body">
          <p className="text-xs font-medium text-[var(--text-accent)]">{comic.categoryName}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-[var(--text-primary)]">
            <Link href={`/comics/${comic.slug}`} title={comic.title} className="break-words hover:underline">{comic.title}</Link>
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {comic.seriesStatus !== "UNKNOWN" ? <Badge variant={comic.seriesStatus === "FINISHED" ? "success" : "neutral"}>{seriesStatusLabels[comic.seriesStatus]}</Badge> : null}<span className="text-xs text-[var(--text-secondary)]">{[comic.workType !== "UNKNOWN" ? workTypeLabels[comic.workType] : null, comic.workFormat !== "UNKNOWN" ? workFormatLabels[comic.workFormat] : null].filter(Boolean).join(" · ")}</span>
            <span className="text-xs text-[var(--text-secondary)]">
              {progressCeiling !== null && progressCeiling > 0 ? `Основных глав: ${progressCeiling}` : ""}
            </span>
          </div>
          {comic.description ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{comic.description}</p> : null}
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
            <Link href={`/comics/${comic.slug}`} className="inline-flex min-h-11 items-center rounded-[var(--cd-radius-button)] border border-[var(--border)] px-3 text-[var(--text-primary)] hover:bg-[var(--surface-raised)]">Открыть историю →</Link>

          </div>
        </div>
      </article>

  );
}
