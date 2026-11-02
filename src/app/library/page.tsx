import { getCollectionProgress } from "@/modules/library/queries/get-collection-progress";
import { CollectionProgress } from "@/modules/library/components/CollectionProgress";
import { comicListHref } from "@/modules/library/list-navigation";
import { ContinueReading } from "@/modules/library/components/ContinueReading";
import { WorkMetadataFields } from "@/modules/comics/components/WorkMetadataFields";
import { seriesStatusLabels } from "@/modules/comics/series-status";
import Link from "next/link";
import { LibraryComicCard } from "@/modules/library/components/LibraryComicCard";
import { Button } from "@/shared/components/ui";
import {
  redirect,
} from "next/navigation";

import { LibraryView } from "@/modules/library/components/LibraryView";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { hasPrivateCatalogEntitlement } from "@/modules/auth/account-entitlements";
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

const filterLabels = {
  ALL: "Все",
  READING: "Читаю",
  WANT_TO_READ: "В планах",
  COMPLETED: "Прочитано",
  ON_HOLD: "На паузе",
} as const;

type LibraryFilter =
  keyof typeof filterLabels;

type LibraryPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    sort?: string | string[];
    q?: string | string[];
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
  query = "",
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

  if (query) params.set("q", query);

  const encoded = params.toString();

  return encoded === ""
    ? "/library"
    : `/library?${encoded}`;
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
    canUsePrivateCatalog,
    collectionProgress,
  ] = await Promise.all([
    getUserLibrary(
      currentUser.id,
    ),
    searchParams,
    hasPrivateCatalogEntitlement(
      currentUser.id,
    ),
    getCollectionProgress(currentUser.id),
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

  const rawQuery = resolvedSearchParams.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery ?? "").trim().slice(0, 160);
  const queryLower = query.toLocaleLowerCase("ru");

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
    .filter((item) => !query || item.title.toLocaleLowerCase("ru").includes(queryLower))
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
            item.progressCeiling,
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
    <div className="tea-library">
      <header className="library-heading library-heading-v5">
        <div>
          <h1>Мой дневник</h1>
          <p>{library.length ? `На полке: ${library.length} · Читаю: ${readingCount}` : "Ваша следующая история начинается здесь."}</p>
        </div>
        <Link href="/" className="tea-text-action">В каталог <span aria-hidden="true">↗</span></Link>
      </header>

      {activeFilter === "ALL" && !query ? <ContinueReading items={library} listQuery={resolvedSearchParams} /> : null}

      {library.length > 0 ? (
        <nav
          aria-label="Фильтр библиотеки"
          className="library-tabs"
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
                query,
              );

            return (
              <Link
                key={filter}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className="library-tab"
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

      {library.length > 0 ? (
        <form
          method="get"
          key={`${activeFilter}:${activeSort}:${query}`}
          className="library-search library-search-v4"
        >
          {activeFilter !== "ALL" ? (
            <input
              type="hidden"
              name="status"
              value={activeFilter}
            />
          ) : null}

          <label className="library-search-field">
            <span className="sr-only">Поиск в библиотеке</span>
            <input type="search" name="q" defaultValue={query} maxLength={160} placeholder="Найти в библиотеке" className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
          </label>
          <Button type="submit">Найти</Button>
          <details className="library-sort-v4">
            <summary>Сортировка <span>{librarySortLabels[activeSort]}</span></summary>
            <div className="library-sort-controls-v4">
          <label className="block flex-1">
            <span className="sr-only">
              Сортировка библиотеки
            </span>

            <select
              name="sort"
              defaultValue={
                activeSort
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
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

              <Button type="submit">Применить</Button>
            </div>
          </details>
          {query ? <Link className="library-reset-v4" href={libraryHref(activeFilter, activeSort, "")}>Сбросить поиск</Link> : null}
        </form>
      ) : null}

      {library.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">
            В библиотеке пока пусто
          </h2>

          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Добавьте комикс из каталога, и он появится здесь.
          </p>

          <Link
            href="/"
            className="mt-5 inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            Перейти в каталог
          </Link>
        </section>
      ) : filteredLibrary.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">
            {query ? "Ничего не найдено" : "В этом разделе пока пусто"}
          </h2>

          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {query ? `По запросу «${query}» нет тайтлов в выбранном разделе.` : `Здесь появятся комиксы со статусом «${filterLabels[activeFilter]}».`}
          </p>

          <Link
            href={libraryHref(
              "ALL",
              activeSort,
            )}
            className="mt-5 inline-flex rounded-xl border border-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary)]"
          >
            Сбросить фильтры
          </Link>
        </section>
      ) : (
        <LibraryView>
          {filteredLibrary.map((item) => (
            <LibraryComicCard key={item.comicId} item={item} href={comicListHref(item.slug, "library", resolvedSearchParams)} />
          ))}
        </LibraryView>
      )}
      <CollectionProgress progress={collectionProgress} />
      {canUsePrivateCatalog ? (
        <details className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-6">
          <summary className="min-h-11 cursor-pointer text-lg font-bold focus-visible:outline-2 focus-visible:outline-[var(--primary)]">Добавить личный тайтл</summary>
          <div className="mt-3 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
              Личный каталог
            </p>

            <h2 className="mt-2 text-xl font-bold">
              Добавить личный тайтл
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Личный тайтл видите только вы. Он не попадает в общий каталог и использует обычные статусы, прогресс, оценки и заметки.
            </p>
          </div>

          <form
            action="/api/library/private-titles"
            method="post"
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <input
              type="hidden"
              name="intent"
              value="create"
            />

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">
                Название
              </span>

              <input
                required
                name="title"
                maxLength={255}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
                placeholder="Название комикса"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">
                Ссылка для чтения
              </span>

              <input
                required
                type="url"
                name="sourceUrl"
                maxLength={2048}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
                placeholder="https://..."
              />
            </label>

            <WorkMetadataFields  />
<label className="block">
                  <span className="mb-1 block text-sm font-medium">Статус выпуска</span>
                  <select name="seriesStatus" defaultValue={"UNKNOWN"} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
                    {Object.entries(seriesStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>

                <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Количество глав
              </span>

              <input
                type="number"
                name="totalChapters"
                min={1}
                step={1}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
                placeholder="Необязательно"
              />
            </label>

            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
              >
                Создать личный тайтл
              </Button>
            </div>
          </form>
        </details>
      ) : null}

    </div>
  );
}
