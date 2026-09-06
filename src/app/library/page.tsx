import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import { LibraryStat } from "@/modules/library/components/LibraryStat";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUserLibrary } from "@/modules/library/queries/get-user-library";
import { calculateAverageRating } from "@/modules/library/ratings/calculate-average-rating";
import {
  compareLibraryViewItems,
  getLibraryProgressPercent,
  isLibrarySort,
  librarySortLabels,
  type LibrarySort,
} from "@/modules/library/library-view";

export const dynamic = "force-dynamic";

const statusLabels = {
  WANT_TO_READ: "Хочу прочитать",
  READING: "Читаю",
  COMPLETED: "Прочитано",
  ON_HOLD: "Отложено",
} as const;

const filterLabels = {
  ALL: "Все",
  READING: "Читаю",
  WANT_TO_READ: "Хочу прочитать",
  COMPLETED: "Прочитано",
  ON_HOLD: "Отложено",
} as const;

type LibraryFilter =
  keyof typeof filterLabels;

type LibraryPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    sort?: string | string[];
  }>;
};

function isLibraryFilter(
  value: string,
): value is LibraryFilter {
  return Object.prototype.hasOwnProperty.call(
    filterLabels,
    value,
  );
}

function libraryHref(
  filter: LibraryFilter,
  sort: LibrarySort,
) {
  const params =
    new URLSearchParams();

  if (filter !== "ALL") {
    params.set(
      "status",
      filter,
    );
  }

  if (sort !== "UPDATED") {
    params.set(
      "sort",
      sort,
    );
  }

  const query =
    params.toString();

  return query === ""
    ? "/library"
    : `/library?${query}`;
}

