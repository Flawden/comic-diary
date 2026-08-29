import Link from "next/link";
import { notFound } from "next/navigation";

import { getComicBySlug } from "@/modules/comics/queries/get-comic-by-slug";
import { DEV_USER_EMAIL } from "@/modules/library/dev-user";
import { getUserComicState } from "@/modules/library/queries/get-user-comic-state";

export const dynamic = "force-dynamic";

type ComicPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const statusLabels = {
  WANT_TO_READ: "Хочу прочитать",
  READING: "Читаю",
  COMPLETED: "Прочитано",
  ON_HOLD: "Отложено",
} as const;

export default async function ComicPage({
  params,
}: ComicPageProps) {
  const { slug } = await params;

  const comic = await getComicBySlug(slug);

  if (!comic) {
    notFound();
  }

  const readingState =
    await getUserComicState(
      DEV_USER_EMAIL,
      comic.id,
    );

  const canDecreaseProgress =
    readingState !== null &&
    readingState.currentChapter > 0;

  const canIncreaseProgress =
    readingState !== null &&
    (
      comic.totalChapters === null ||
      readingState.currentChapter <
        comic.totalChapters
    );

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <Link
        href="/"
        className="text-sm font-medium text-[var(--primary)]"
      >
        ← Назад
      </Link>

      <article className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-[var(--surface)] shadow-sm">
        <div className="grid md:grid-cols-[280px_1fr]">
          <div className="aspect-[3/4] bg-[#e4e1d7] md:aspect-auto">
            {comic.coverUrl ? (
              <div
                role="img"
                aria-label={`Обложка ${comic.title}`}
                className="h-full min-h-96 bg-cover bg-center"
                style={{
                  backgroundImage: `url("${comic.coverUrl}")`,
                }}
              />
            ) : (
              <div className="flex h-full min-h-96 items-center justify-center p-8 text-center text-[var(--muted)]">
                Обложка появится позже
              </div>
            )}
          </div>

          <div className="p-7 md:p-9">
            <p className="text-sm font-medium text-[var(--primary)]">
              {comic.categoryName ?? "Без категории"}
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              {comic.title}
            </h1>

            <p className="mt-3 text-sm text-[var(--muted)]">
              {comic.totalChapters === null
                ? "Количество глав пока не указано"
                : `Глав: ${comic.totalChapters}`}
            </p>

            {comic.description ? (
              <p className="mt-6 max-w-2xl leading-7 text-[var(--muted)]">
                {comic.description}
              </p>
            ) : (
              <p className="mt-6 text-[var(--muted)]">
                Описание пока не добавлено.
              </p>
            )}

            <section className="mt-8 rounded-xl bg-[var(--background)] p-5">
              <h2 className="font-semibold">
                Моя библиотека
              </h2>

              {readingState ? (
                <div className="mt-4 space-y-5">
                  <form
                    action="/api/library/reading-state"
                    method="post"
                    className="space-y-2"
                  >
                    <input
                      type="hidden"
                      name="comicId"
                      value={comic.id}
                    />

                    <input
                      type="hidden"
                      name="intent"
                      value="set-status"
                    />

                    <label
                      htmlFor="reading-status"
                      className="block text-sm font-medium"
                    >
                      Статус
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <select
                        id="reading-status"
                        name="status"
                        defaultValue={
                          readingState.status
                        }
                        className="rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2 text-sm"
                      >
                        {Object.entries(
                          statusLabels,
                        ).map(
                          ([value, label]) => (
                            <option
                              key={value}
                              value={value}
                            >
                              {label}
                            </option>
                          ),
                        )}
                      </select>

                      <button
                        type="submit"
                        className="rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)]"
                      >
                        Сохранить статус
                      </button>
                    </div>
                  </form>

                  <div>
                    <p className="text-sm font-medium">
                      Прогресс
                    </p>

                    <p className="mt-1 text-lg font-semibold">
                      {readingState.currentChapter}
                      {comic.totalChapters === null
                        ? ""
                        : ` / ${comic.totalChapters}`}
                    </p>

                    <div className="mt-3 flex gap-2">
                      <form
                        action="/api/library/reading-state"
                        method="post"
                      >
                        <input
                          type="hidden"
                          name="comicId"
                          value={comic.id}
                        />

                        <input
                          type="hidden"
                          name="intent"
                          value="change-progress"
                        />

                        <input
                          type="hidden"
                          name="delta"
                          value="-1"
                        />

                        <button
                          type="submit"
                          disabled={
                            !canDecreaseProgress
                          }
                          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          −1 глава
                        </button>
                      </form>

                      <form
                        action="/api/library/reading-state"
                        method="post"
                      >
                        <input
                          type="hidden"
                          name="comicId"
                          value={comic.id}
                        />

                        <input
                          type="hidden"
                          name="intent"
                          value="change-progress"
                        />

                        <input
                          type="hidden"
                          name="delta"
                          value="1"
                        />

                        <button
                          type="submit"
                          disabled={
                            !canIncreaseProgress
                          }
                          className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          +1 глава
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Комикс ещё не добавлен в библиотеку.
                </p>
              )}
            </section>

            <div className="mt-8">
              <a
                href={comic.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90"
              >
                Читать в VK
              </a>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
