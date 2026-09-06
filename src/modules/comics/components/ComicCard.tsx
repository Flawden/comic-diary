import Link from "next/link";

import type { ComicListItem } from "@/modules/comics/queries/get-comics";

type ComicCardPersonalState = {
  status:
    | "WANT_TO_READ"
    | "READING"
    | "COMPLETED"
    | "ON_HOLD";
  currentChapter: number;
};

type ComicCardProps = {
  comic: ComicListItem;
  personalState?:
    | ComicCardPersonalState
    | null;
};

const statusLabels = {
  WANT_TO_READ: "Хочу прочитать",
  READING: "Читаю",
  COMPLETED: "Прочитано",
  ON_HOLD: "Отложено",
} as const;

function getProgressPercent(
  currentChapter: number,
  totalChapters: number | null,
) {
  if (
    totalChapters === null ||
    totalChapters <= 0
  ) {
    return null;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (
          currentChapter /
          totalChapters
        ) * 100,
      ),
    ),
  );
}

export function ComicCard({
  comic,
  personalState = null,
}: ComicCardProps) {
  const progressPercent =
    personalState
      ? getProgressPercent(
          personalState.currentChapter,
          comic.totalChapters,
        )
      : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-black/5 bg-[var(--surface)] shadow-sm">
      <div className="grid sm:grid-cols-[140px_1fr]">
        <div className="aspect-[3/4] bg-[#e4e1d7] sm:aspect-auto">
          {comic.coverUrl ? (
            <div
              role="img"
              aria-label={`Обложка ${comic.title}`}
              className="h-full min-h-48 bg-cover bg-center"
              style={{
                backgroundImage: `url("${comic.coverUrl}")`,
              }}
            />
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
              Обложка появится позже
            </div>
          )}
        </div>

        <div className="flex flex-col p-5">
          <div>
            <p className="text-sm font-medium text-[var(--primary)]">
              {comic.categoryName ?? "Без категории"}
            </p>

            <h3 className="mt-1 text-xl font-semibold">
              <Link
                href={`/comics/${comic.slug}`}
                className="hover:underline"
              >
                {comic.title}
              </Link>
            </h3>

            <p className="mt-2 text-sm text-[var(--muted)]">
              {comic.totalChapters === null
                ? "Количество глав пока не указано"
                : `Глав: ${comic.totalChapters}`}
            </p>

            {personalState ? (
              <div className="mt-4 rounded-xl bg-[var(--background)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 font-semibold text-[var(--primary)]">
                    {
                      statusLabels[
                        personalState.status
                      ]
                    }
                  </span>

                  <span className="text-[var(--muted)]">
                    Глава{" "}
                    <strong className="text-[var(--foreground)]">
                      {
                        personalState.currentChapter
                      }
                      {comic.totalChapters ===
                      null
                        ? ""
                        : ` / ${comic.totalChapters}`}
                    </strong>
                  </span>
                </div>

                {progressPercent !==
                null ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                      <span>
                        Мой прогресс
                      </span>

                      <span>
                        {progressPercent}%
                      </span>
                    </div>

                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{
                          width:
                            `${progressPercent}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {comic.description ? (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                {comic.description}
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/comics/${comic.slug}`}
              className="inline-flex rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)]"
            >
              Подробнее
            </Link>

            <a
              href={comic.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Читать в VK
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
