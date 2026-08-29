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

  const readingState = await getUserComicState(
    DEV_USER_EMAIL,
    comic.id,
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
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    Статус:{" "}
                    <strong>
                      {statusLabels[readingState.status]}
                    </strong>
                  </p>

                  <p>
                    Прогресс:{" "}
                    <strong>
                      {readingState.currentChapter}
                      {comic.totalChapters === null
                        ? ""
                        : ` / ${comic.totalChapters}`}
                    </strong>
                  </p>
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
