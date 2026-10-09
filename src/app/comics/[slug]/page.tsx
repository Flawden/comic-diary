import { TrackingControl } from "@/modules/library/components/TrackingControl";
import { ReadingStatusForm } from "@/modules/library/components/ReadingStatusForm";
import { completionSnapshot } from "@/modules/library/completion-model";
import { ChapterReadingPanel } from "@/modules/library/components/ChapterReadingPanel";
import { Button } from "@/shared/components/ui";
import { notFound } from "next/navigation";

import { getChapterProgressCeiling } from "@/modules/comics/queries/get-chapter-progress-ceiling";
import { CoverImage } from "@/shared/components/media";

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

  const progressCeiling =
    readingState
      ? readingState.progressCeiling
      : await getChapterProgressCeiling(comic.id);

  const averageRating = readingState
    ? calculateAverageRating(
        readingState,
      )
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="grid md:grid-cols-[280px_1fr]">
          <CoverImage
            src={comic.coverUrl}
            alt={`Обложка ${comic.title}`}
            className="aspect-[3/4] mx-auto w-40 self-start md:mx-0 md:w-full"
          />

          <div className="min-w-0 p-4 sm:p-6 md:p-8">
            <p className="text-sm font-medium text-[var(--primary)]">
              {comic.categoryName ?? "Без категории"}
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              {comic.title}
            </h1>

            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Основных глав доступно: {chapters.filter((c) => c.status === "RELEASED" && c.kind === "MAIN").length}
              {comic.totalChapters !== null ? ` · Заявлено (справочно): ${comic.totalChapters}` : ""}
            </p>

            {comic.visibility === "PRIVATE" ? (
              <p className="mt-4 inline-flex rounded-full border border-[var(--primary)]/30 bg-[var(--background)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                Личный тайтл
              </p>
            ) : null}

            {comic.publicationStatus !== "PUBLISHED" ? (
              <p className="mt-4 inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                {comic.publicationStatus === "HIDDEN"
                  ? "Скрыт из публичного каталога"
                  : "Архивный комикс"}
              </p>
            ) : null}

            {comic.authorName || comic.translatorName ? (
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                {comic.authorName ? (
                  <div className="rounded-xl bg-[var(--background)] p-4">
                    <dt className="text-[var(--text-secondary)]">
                      Автор
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {comic.authorName}
                    </dd>
                  </div>
                ) : null}

                {comic.translatorName ? (
                  <div className="rounded-xl bg-[var(--background)] p-4">
                    <dt className="text-[var(--text-secondary)]">
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
              <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
                <h2 className="font-semibold">
                  Примечание переводчика
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                  {comic.translatorNote}
                </p>
              </section>
            ) : null}

            {comic.description ? (
              <p className="mt-6 max-w-2xl leading-7 text-[var(--text-secondary)]">
                {comic.description}
              </p>
            ) : (
              <p className="mt-6 text-[var(--text-secondary)]">
                Описание пока не добавлено.
              </p>
            )}

            <ChapterReadingPanel
              comicId={comic.id}
              chapters={(readingState?.chapterReading.registry ?? chapters)
                .filter((c) => c.status === "RELEASED" || (c.status === "ARCHIVED" && readingState?.chapterReading.readIds.includes(c.id)))
                .map((c) => ({ id: c.id, displayCode: c.displayCode, title: c.title, sourceUrl: c.sourceUrl, sortOrder: c.sortOrder, status: c.status, kind: c.kind, supersedesChapterId: c.supersedesChapterId }))}
              readIds={readingState?.chapterReading.readIds ?? []}
              canMark={readingState !== null}
            />

            <section className="mt-8 rounded-xl bg-[var(--background)] p-5">
              <h2 className="font-semibold">
                Моя библиотека
              </h2>

              {readingState ? (
                <div className="mt-4 space-y-5">
                  <ReadingStatusForm key={`${comic.id}:${readingState.status}:${readingState.currentChapter}:${readingState.chapterReading.specialReadCount}`}
                    comicId={comic.id} status={readingState.status}
                    registered={readingState.chapterReading.registered} legacyTotal={comic.totalChapters}
                    unreadMain={readingState.chapterReading.unreadChapters}
                    unreadSpecial={readingState.chapterReading.specialCount - readingState.chapterReading.specialReadCount}
                    snapshot={completionSnapshot(readingState.chapterReading.registry, comic.totalChapters)} />

                  <div>
                    <h3 className="font-semibold">Мой прогресс</h3>
                    <p className="mt-2 text-lg font-semibold">{!readingState.chapterReading.registered ? "Общий счётчик: " : ""}{readingState.currentChapter}{progressCeiling === null ? "" : ` / ${progressCeiling}`}</p>
                    {readingState.unresolvedLegacyProgress ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Ранее сохранён общий счётчик: {readingState.unresolvedLegacyProgress}. Появился список глав — выберите «Прочитано до», чтобы связать чтение с конкретными главами.</p> : null}
                    {readingState.chapterReading.registered ? (
                      <div className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                        {readingState.chapterReading.lastReadLabel ? <p>Последняя отмеченная: {readingState.chapterReading.lastReadLabel}</p> : null}
                        <p>{readingState.chapterReading.caughtUp ? "Все вышедшие основные главы прочитаны" : `Непрочитанных основных глав: ${readingState.chapterReading.unreadChapters}`}</p>
                        {readingState.chapterReading.updatedChapters ? <p>Непрочитанных новых редакций: {readingState.chapterReading.updatedChapters}</p> : null}
                        {readingState.chapterReading.specialCount ? <p>Спешиалы: {readingState.chapterReading.specialReadCount} / {readingState.chapterReading.specialCount}</p> : null}
                        <p>Отмечайте чтение в списке глав выше. Статус «Прочитано» выбирается отдельно.</p>
                      </div>
                    ) : (
                      <form action="/api/library/reading-state" method="post" className="mt-3">
                        <input type="hidden" name="comicId" value={comic.id} />
                        <input type="hidden" name="intent" value="set-legacy-progress" />
                        <label className="block text-sm">Общий счётчик без привязки к главам
                          <input type="number" name="count" min={0} max={progressCeiling ?? 2147483647} required defaultValue={readingState.currentChapter} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" />
                        </label>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">Список глав пока не заполнен. Можно сохранить общий счётчик; он не определяет конкретные главы или редакции.</p>
                        <Button type="submit" className="mt-3">Сохранить прогресс</Button>
                      </form>
                    )}
                  </div>
                  <form
                    action="/api/library/reading-state"
                    method="post"
                    className="border-t border-[var(--border)] pt-5"
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

                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
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
                        <p className="text-sm text-[var(--text-secondary)]">
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
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
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
                        className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 leading-6"
                      />
                    </label>

                    <button
                      type="submit"
                      className="mt-4 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]"
                    >
                      Сохранить оценку и заметку
                    </button>
                  </form>

                  <TrackingControl comicId={comic.id} enabled={readingState.trackingEnabled} />
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-[var(--text-secondary)]">
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
                      className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]"
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
              <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] p-5">
                <h2 className="font-semibold">
                  Метаданные личного тайтла
                </h2>

                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
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
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      placeholder="Неизвестно"
                    />

                    <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
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
                className="inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
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

                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
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
    </div>
  );
}
