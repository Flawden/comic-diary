import Link from "next/link";

import { DEV_USER_EMAIL } from "@/modules/library/dev-user";
import { getUserLibrary } from "@/modules/library/queries/get-user-library";

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

export default async function LibraryPage({
  searchParams,
}: LibraryPageProps) {
  const [
    library,
    resolvedSearchParams,
  ] = await Promise.all([
    getUserLibrary(DEV_USER_EMAIL),
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

  const filteredLibrary =
    activeFilter === "ALL"
      ? library
      : library.filter(
          (item) =>
            item.status ===
            activeFilter,
        );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
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
        />

        <LibraryStat
          label="Читаю"
          value={readingCount}
        />

        <LibraryStat
          label="Хочу прочитать"
          value={wantToReadCount}
        />

        <LibraryStat
          label="Прочитано"
          value={completedCount}
        />

        <LibraryStat
          label="Отложено"
          value={onHoldCount}
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
              filter === "ALL"
                ? "/library"
                : `/library?status=${filter}`;

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
            href="/library"
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

function LibraryStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-[var(--surface)] p-4 shadow-sm">
      <p className="text-2xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-xs text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}
