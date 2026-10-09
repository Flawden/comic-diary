import { isSeriesStatus, seriesStatusLabels } from "@/modules/comics/series-status";
import Link from "next/link";

import { getChapterProgressCeiling } from "@/modules/comics/queries/get-chapter-progress-ceiling";
import { Button } from "@/shared/components/ui";

import { ComicCard } from "@/modules/comics/components/ComicCard";
import {
  getComics,
  getPublishedCatalogCategories,
} from "@/modules/comics/queries/get-comics";
import {
  catalogSortLabels,
  isCatalogSort,
  normalizeCatalogCategorySlug,
  normalizeCatalogSearch,
  type CatalogSort,
} from "@/modules/comics/catalog-view";
import { LibraryStat } from "@/modules/library/components/LibraryStat";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUserLibrary } from "@/modules/library/queries/get-user-library";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    sort?: string | string[];
    series?: string | string[];
  }>;
};

function firstQueryValue(
  value:
    | string
    | string[]
    | undefined,
) {
  return Array.isArray(value)
    ? value[0]
    : value;
}

export default async function Home({
  searchParams,
}: HomePageProps) {
  const resolvedSearchParams =
    await searchParams;

  const search =
    normalizeCatalogSearch(
      firstQueryValue(
        resolvedSearchParams.q,
      ),
    );

  const categorySlug =
    normalizeCatalogCategorySlug(
      firstQueryValue(
        resolvedSearchParams.category,
      ),
    );

  const rawSort =
    firstQueryValue(
      resolvedSearchParams.sort,
    );

  const sort: CatalogSort =
    rawSort &&
    isCatalogSort(rawSort)
      ? rawSort
      : "TITLE_ASC";

  const rawSeries = firstQueryValue(resolvedSearchParams.series);
  const seriesStatus = rawSeries && isSeriesStatus(rawSeries) ? rawSeries : null;

  const currentUser =
    await getCurrentUser();

  const [
    categoryList,
    comicList,
    library,
  ] = await Promise.all([
    getPublishedCatalogCategories(),
    getComics({
      search,
      categorySlug,
      sort,
      seriesStatus,
    }),
    currentUser
      ? getUserLibrary(
          currentUser.id,
        )
      : [],
  ]);

  const catalogWithProgress = await Promise.all(
    comicList.map(async (comic) => ({
      comic,
      progressCeiling: await getChapterProgressCeiling(comic.id),
    })),
  );

  const hasCatalogFilters =
    search !== "" ||
    categorySlug !== null ||
    seriesStatus !== null ||
    sort !== "TITLE_ASC";

  const readingNow =
    library.find(
      (item) =>
        item.status === "READING",
    ) ?? null;

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

  const libraryByComicId =
    new Map(
      library.map(
        (item) =>
          [
            item.comicId,
            {
              status: item.status,
              chapterReading: { registered: item.chapterReading.registered },
              currentChapter:
                item.currentChapter,
            },
          ] as const,
      ),
    );

  let progressPercent: number | null =
    null;

  if (
    readingNow &&
    readingNow.progressCeiling !== null &&
    readingNow.progressCeiling > 0
  ) {
    progressPercent = Math.min(
      100,
      Math.round(
        (
          readingNow.currentChapter /
          readingNow.progressCeiling
        ) * 100,
      ),
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-10">
        <p className="mb-2 text-sm text-[var(--text-secondary)]">
          Добро пожаловать
        </p>

        <h1 className="text-3xl font-bold">
          Мой читательский дневник
        </h1>
      </header>

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Читаю сейчас
          </h2>

          <Link
            href="/library"
            className="text-sm font-semibold text-[var(--primary)]"
          >
            Вся библиотека →
          </Link>
        </div>

        {readingNow ? (
          <article className="max-w-xl rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
            <p className="mb-1 text-sm font-medium text-[var(--primary)]">
              {readingNow.categoryName ??
                "Без категории"}
            </p>

            <h3 className="text-xl font-semibold">
              {readingNow.title}
            </h3>

            <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
              <span>
                {readingNow.chapterReading.registered ? "Прогресс:" : "Общий счётчик:"}{" "}
                <strong>
                  {readingNow.currentChapter}
                  {readingNow.progressCeiling ===
                  null
                    ? ""
                    : ` / ${readingNow.progressCeiling}`}
                </strong>
              </span>

              {progressPercent !== null ? (
                <span>
                  {progressPercent}%
                </span>
              ) : null}
            </div>

            {progressPercent !== null ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{
                    width:
                      `${progressPercent}%`,
                  }}
                />
              </div>
            ) : null}

            <Link
              href={`/comics/${readingNow.slug}`}
              className="mt-5 inline-flex rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              Продолжить
            </Link>
          </article>
        ) : (
          <article className="max-w-xl rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="font-semibold">
              Сейчас ничего не читаю
            </h3>

            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Выберите комикс из библиотеки или добавьте новый из каталога.
            </p>

            <Link
              href="/library"
              className="mt-4 inline-flex rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)]"
            >
              Открыть библиотеку
            </Link>
          </article>
        )}
      </section>

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Моя библиотека
          </h2>

          <p className="text-sm text-[var(--text-secondary)]">
            Всего: {library.length}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        </div>
      </section>

      <section
        id="catalog"
        className="mt-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Каталог
            </h2>

            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              В каталоге показываются только опубликованные комиксы.
            </p>
          </div>

          {hasCatalogFilters ? (
            <Link
              href="/#catalog"
              className="text-sm font-semibold text-[var(--primary)]"
            >
              Сбросить фильтры
            </Link>
          ) : null}
        </div>

        <form
          method="get"
          action="/#catalog"
          className="mt-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2 lg:grid-cols-4"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Поиск по названию
            </span>

            <input
              type="search"
              name="q"
              defaultValue={search}
              maxLength={120}
              placeholder="Например, Берсерк"
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Категория
            </span>

            <select
              name="category"
              defaultValue={
                categorySlug ??
                ""
              }
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
            >
              <option value="">
                Все категории
              </option>

              {categoryList.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.slug}
                  >
                    {category.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Сортировка
            </span>

            <select
              name="sort"
              defaultValue={sort}
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
            >
              {(
                Object.keys(
                  catalogSortLabels,
                ) as CatalogSort[]
              ).map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {
                      catalogSortLabels[
                        value
                      ]
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Статус выпуска</span>
            <select name="series" defaultValue={seriesStatus ?? ""}
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]">
              <option value="">Все статусы</option>
              {Object.entries(seriesStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <Button type="submit" className="min-h-11 md:self-end">
            Применить
          </Button>
        </form>

        {hasCatalogFilters ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Найдено опубликованных комиксов:{" "}
            <strong>
              {comicList.length}
            </strong>
          </p>
        ) : null}

        {comicList.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="font-semibold">
              {hasCatalogFilters
                ? "Ничего не найдено"
                : "Опубликованных комиксов пока нет"}
            </h3>

            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {hasCatalogFilters
                ? "Среди опубликованных комиксов нет совпадений по выбранным условиям."
                : "Скрытые и архивные записи не отображаются в публичном каталоге."}
            </p>

            {hasCatalogFilters ? (
              <Link
                href="/#catalog"
                className="mt-4 inline-flex rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)]"
              >
                Показать весь каталог
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {catalogWithProgress.map(
              ({ comic, progressCeiling }) => (
                <li
                  key={comic.id}
                  className="min-w-0"
                >
                  <ComicCard
                    comic={comic}
                    progressCeiling={progressCeiling}
                    personalState={
                      libraryByComicId.get(
                        comic.id,
                      ) ?? null
                    }
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
