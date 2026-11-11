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
import { calculateAverageRating } from "@/modules/library/ratings/calculate-average-rating";
import { chapterRatingSummary } from "@/modules/library/chapter-rating-summary";
import { ChapterReadingPanel } from "@/modules/library/components/ChapterReadingPanel";
import { Button } from "@/shared/components/ui";
import { notFound } from "next/navigation";

import { getChapterProgressCeiling } from "@/modules/comics/queries/get-chapter-progress-ceiling";
import { CoverImage } from "@/shared/components/media";

import { getComicBySlug } from "@/modules/comics/queries/get-comic-by-slug";
import { getComicChapters } from "@/modules/comics/queries/get-comic-chapters";
import { getComicVolumeTitles } from "@/modules/comics/queries/get-comic-volume-titles";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUserComicState } from "@/modules/library/queries/get-user-comic-state";

function StoryExcerpt({ heading, text }: { heading: string; text: string | null }) {
  if (!text?.trim()) return null;
  const full = text.trim();
  const chars = Array.from(full);
  const intro = chars.slice(0, 125).join("").replace(/\s+/g, " ").trimEnd();
  return <section className="wd-story-block"><h2>{heading}</h2>
    {chars.length <= 125 ? <p className="wd-story-text whitespace-pre-wrap">{full}</p> :
      <details className="story-excerpt">
        <summary><span className="excerpt-short">{intro}… <b>Ещё</b></span><b className="excerpt-close">Свернуть</b></summary>
        <p className="wd-story-text whitespace-pre-wrap">{full}</p>
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
        includeScheduled: true,
      },
    );

  const volumeTitles = await getComicVolumeTitles(comic.id);

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
  const savedRating = readingState ? calculateAverageRating(readingState) : null;
  const c=target.chapter;
  const caption=target.direct && c ? (continuing?"Продолжить":"Читать")+(c.displayCode?" · глава "+c.displayCode:"") : target.source?.label;
  const visibleChapters = registry.filter(
    (chapter) => chapter.status === "RELEASED" || chapter.status === "SCHEDULED" ||
      (chapter.status === "ARCHIVED" && readIds.includes(chapter.id)),
  );
  return <WorkPreferences key={comic.id} comicId={comic.id} initial={readingState?.promptChapterRating ?? true}>
    <article className="wd-work">
      <Link href={back.href} className="reader-back">← {back.label}</Link>
      <header className={`wd-hero${comic.bannerUrl ? " wd-hero--banner" : ""}`}
        style={comic.bannerUrl ? {
          backgroundImage: `url("${comic.bannerUrl}"), url("/art/reader-hills.svg")`,
        } : undefined}>
        <CoverImage src={comic.coverUrl} alt={`Обложка: ${comic.title}`} className="wd-cover" imageClassName="object-contain" fallback={comic.title}/>
        <div className="wd-identity">
          <p className="wd-hero-eyebrow">{comic.categoryName}</p>
          <h1>{comic.title}</h1>
          <span className="wd-hero-meta">{[comic.workType!=="UNKNOWN" && workTypeLabels[comic.workType],new Intl.NumberFormat("ru").format(total)+" "+({one:"глава",few:"главы",many:"глав"}[new Intl.PluralRules("ru").select(total) as "one"|"few"|"many"]??"глав")].filter(Boolean).join(" · ")}</span>
          <div className="wd-hero-badges">
            {comic.seriesStatus!=="UNKNOWN" && <small>● {seriesStatusLabels[comic.seriesStatus]}</small>}
            {comic.visibility === "PRIVATE" ? <small>Личный тайтл</small> : null}
            {comic.publicationStatus !== "PUBLISHED" ? (
              <small>{comic.publicationStatus === "HIDDEN" ? "Скрыт из публичного каталога" : "Архивный комикс"}</small>
            ) : null}
          </div>
          <div className="wd-hero-actions">
            {target.source ? <a className="wd-read" href={target.source.href} target="_blank" rel="noopener noreferrer"><strong>{caption} ↗</strong>{c && target.direct && c.title && <span>{c.title}</span>}</a>:<a href="#chapters" className="wd-read">К главам ↓</a>}
            <div className="wd-shelf"><ShelfAction comicId={comic.id} member={!!readingState?.inLibrary} hasDiary={readingState !== null} login={currentUser?null:`/login?next=${encodeURIComponent("/comics/"+comic.slug)}`}/></div>
          </div>
        </div>
      </header>
      {c && !target.direct && <p className="wd-hint">Прямой ссылки на главу пока нет.{target.source?" Откроется общий источник истории.":""}</p>}
      {target.state==="CAUGHT_UP" && <p className="wd-hint">Все вышедшие основные главы прочитаны.</p>}
      <WorkTabs count={total} chapters={
        <div className={`wd-chapter-content${visibleChapters.length === 0 ? " wd-chapter-content--empty" : ""}`}>
          {visibleChapters.length === 0 ? (
            <div className="wd-empty-state">
              <div className="wd-empty-chapter-art" aria-hidden="true">
                <svg viewBox="0 0 192 110" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="96" cy="49" r="46" fill="currentColor" opacity=".07"/>
                  <path d="M29 30c23-7 45-3 67 10 22-13 44-17 67-10v57c-25-4-47 0-67 13-20-13-44-17-67-13V30Z" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round"/>
                  <path d="M96 40v59M39 42c19-3 34 1 48 8M39 54c19-3 34 1 48 8M105 50c16-8 30-11 48-8M105 62c16-8 30-11 48-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".65"/>
                  <path d="M126 30v24l-8-6-8 6V31" fill="currentColor" opacity=".42"/>
                </svg>
              </div>
              <div className="wd-empty-state-copy">
                <p className="wd-empty-state-eyebrow">ЧИТАТЕЛЬСКИЙ ДНЕВНИК</p>
                <h2>В этом разделе пока нет глав</h2>
                <p>Когда главы появятся, здесь можно будет отмечать чтение и возвращаться к истории.</p>
              </div>
            </div>
          ) : null}
          <ChapterReadingPanel
            comicId={comic.id}
            readerId={currentUser?.id ?? null}
            chapters={visibleChapters.map((chapter) => ({ id: chapter.id, displayCode: chapter.displayCode, title: chapter.title, sourceUrl: chapter.status === "RELEASED" ? chapter.sourceUrl : null, sortOrder: chapter.sortOrder, volumeNumber: chapter.volumeNumber, status: chapter.status, kind: chapter.kind, supersedesChapterId: chapter.supersedesChapterId, expectedRelease: chapter.expectedRelease }))}
            ratings={readingState?.chapterReading.ratings ?? {}}
            readIds={readingState?.chapterReading.readIds ?? []}
            canMark={readingState?.inLibrary === true}
            volumeTitles={volumeTitles}
          />
        </div>
      } about={<div className="wd-about wd-about-editorial">
        <header className="wd-section-intro">
          <p className="wd-section-kicker">ЛЕТОПИСЬ ПРОИЗВЕДЕНИЯ</p>
          <h2>История и её создатели</h2>
          <p>Описание, заметки переводчика и сведения о произведении.</p>
        </header>
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


        {(comic.workFormat !== "UNKNOWN" || comic.totalChapters !== null) && (
          <dl className="wd-about-facts">
            {comic.workFormat !== "UNKNOWN" && <div><dt>Формат</dt><dd>{workFormatLabels[comic.workFormat]}</dd></div>}
            {comic.totalChapters !== null && <div><dt>Заявлено глав</dt><dd>{comic.totalChapters}</dd></div>}
          </dl>
        )}
        {!comic.description && !comic.translatorNote && !comic.authorName && !comic.translatorName && <p className="wd-about-placeholder">Подробности об истории пока не добавлены.</p>}
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
                      defaultValue={comic.sourceUrl ?? ""}
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
              <header className="wd-section-intro wd-section-intro--diary">
                <p className="wd-section-kicker">ЛИЧНАЯ БИБЛИОТЕКА</p>
                <h2>Дневник читателя</h2>
                <p>Ваш прогресс чтения, впечатления и заметки об этой истории.</p>
              </header>

              {readingState?.inLibrary ? (
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
                  <div className="wd-diary-prompt-card"><PromptSwitch/></div>
                  <details className="journal-editor"><summary>Обновления <span>{!readingState.inLibrary ? "При возврате" : readingState.trackingEnabled ? "Включены" : "Выключены"}</span></summary><TrackingControl comicId={comic.id} enabled={readingState.trackingEnabled} inLibrary={readingState.inLibrary} /></details>
                </div>
              ) : readingState ? (
                <div className="wd-dashboard wd-diary-return-note" role="status">
                  <p className="font-semibold">Комикс сейчас не в вашей библиотеке</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Прежний дневник сохранён, но произведение больше не считается активным чтением.
                    Чтобы продолжить, нажмите «Вернуть в библиотеку» выше.
                  </p>
                  <p className="text-sm">Ранее сохранённый статус: <strong>{{WANT_TO_READ:"Хочу прочитать",READING:"Читаю",COMPLETED:"Прочитано",ON_HOLD:"На паузе"}[readingState.status]}</strong></p>
                  <p className="text-sm">Сохранённый прогресс: {readingState.currentChapter}{readingState.progressCeiling === null ? "" : ` из ${readingState.progressCeiling}`}</p>
                  {savedRating !== null ? <p className="text-sm">Личная оценка: {savedRating.toFixed(1)} / 5</p> : null}
                  {readingState.personalNote?.trim() ? <blockquote className="whitespace-pre-wrap border-l-2 border-[var(--border)] pl-3 text-sm">{readingState.personalNote}</blockquote> : null}
                </div>
              ) : !currentUser ? (
                <div className="wd-diary-gate">
                  <p>Войдите, чтобы сохранять личные впечатления, оценки и историю чтения.</p>
                  <Link className="tea-primary" href={`/login?next=${encodeURIComponent(`/comics/${comic.slug}`)}`}>Войти и вести дневник</Link>
                </div>
              ) : (
                <div className="wd-diary-gate">
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
