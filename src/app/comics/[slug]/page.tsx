import { listReturn } from "@/modules/library/list-navigation";
import { getReadingTarget } from "@/modules/library/reading-target";
import { WorkTabs, WorkPreferences, PromptSwitch, ShelfAction, DiaryForm } from "@/modules/library/components/WorkControls";
import Link from "next/link";
import { DiaryRatingFields } from "@/modules/library/components/DiaryRatingFields";
import { workTypeLabels, workFormatLabels } from "@/modules/comics/work-metadata";
import { WorkMetadataFields } from "@/modules/comics/components/WorkMetadataFields";
import { seriesStatusLabels, caughtUpLabel } from "@/modules/comics/series-status";
import { TrackingControl } from "@/modules/library/components/TrackingControl";
import { ReadingStatusForm } from "@/modules/library/components/ReadingStatusForm";
import { completionSnapshot } from "@/modules/library/completion-model";
import { chapterRatingSummary } from "@/modules/library/chapter-rating-summary";
import { ChapterReadingPanel } from "@/modules/library/components/ChapterReadingPanel";
import { Button } from "@/shared/components/ui";
import { notFound } from "next/navigation";

import { getChapterProgressCeiling } from "@/modules/comics/queries/get-chapter-progress-ceiling";
import { CoverImage } from "@/shared/components/media";

import { getComicBySlug } from "@/modules/comics/queries/get-comic-by-slug";
import { getComicChapters } from "@/modules/comics/queries/get-comic-chapters";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUserComicState } from "@/modules/library/queries/get-user-comic-state";

function StoryExcerpt({ heading, text }: { heading: string; text: string | null }) {
  if (!text?.trim()) return null;
  const full = text.trim();
  const chars = Array.from(full);
  const intro = chars.slice(0, 125).join("").replace(/\s+/g, " ").trimEnd();
  return <section className="mt-4"><h2 className="font-semibold">{heading}</h2>
    {chars.length <= 125 ? <p className="whitespace-pre-wrap">{full}</p> :
      <details className="story-excerpt">
        <summary><span className="excerpt-short">{intro}… <b>Ещё</b></span><b className="excerpt-close">Свернуть</b></summary>
        <p className="whitespace-pre-wrap">{full}</p>
      </details>}
  </section>;
}

export const dynamic = "force-dynamic";

type ComicPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{
    slug: string;
  }>;
};

