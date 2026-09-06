import Link from "next/link";

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
    }),
    currentUser
      ? getUserLibrary(
          currentUser.id,
        )
      : [],
  ]);

  const hasCatalogFilters =
    search !== "" ||
    categorySlug !== null ||
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
    readingNow.totalChapters !== null &&
    readingNow.totalChapters > 0
  ) {
    progressPercent = Math.min(
      100,
      Math.round(
        (
          readingNow.currentChapter /
          readingNow.totalChapters
        ) * 100,
      ),
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8">
      <header className="mb-10">
        <p className="mb-2 text-sm text-[var(--muted)]">
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
                Прогресс:{" "}
                <strong>
                  {readingNow.currentChapter}
                  {readingNow.totalChapters ===
                  null
                    ? ""
                    : ` / ${readingNow.totalChapters}`}
                </strong>
              </span>

              {progressPercent !== null ? (
                <span>
                  {progressPercent}%
                </span>
              ) : null}
            </div>

            {progressPercent !== null ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
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

            <p className="mt-2 text-sm text-[var(--muted)]">
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

          <p className="text-sm text-[var(--muted)]">
            Всего: {library.length}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

            <p className="mt-1 text-sm text-[var(--muted)]">
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
          action="/"
          className="mt-5 grid gap-3 rounded-2xl border border-black/5 bg-[var(--surface)] p-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
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
              className="w-full rounded-xl border border-black/10 bg-[var(--background)] px-3 py-2 text-sm"
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
              className="w-full rounded-xl border border-black/10 bg-[var(--background)] px-3 py-2 text-sm"
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
              className="w-full rounded-xl border border-black/10 bg-[var(--background)] px-3 py-2 text-sm"
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

          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white md:self-end"
          >
            Применить
          </button>
        </form>

        {hasCatalogFilters ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Найдено опубликованных комиксов:{" "}
            <strong>
              {comicList.length}
            </strong>
          </p>
        ) : null}

        {comicList.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-black/5 bg-[var(--surface)] p-6">
            <h3 className="font-semibold">
              {hasCatalogFilters
                ? "Ничего не найдено"
                : "Опубликованных комиксов пока нет"}
            </h3>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
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
            {comicList.map(
              (comic) => (
                <li
                  key={comic.id}
                  className="min-w-0"
                >
                  <ComicCard
                    comic={comic}
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
    </main>
  );
}