export default async function LibraryPage({
  searchParams,
}: LibraryPageProps) {
  const currentUser =
    await getCurrentUser();

  if (!currentUser) {
    redirect(
      "/login?next=/library",
    );
  }

  const [
    library,
    resolvedSearchParams,
  ] = await Promise.all([
    getUserLibrary(
      currentUser.id,
    ),
    searchParams,
  ]);

  const rawStatus =
    resolvedSearchParams.status;

  const requestedStatus =
    Array.isArray(rawStatus)
      ? rawStatus[0]
      : rawStatus;

  const activeFilter: LibraryFilter =
    requestedStatus &&
    isLibraryFilter(requestedStatus)
      ? requestedStatus
      : "ALL";

  const rawSort =
    resolvedSearchParams.sort;

  const requestedSort =
    Array.isArray(rawSort)
      ? rawSort[0]
      : rawSort;

  const activeSort: LibrarySort =
    requestedSort &&
    isLibrarySort(requestedSort)
      ? requestedSort
      : "UPDATED";

  const readingCount =
    library.filter(
      (item) =>
        item.status === "READING",
    ).length;

  const wantToReadCount =
    library.filter(
      (item) =>
        item.status ===
        "WANT_TO_READ",
    ).length;

  const completedCount =
    library.filter(
      (item) =>
        item.status ===
        "COMPLETED",
    ).length;

  const onHoldCount =
    library.filter(
      (item) =>
        item.status === "ON_HOLD",
    ).length;

  const filterCounts: Record<
    LibraryFilter,
    number
  > = {
    ALL: library.length,
    READING: readingCount,
    WANT_TO_READ: wantToReadCount,
    COMPLETED: completedCount,
    ON_HOLD: onHoldCount,
  };

  const filteredLibrary = (
    activeFilter === "ALL"
      ? library
      : library.filter(
          (item) =>
            item.status ===
            activeFilter,
        )
  )
    .map((item) => {
      const averageRating =
        calculateAverageRating(
          item,
        );

      return {
        ...item,
        averageRating,
        progressPercent:
          getLibraryProgressPercent(
            item.currentChapter,
            item.totalChapters,
          ),
        hasPersonalNote:
          item.personalNote !== null &&
          item.personalNote.trim() !== "",
      };
    })
    .sort(
      (left, right) =>
        compareLibraryViewItems(
          left,
          right,
          activeSort,
        ),
    );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-sm font-medium text-[var(--primary)]">
          Читательский дневник
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Моя библиотека
        </h1>

        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Комиксы, которые я добавил в личный список чтения.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <LibraryStat
          label="Всего"
          value={library.length}
          href="/library"
        />

        <LibraryStat
          label="Читаю"
          value={readingCount}
          href="/library?status=READING"
        />

        <LibraryStat
          label="Хочу прочитать"
          value={wantToReadCount}
          href="/library?status=WANT_TO_READ"
        />

        <LibraryStat
          label="Прочитано"
          value={completedCount}
          href="/library?status=COMPLETED"
        />

        <LibraryStat
          label="Отложено"
          value={onHoldCount}
          href="/library?status=ON_HOLD"
        />
      </section>

      {library.length > 0 ? (
        <nav
          aria-label="Фильтр библиотеки"
          className="mt-8 flex flex-wrap gap-2"
        >
          {(
            Object.keys(
              filterLabels,
            ) as LibraryFilter[]
          ).map((filter) => {
            const isActive =
              filter === activeFilter;

            const href =
              libraryHref(
                filter,
                activeSort,
              );

            return (
              <Link
                key={filter}
                href={href}
                className={
                  isActive
                    ? "rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
                }
              >
                {filterLabels[filter]}{" "}
                <span className="opacity-70">
                  {filterCounts[filter]}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {library.length > 1 ? (
        <form
          method="get"
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-black/5 bg-[var(--surface)] p-4 sm:flex-row sm:items-end sm:justify-between"
        >
          {activeFilter !== "ALL" ? (
            <input
              type="hidden"
              name="status"
              value={activeFilter}
            />
          ) : null}

          <label className="block flex-1">
            <span className="mb-2 block text-sm font-medium">
              Сортировка библиотеки
            </span>

            <select
              name="sort"
              defaultValue={
                activeSort
              }
              className="w-full rounded-xl border border-black/10 bg-[var(--background)] px-3 py-2 text-sm"
            >
              {(
                Object.keys(
                  librarySortLabels,
                ) as LibrarySort[]
              ).map(
                (sort) => (
                  <option
                    key={sort}
                    value={sort}
                  >
                    {
                      librarySortLabels[
                        sort
                      ]
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Применить
          </button>
        </form>
      ) : null}

      {library.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-black/5 bg-[var(--surface)] p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">
            В библиотеке пока пусто
          </h2>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Добавьте комикс из каталога, и он появится здесь.
          </p>

          <Link
            href="/"
            className="mt-5 inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
          >
            Перейти в каталог
          </Link>
        </section>
      ) : filteredLibrary.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-black/5 bg-[var(--surface)] p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">
            В этом разделе пока пусто
          </h2>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Здесь появятся комиксы со статусом «{filterLabels[activeFilter]}».
          </p>

          <Link
            href={libraryHref(
              "ALL",
              activeSort,
            )}
            className="mt-5 inline-flex rounded-xl border border-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary)]"
          >
            Показать все
          </Link>
        </section>
      ) : (
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLibrary.map(
            (item) => (
              <article
                key={item.comicId}
                className="overflow-hidden rounded-2xl border border-black/5 bg-[var(--surface)] shadow-sm"
              >
                <Link
                  href={`/comics/${item.slug}`}
                  className="block"
                >
                  <div className="aspect-[3/2] bg-[#e4e1d7]">
                    {item.coverUrl ? (
                      <div
                        role="img"
                        aria-label={`Обложка ${item.title}`}
                        className="h-full bg-cover bg-center"
                        style={{
                          backgroundImage:
                            `url("${item.coverUrl}")`,
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
                        Обложка появится позже
                      </div>
                    )}
                  </div>
                </Link>

                <div className="p-5">
                  <p className="text-xs font-medium text-[var(--primary)]">
                    {item.categoryName ??
                      "Без категории"}
                  </p>

                  <Link
                    href={`/comics/${item.slug}`}
                    className="mt-1 block text-lg font-bold hover:underline"
                  >
                    {item.title}
                  </Link>

                  <div className="mt-4 rounded-xl bg-[var(--background)] p-4">
                    <p className="text-sm">
                      Статус:{" "}
                      <strong>
                        {
                          statusLabels[
                            item.status
                          ]
                        }
                      </strong>
                    </p>

                    <p className="mt-1 text-sm">
                      Прогресс:{" "}
                      <strong>
                        {item.currentChapter}
                        {item.totalChapters ===
                        null
                          ? ""
                          : ` / ${item.totalChapters}`}
                      </strong>
                    </p>

                    {item.progressPercent !==
                    null ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                          <span>
                            Прочитано
                          </span>

                          <span>
                            {
                              item.progressPercent
                            }
                            %
                          </span>
                        </div>

                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
                          <div
                            className="h-full rounded-full bg-[var(--primary)]"
                            style={{
                              width:
                                `${item.progressPercent}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 border-t border-black/10 pt-3">
                      <p className="text-sm">
                        Оценка:{" "}
                        {item.averageRating ===
                        null ? (
                          <span className="text-[var(--muted)]">
                            Без оценки
                          </span>
                        ) : (
                          <strong>
                            ★{" "}
                            {item.averageRating.toFixed(
                              1,
                            )}{" "}
                            / 5
                          </strong>
                        )}
                      </p>

                      {item.hasPersonalNote ? (
                        <p className="mt-2 max-h-10 overflow-hidden text-xs leading-5 text-[var(--muted)]">
                          «
                          {
                            item.personalNote
                          }
                          »
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <Link
                    href={`/comics/${item.slug}`}
                    className="mt-4 inline-flex text-sm font-semibold text-[var(--primary)]"
                  >
                    Открыть комикс →
                  </Link>
                </div>
              </article>
            ),
          )}
        </section>
      )}
    </main>
  );
}
