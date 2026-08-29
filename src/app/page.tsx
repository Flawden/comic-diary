import Link from "next/link";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { ComicCard } from "@/modules/comics/components/ComicCard";
import { getComics } from "@/modules/comics/queries/get-comics";
import { LibraryStat } from "@/modules/library/components/LibraryStat";
import { DEV_USER_EMAIL } from "@/modules/library/dev-user";
import { getUserLibrary } from "@/modules/library/queries/get-user-library";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [
    categoryList,
    comicList,
    library,
  ] = await Promise.all([
    db.select().from(categories),
    getComics(),
    getUserLibrary(DEV_USER_EMAIL),
  ]);

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

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">
          Каталог
        </h2>

        {comicList.length === 0 ? (
          <p className="text-[var(--muted)]">
            Комиксов пока нет
          </p>
        ) : (
          <ul className="space-y-3">
            {comicList.map((comic) => (
              <li key={comic.id}>
                <ComicCard
                  comic={comic}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">
          Категории
        </h2>

        {categoryList.length === 0 ? (
          <p className="text-[var(--muted)]">
            Категорий пока нет
          </p>
        ) : (
          <ul className="space-y-1">
            {categoryList.map(
              (category) => (
                <li key={category.id}>
                  {category.name}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
