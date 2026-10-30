import Link from "next/link";
import { DiaryRatingFields } from "@/modules/library/components/DiaryRatingFields";
import { workTypeLabels, workFormatLabels } from "@/modules/comics/work-metadata";
import { WorkMetadataFields } from "@/modules/comics/components/WorkMetadataFields";
import { seriesStatusLabels, caughtUpLabel } from "@/modules/comics/series-status";
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

export const dynamic = "force-dynamic";

type ComicPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

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



  return (
    <div className="reader-page work-page">
      <Link href="/" className="reader-back">← Каталог</Link>
      <article>
        <header className="work-hero work-hero-v6">
          <CoverImage src={comic.coverUrl} alt={`Обложка ${comic.title}`} className="work-cover" imageClassName="object-contain" fallback={comic.title} />
          <div className="work-intro">
            <div className="work-identity">
            <p className="text-sm font-medium text-[var(--primary)]">
              {comic.categoryName}
            </p>

            <h1 className="reader-title">
              {comic.title}
            </h1>
            <p className="work-count-v6">
              Основных глав: {chapters.filter((c) => c.status === "RELEASED" && c.kind === "MAIN").length}
              {comic.totalChapters !== null ? ` · Заявлено (справочно): ${comic.totalChapters}` : ""}
            </p>
            {comic.seriesStatus !== "UNKNOWN" ? <p className="work-state-v6">{seriesStatusLabels[comic.seriesStatus]}</p> : null}
            {comic.workType !== "UNKNOWN" || comic.workFormat !== "UNKNOWN" ? <p className="work-metadata-v6">{[comic.workType !== "UNKNOWN" ? workTypeLabels[comic.workType] : null, comic.workFormat !== "UNKNOWN" ? workFormatLabels[comic.workFormat] : null].filter(Boolean).join(" · ")}</p> : null}
            </div>



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
              <details className="work-credit-details"><summary>Автор и перевод</summary><dl className="work-credits">
                {comic.authorName ? (
                  <div className="min-w-0">
                    <dt className="text-[var(--text-secondary)]">
                      Автор
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {comic.authorName}
                    </dd>
                  </div>
                ) : null}

                {comic.translatorName ? (
                  <div className="min-w-0">
                    <dt className="text-[var(--text-secondary)]">
                      Перевод
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {comic.translatorName}
                    </dd>
                  </div>
                ) : null}
              </dl></details>
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




            {comic.description ? <details className="work-description">
              <summary>Об истории</summary>
              <p>{comic.description}</p>
            </details> : null}
            <div className="work-actions">
              <a href={comic.sourceUrl} target="_blank" rel="noopener noreferrer" className="tea-primary">Читать в источнике ↗</a>
              <a href="#chapters" className="tea-outline">К списку глав ↓</a>
              <a href="#my-reading" className="tea-text-action">Мой дневник</a>
            </div>
          </div>
        </header>
            <section id="my-reading" className="reader-panel work-diary">
              <h2 className="font-semibold">
                Мой дневник
              </h2>

              {readingState ? (
                <div className="reading-dashboard">
                  <ReadingStatusForm key={`${comic.id}:${comic.seriesStatus}:${readingState.status}:${readingState.currentChapter}:${readingState.chapterReading.specialReadCount}`}
                    comicId={comic.id} status={readingState.status}
                    registered={readingState.chapterReading.registered} seriesStatus={comic.seriesStatus}
                    completionBlocked={readingState.chapterReading.registered && (readingState.chapterReading.registry.some(c => c.kind === "MAIN" && c.status === "SCHEDULED") || !readingState.chapterReading.registry.some(c => c.kind === "MAIN" && c.status === "RELEASED"))}
                    unreadMain={readingState.chapterReading.unreadChapters}
                    unreadSpecial={readingState.chapterReading.specialCount - readingState.chapterReading.specialReadCount}
                    snapshot={completionSnapshot(readingState.chapterReading.registry, comic.totalChapters, comic.seriesStatus)} />

                  <div className="reading-progress-v5">
                    <h3 className="font-semibold">Мой прогресс</h3>
                    <p className="mt-2 text-lg font-semibold">{!readingState.chapterReading.registered ? "Общий счётчик: " : ""}{readingState.currentChapter}{progressCeiling === null ? "" : ` / ${progressCeiling}`}</p>
                    {readingState.unresolvedLegacyProgress ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Ранее сохранён общий счётчик: {readingState.unresolvedLegacyProgress}. Появился список глав — выберите «Прочитано до», чтобы связать чтение с конкретными главами.</p> : null}
                    {readingState.chapterReading.registered ? (
                      <div className="mt-2 text-sm text-[var(--text-secondary)]">
                        <p>{readingState.chapterReading.caughtUp ? caughtUpLabel(comic.seriesStatus) : `Непрочитанных основных глав: ${readingState.chapterReading.unreadChapters}`}</p>
                        <details className="reading-help-v5">
                          <summary>Подробнее о прогрессе{readingState.chapterReading.updatedChapters ? ` · Новых редакций: ${readingState.chapterReading.updatedChapters}` : ""}</summary>
                          <div className="space-y-2">
                            {readingState.chapterReading.lastReadLabel ? <p>Последняя отмеченная: {readingState.chapterReading.lastReadLabel}</p> : null}
                            {readingState.chapterReading.updatedChapters ? <p>Непрочитанных новых редакций: {readingState.chapterReading.updatedChapters}</p> : null}
                            {readingState.chapterReading.specialCount ? <p>Спецвыпуски: {readingState.chapterReading.specialReadCount} / {readingState.chapterReading.specialCount}</p> : null}
                            <p>Отмечайте чтение в списке глав ниже. Статус «Прочитано» выбирается отдельно.</p>
                          </div>
                        </details>
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
                  <details className="journal-editor" open>
                    <summary>Оценки и личная заметка </summary>
                  <form
                    action="/api/library/reading-state"
                    method="post"
                    className="journal-form"
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

                    <p className="journal-hint-v4">Оцените любые критерии — средний балл посчитаем по заполненным.</p>
                    <DiaryRatingFields key={JSON.stringify([comic.id, readingState.ratingPlot, readingState.ratingCharacters, readingState.ratingArt, readingState.ratingDepth, readingState.ratingWorld, readingState.personalNote])} ratings={readingState} personalNote={readingState.personalNote ?? ""} />
                  </form>
                  </details>

                  <details className="journal-editor"><summary>Обновления <span>{readingState.trackingEnabled ? "Включены" : "Выключены"}</span></summary><TrackingControl comicId={comic.id} enabled={readingState.trackingEnabled} /></details>
                </div>
              ) : !currentUser ? (
                <p className="mt-4"><Link className="tea-primary" href={`/login?next=${encodeURIComponent(`/comics/${comic.slug}`)}`}>Войти и вести дневник</Link></p>
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

        <div id="chapters" className="reader-panel work-chapters">
            <ChapterReadingPanel
              comicId={comic.id}
              chapters={(readingState?.chapterReading.registry ?? chapters)
                .filter((c) => c.status === "RELEASED" || (c.status === "ARCHIVED" && readingState?.chapterReading.readIds.includes(c.id)))
                .map((c) => ({ id: c.id, displayCode: c.displayCode, title: c.title, sourceUrl: c.sourceUrl, sortOrder: c.sortOrder, status: c.status, kind: c.kind, supersedesChapterId: c.supersedesChapterId }))}
              readIds={readingState?.chapterReading.readIds ?? []}
              canMark={readingState !== null}
            />

        </div>
            {comic.visibility ===
              "PRIVATE" &&
            currentUser?.id ===
              comic.ownerUserId ? (
              <details className="reader-panel private-settings"><summary>Настройки личного произведения</summary>
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

                  <WorkMetadataFields workType={comic.workType} workFormat={comic.workFormat} />
<label className="block">
                  <span className="mb-1 block text-sm font-medium">Статус выпуска</span>
                  <select name="seriesStatus" defaultValue={comic.seriesStatus} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
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
              </details>
            ) : null}

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
      </article>
    </div>
  );
}