export default async function ComicPage({
  params, searchParams,
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

  const back = listReturn(await searchParams, comic.id);

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



  const registry=readingState?.chapterReading.registry ?? chapters;
  const readIds=readingState?.chapterReading.readIds ?? [];
  const target=getReadingTarget(registry,readIds,comic.sourceUrl);
  const total=chapters.filter(c=>c.status==="RELEASED" && c.kind==="MAIN").length;
  const continuing=(readingState?.chapterReading.currentChapter ?? 0)>0;
  const c=target.chapter;
  const caption=target.direct && c ? (continuing?"Продолжить":"Читать")+(c.displayCode?" · глава "+c.displayCode:"") : target.source?.label;
  return <WorkPreferences key={comic.id} comicId={comic.id} initial={readingState?.promptChapterRating ?? true}>
    <article className="wd-work">
      <Link href={back.href} className="reader-back">← {back.label}</Link>
      <header className="wd-hero">
        <CoverImage src={comic.coverUrl} alt={`Обложка: ${comic.title}`} className="wd-cover" imageClassName="object-contain" fallback={comic.title}/>
        <div className="wd-identity"><p>{comic.categoryName}</p><h1>{comic.title}</h1>
          <span>{[comic.workType!=="UNKNOWN" && workTypeLabels[comic.workType],new Intl.NumberFormat("ru").format(total)+" "+({one:"глава",few:"главы",many:"глав"}[new Intl.PluralRules("ru").select(total) as "one"|"few"|"many"]??"глав")].filter(Boolean).join(" · ")}</span>
          {comic.seriesStatus!=="UNKNOWN" && <small>● {seriesStatusLabels[comic.seriesStatus]}</small>}
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


        </div>
      </header>
      {target.source ? <a className="wd-read" href={target.source.href} target="_blank" rel="noopener noreferrer"><strong>{caption} ↗</strong>{c && target.direct && c.title && <span>{c.title}</span>}</a>:<a href="#chapters" className="wd-read">К главам ↓</a>}
      {c && !target.direct && <p className="wd-hint">Прямой ссылки на главу пока нет.{target.source?" Откроется общий источник истории.":""}</p>}
      {target.state==="CAUGHT_UP" && <p className="wd-hint">Все вышедшие основные главы прочитаны.</p>}
      <div className="wd-shelf"><ShelfAction comicId={comic.id} member={!!readingState} login={currentUser?null:`/login?next=${encodeURIComponent("/comics/"+comic.slug)}`}/></div>
      <WorkTabs count={total} chapters={
            <ChapterReadingPanel
              comicId={comic.id}
              chapters={(readingState?.chapterReading.registry ?? chapters)
                .filter((c) => c.status === "RELEASED" || (c.status === "ARCHIVED" && readingState?.chapterReading.readIds.includes(c.id)))
                .map((c) => ({ id: c.id, displayCode: c.displayCode, title: c.title, sourceUrl: c.sourceUrl, sortOrder: c.sortOrder, status: c.status, kind: c.kind, supersedesChapterId: c.supersedesChapterId, expectedRelease: c.expectedRelease }))}
              ratings={readingState?.chapterReading.ratings ?? {}}
              readIds={readingState?.chapterReading.readIds ?? []}
              canMark={readingState !== null}
            />
      } about={<div className="wd-about">
        <StoryExcerpt heading="Описание" text={comic.description}/>
        <StoryExcerpt heading="Примечание переводчика" text={comic.translatorNote}/>
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


        {comic.workFormat!=="UNKNOWN" && <p>Формат: {workFormatLabels[comic.workFormat]}</p>}
        {comic.totalChapters!==null && <p>Заявлено глав: {comic.totalChapters}</p>}
        {!comic.description && !comic.translatorNote && !comic.authorName && !comic.translatorName && <p>Подробности об истории пока не добавлены.</p>}
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

      </div>} diary={
            <section className="wd-diary work-diary">
              <h2 className="font-semibold">
                Мой дневник
              </h2>

              {readingState ? (
                <div className="wd-dashboard">
                  <details className="wd-edit"><summary>Статус <b>{{WANT_TO_READ:"Хочу прочитать",READING:"Читаю",COMPLETED:"Прочитано",ON_HOLD:"На паузе"}[readingState.status]} ⌄</b></summary>
                  <ReadingStatusForm key={`${comic.id}:${comic.seriesStatus}:${readingState.status}:${readingState.currentChapter}:${readingState.chapterReading.specialReadCount}`}
                    comicId={comic.id} status={readingState.status}
                    registered={readingState.chapterReading.registered} seriesStatus={comic.seriesStatus}
                    completionBlocked={readingState.chapterReading.registered && (readingState.chapterReading.registry.some(c => c.kind === "MAIN" && c.status === "SCHEDULED") || !readingState.chapterReading.registry.some(c => c.kind === "MAIN" && c.status === "RELEASED"))}
                    unreadMain={readingState.chapterReading.unreadChapters}
                    unreadSpecial={readingState.chapterReading.specialCount - readingState.chapterReading.specialReadCount}
                    snapshot={completionSnapshot(readingState.chapterReading.registry, comic.totalChapters, comic.seriesStatus)} /></details>

                  <div className="reading-progress-v5">
                    <div className="wd-progress"><span>Прочитано: {readingState.currentChapter}{progressCeiling===null?"":" из "+progressCeiling}</span>
                      {progressCeiling!==null && progressCeiling>0 && <progress aria-label="Мой прогресс" max={progressCeiling} value={readingState.currentChapter}/>}</div>
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
                            <p>Отмечайте чтение на вкладке «Главы». Статус «Прочитано» выбирается отдельно.</p>
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
                  <DiaryForm comicId={comic.id}>
                    <DiaryRatingFields key={JSON.stringify([comic.id, readingState.ratingPlot, readingState.ratingCharacters, readingState.ratingArt, readingState.ratingDepth, readingState.ratingWorld, readingState.personalNote])} ratings={readingState} personalNote={readingState.personalNote ?? ""} />
                  </DiaryForm>

                  {(["MAIN", "SPECIAL"] as const).map(kind => {
                    const { average, rated, read } = chapterRatingSummary(readingState.chapterReading, kind);
                    if (!rated) return null;
                    return <p key={kind} className="mt-1 text-sm">{kind === "MAIN" ? "Средняя по главам" : "По спецвыпускам"}: <strong>{average === null ? "Без оценки" : average.toLocaleString("ru", {minimumFractionDigits:1, maximumFractionDigits:1}) + " / 5"}</strong> · оценено {rated} из {read} прочитанных</p>;
                  })}
                  <PromptSwitch/>
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


      }/>
    </article>
  </WorkPreferences>;
}
