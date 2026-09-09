import { notFound } from "next/navigation";

import { getComicBySlug } from "@/modules/comics/queries/get-comic-by-slug";
import { getComicChapters } from "@/modules/comics/queries/get-comic-chapters";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUserComicState } from "@/modules/library/queries/get-user-comic-state";
import { calculateAverageRating } from "@/modules/library/ratings/calculate-average-rating";

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

const chapterStatusLabels = {
  SCHEDULED: "Запланирована",
  RELEASED: "Опубликована",
  ARCHIVED: "В архиве",
} as const;

const ratingFields = [
  {
    name: "ratingPlot",
    label: "Сюжет",
  },
  {
    name: "ratingCharacters",
    label: "Персонажи",
  },
  {
    name: "ratingArt",
    label: "Рисовка",
  },
  {
    name: "ratingDepth",
    label: "Глубина",
  },
  {
    name: "ratingWorld",
    label: "Мир",
  },
] as const;

export default async function ComicPage({
  params,
}: ComicPageProps) {
  const { slug } = await params;

  const currentUser =
    await getCurrentUser();

  const comic =
    await getComicBySlug(
      slug,
      currentUser?.id ?? null,
    );

  if (!comic) {
    notFound();
  }

  const canSeeUnreleasedChapters =
    comic.visibility === "PRIVATE" &&
    currentUser?.id === comic.ownerUserId;

  const chapters =
    await getComicChapters(
      comic.id,
      {
        includeUnreleased:
          canSeeUnreleasedChapters,
      },
    );

  const readingState =
    currentUser
      ? await getUserComicState(
          currentUser.id,
          comic.id,
        )
      : null;

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

  const averageRating = readingState
    ? calculateAverageRating(
        readingState,
      )
    : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <article className="overflow-hidden rounded-2xl border border-black/5 bg-[var(--surface)] shadow-sm">
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

            {comic.visibility === "PRIVATE" ? (
              <p className="mt-4 inline-flex rounded-full border border-[var(--primary)]/30 bg-[var(--background)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                Личный тайтл
              </p>
            ) : null}

            {comic.publicationStatus !== "PUBLISHED" ? (
              <p className="mt-4 inline-flex rounded-full border border-black/10 bg-[var(--background)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                {comic.publicationStatus === "HIDDEN"
                  ? "Скрыт из публичного каталога"
                  : "Архивный комикс"}
              </p>
            ) : null}

            {comic.authorName || comic.translatorName ? (
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                {comic.authorName ? (
                  <div className="rounded-xl bg-[var(--background)] p-4">
                    <dt className="text-[var(--muted)]">
                      Автор
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {comic.authorName}
                    </dd>
                  </div>
                ) : null}

                {comic.translatorName ? (
                  <div className="rounded-xl bg-[var(--background)] p-4">
                    <dt className="text-[var(--muted)]">
                      Перевод
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {comic.translatorName}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {comic.translatorNote ? (
              <section className="mt-6 rounded-xl border border-black/5 bg-[var(--background)] p-5">
                <h2 className="font-semibold">
                  Примечание переводчика
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">
                  {comic.translatorNote}
                </p>
              </section>
            ) : null}

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
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">
                  Главы
                </h2>

                {chapters.length > 0 ? (
                  <span className="text-sm text-[var(--muted)]">
                    {chapters.length}
                  </span>
                ) : null}
              </div>

              {chapters.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {chapters.map((chapter) => (
                    <li
                      key={chapter.id}
                      className="rounded-xl border border-black/5 bg-[var(--surface)] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {chapter.displayCode}
                          </p>

                          {chapter.title ? (
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              {chapter.title}
                            </p>
                          ) : null}
                        </div>

                        {canSeeUnreleasedChapters ? (
                          <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                            {
                              chapterStatusLabels[
                                chapter.status
                              ]
                            }
                          </span>
                        ) : null}
                      </div>

                      {chapter.releasedAt ? (
                        <p className="mt-3 text-xs text-[var(--muted)]">
                          Опубликована{" "}
                          {chapter.releasedAt.toLocaleDateString(
                            "ru-RU",
                          )}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Главы пока не добавлены.
                </p>
              )}
            </section>

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

                  <form
                    action="/api/library/reading-state"
                    method="post"
                    className="border-t border-black/10 pt-5"
                  >
                    <input
                      type="hidden"
                      name="comicId"
                      value={comic.id}
                    />

                    <input
                      type="hidden"
                      name="intent"
                      value="update-diary"
                    />

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          Моя оценка
                        </h3>

                        <p className="mt-1 text-sm text-[var(--muted)]">
                          Можно оценить только те критерии, по которым уже есть мнение.
                        </p>
                      </div>

                      {averageRating !== null ? (
                        <p className="rounded-xl bg-[var(--surface)] px-3 py-2 text-sm">
                          Средняя оценка:{" "}
                          <strong>
                            {averageRating.toFixed(1)} / 5
                          </strong>
                        </p>
                      ) : (
                        <p className="text-sm text-[var(--muted)]">
                          Пока без средней оценки
                        </p>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {ratingFields.map(
                        (field) => (
                          <label
                            key={field.name}
                            htmlFor={field.name}
                            className="block text-sm"
                          >
                            <span className="mb-1 block font-medium">
                              {field.label}
                            </span>

                            <select
                              id={field.name}
                              name={field.name}
                              defaultValue={
                                readingState[
                                  field.name
                                ] ?? ""
                              }
                              className="w-full rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2"
                            >
                              <option value="">
                                Не оценено
                              </option>

                              {[1, 2, 3, 4, 5].map(
                                (value) => (
                                  <option
                                    key={value}
                                    value={value}
                                  >
                                    {value}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        ),
                      )}
                    </div>

                    <label
                      htmlFor="personal-note"
                      className="mt-4 block text-sm"
                    >
                      <span className="mb-1 block font-medium">
                        Личная заметка
                      </span>

                      <textarea
                        id="personal-note"
                        name="personalNote"
                        rows={5}
                        defaultValue={
                          readingState.personalNote ??
                          ""
                        }
                        placeholder="Мысли, впечатления, что хочется запомнить..."
                        className="w-full resize-y rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2 leading-6"
                      />
                    </label>

                    <button
                      type="submit"
                      className="mt-4 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Сохранить оценку и заметку
                    </button>
                  </form>

                  {comic.visibility !==
                  "PRIVATE" ? (
                    <form
                      action="/api/library/reading-state"
                      method="post"
                      className="border-t border-black/10 pt-5"
                    >
                      <input
                        type="hidden"
                        name="comicId"
                        value={comic.id}
                      />

                      <input
                        type="hidden"
                        name="intent"
                        value="remove-from-library"
                      />

                      <button
                        type="submit"
                        className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                      >
                        Удалить из библиотеки
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-[var(--muted)]">
                    Комикс ещё не добавлен в библиотеку.
                  </p>

                  <form
                    action="/api/library/reading-state"
                    method="post"
                    className="mt-4"
                  >
                    <input
                      type="hidden"
                      name="comicId"
                      value={comic.id}
                    />

                    <input
                      type="hidden"
                      name="intent"
                      value="add-to-library"
                    />

                    <button
                      type="submit"
                      className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Добавить в библиотеку
                    </button>
                  </form>
                </div>
              )}
            </section>

            {comic.visibility ===
              "PRIVATE" &&
            currentUser?.id ===
              comic.ownerUserId ? (
              <section className="mt-8 rounded-xl border border-black/10 bg-[var(--background)] p-5">
                <h2 className="font-semibold">
                  Метаданные личного тайтла
                </h2>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Название, ссылка и количество глав относятся только к вашему личному тайтлу. Его внутренний идентификатор не меняется.
                </p>

                <form
                  action="/api/library/private-titles"
                  method="post"
                  className="mt-4 grid gap-4 sm:grid-cols-2"
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="edit"
                  />

                  <input
                    type="hidden"
                    name="comicId"
                    value={comic.id}
                  />

                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-sm font-medium">
                      Название
                    </span>

                    <input
                      required
                      name="title"
                      maxLength={255}
                      defaultValue={comic.title}
                      className="w-full rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2"
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
                      defaultValue={comic.sourceUrl}
                      className="w-full rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Количество глав
                    </span>

                    <input
                      type="number"
                      name="totalChapters"
                      min={Math.max(
                        1,
                        readingState?.currentChapter ??
                          0,
                      )}
                      step={1}
                      defaultValue={
                        comic.totalChapters ??
                        ""
                      }
                      className="w-full rounded-xl border border-black/10 bg-[var(--surface)] px-3 py-2"
                      placeholder="Неизвестно"
                    />

                    <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                      Можно оставить пустым. Значение не может быть меньше уже сохранённого прогресса: {readingState?.currentChapter ?? 0}.
                    </span>
                  </label>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)]"
                    >
                      Сохранить метаданные
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <div className="mt-8">
              <a
                href={comic.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90"
              >
                {comic.visibility ===
                "PRIVATE"
                  ? "Открыть источник"
                  : "Читать в VK"}
              </a>
            </div>

            {comic.visibility ===
              "PRIVATE" &&
            currentUser?.id ===
              comic.ownerUserId ? (
              <form
                action="/api/library/private-titles"
                method="post"
                className="mt-6 rounded-xl border border-red-500/20 bg-[var(--background)] p-5"
              >
                <input
                  type="hidden"
                  name="intent"
                  value="delete"
                />

                <input
                  type="hidden"
                  name="comicId"
                  value={comic.id}
                />

                <h2 className="font-semibold">
                  Удалить личный тайтл
                </h2>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Тайтл и связанный читательский дневник будут удалены без влияния на общий каталог.
                </p>

                <button
                  type="submit"
                  className="mt-4 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold"
                >
                  Удалить личный тайтл
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </article>
    </main>
  );
}
