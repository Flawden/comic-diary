import { comicListHref } from "@/modules/library/list-navigation";
import { isWorkType, isWorkFormat, workTypeLabels, workFormatLabels } from "@/modules/comics/work-metadata";
import { isSeriesStatus, seriesStatusLabels } from "@/modules/comics/series-status";
import Link from "next/link";
import { ResponsiveFilterPanel } from "@/shared/components/ResponsiveFilterPanel";

import { getChapterProgressCeiling } from "@/modules/comics/queries/get-chapter-progress-ceiling";
import { Button } from "@/shared/components/ui";

import { ComicCard } from "@/modules/comics/components/ComicCard";
import { CatalogEditorialRail } from "@/modules/comics/components/CatalogEditorialRail";
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
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUserLibrary } from "@/modules/library/queries/get-user-library";
import { getReadingUpdates, parseUpdatesOptions } from "@/modules/library/queries/get-reading-updates";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    sort?: string | string[];
    series?: string | string[];
    type?: string | string[];
    format?: string | string[];
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

  const rawType = firstQueryValue(resolvedSearchParams.type);
  const rawFormat = firstQueryValue(resolvedSearchParams.format);
  const workType = isWorkType(rawType) ? rawType : null;
  const workFormat = isWorkFormat(rawFormat) ? rawFormat : null;

  const currentUser =
    await getCurrentUser();

  const [
    categoryList,
    comicList,
    library,
    unreadSummary,
  ] = await Promise.all([
    getPublishedCatalogCategories(),
    getComics({
      search,
      categorySlug,
      sort,
      seriesStatus,
      workType,
      workFormat,
    }),
    currentUser
      ? getUserLibrary(
          currentUser.id,
        )
      : [],
    currentUser
      ? getReadingUpdates(currentUser.id, parseUpdatesOptions({ status: "ALL" }))
      : null,
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
    workType !== null ||
    workFormat !== null ||
    sort !== "TITLE_ASC";

  const readingNow =
    library.find(
      (item) =>
        item.status === "READING",
    ) ?? null;

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

  return (
    <div className="reader-page catalog-page">
      <div className="catalog-editorial-main">
      <header className="reader-heading catalog-hero">
        <div className="catalog-hero-copy">
          <span className="catalog-hero-emblem" aria-hidden="true" />
          <p className="reader-eyebrow">Чайная Белого Дракона · зал историй</p>
          <h1>Каталог произведений</h1>
          <p>Комиксы, манхвы, манги и другие истории, которые стоит открыть.</p>
        </div>
        <Link href="/library" className="tea-outline catalog-hero-library">
          Моя библиотека <span aria-hidden="true">→</span>
        </Link>
      </header>



      {readingNow ? (
        <Link
          href={comicListHref(readingNow.slug, "catalog", resolvedSearchParams)}
          className="reading-return catalog-reading-return"
        >
          <span>Вернуться к чтению</span>
          <strong>{readingNow.title}</strong>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}

      <section id="catalog" className="catalog-shelf" aria-label="Каталог комиксов">
        <div className="catalog-shelf-heading">
          <div>
            <p className="catalog-overline">На полках нашей чайной</p>
            <h2>Выберите историю по душе</h2>
          </div>
          <span className="catalog-shelf-seal" aria-hidden="true">✧</span>
        </div>
        <ResponsiveFilterPanel label="Поиск и фильтры" initiallyExpanded={hasCatalogFilters} className="catalog-mobile-filter-panel">
        <form
          method="get"
          action="/#catalog"
          className="catalog-filters"
        >
          <label className="block catalog-search-field">
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
          </label>          <label className="block catalog-sort-field">
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
          </label>          <Button type="submit" className="catalog-search-button">Найти</Button>
          <details className="catalog-more-filters" open={categorySlug !== null || seriesStatus !== null || workType !== null || workFormat !== null}>
            <summary>Фильтры <span>Категория, тип и статус выпуска</span></summary>
            <div className="catalog-filter-fields">
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
          </label>          <label className="block">
            <span className="mb-2 block text-sm font-medium">Статус выпуска</span>
            <select name="series" defaultValue={seriesStatus ?? ""}
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]">
              <option value="">Все статусы</option>
              {Object.entries(seriesStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>          <label className="block">
            <span className="mb-2 block text-sm font-medium">Тип произведения</span>
            <select name="type" defaultValue={workType ?? ""} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]">
              <option value="">Все типы</option>
              {Object.entries(workTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>          <label className="block">
            <span className="mb-2 block text-sm font-medium">Формат</span>
            <select name="format" defaultValue={workFormat ?? ""} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]">
              <option value="">Все форматы</option>
              {Object.entries(workFormatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>            </div>
          </details>

        </form>
        </ResponsiveFilterPanel>

        <div className="catalog-results-bar">
          <p className="catalog-results-count">
            <span aria-hidden="true">✧</span> Найдено произведений: <strong>{comicList.length}</strong>
          </p>
          {hasCatalogFilters ? (
            <Link href="/#catalog" className="reader-back catalog-reset-filters">
              Сбросить фильтры
            </Link>
          ) : null}
        </div>

        {comicList.length === 0 ? (
          <div className="catalog-empty-state">
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
          <ul className="catalog-grid">
            {catalogWithProgress.map(
              ({ comic, progressCeiling }) => (
                <li
                  key={comic.id}
                  className="min-w-0"
                >
                  <ComicCard
                    comic={comic}
                    href={comicListHref(comic.slug, "catalog", resolvedSearchParams)}
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
    <CatalogEditorialRail
      readingNow={readingNow ? {
        title: readingNow.title,
        href: comicListHref(readingNow.slug, "catalog", resolvedSearchParams),
      } : null}
      unreadTitles={unreadSummary?.total ?? null}
    />
  </div>
  );
}
