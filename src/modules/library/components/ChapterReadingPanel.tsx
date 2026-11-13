"use client";

import { ChapterRating } from "./ChapterRating";
import { UnreadChapterConfirmation } from "./UnreadChapterConfirmation";
import { needsUnreadConfirmation } from "../needs-unread-confirmation";
import { PreviousChaptersPrompt } from "./PreviousChaptersPrompt";
import { unreadEarlierMainChapters } from "@/modules/library/chapter-reading-model";
import { usePromptPreference, writeReading } from "./WorkControls";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/shared/components/ui";
import type { ComicChapter } from "@/modules/comics/queries/get-comic-chapters";
import { formatExpectedRelease } from "@/modules/catalog/chapter-release-dates";
import { groupChaptersByVolume, volumeHeading, volumeProgress } from "@/modules/catalog/chapter-volumes";
import { getChapterReadingSource, readingSource } from "@/modules/library/reading-target";
import { useWorkChapterProgress } from "./WorkChapterProgress";

type Chapter = Omit<ComicChapter, "releasedAt">;
type Props = { comicId: number; readerId: number | null; chapters: Chapter[]; ratings: Record<number, number>; canMark: boolean; workSourceUrl: string | null; volumeTitles?: Record<number, string> };

export function ChapterReadingPanel({ comicId, readerId, chapters, ratings, canMark, workSourceUrl, volumeTitles = {} }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("MAIN");
  const [limit, setLimit] = useState(30);
  const [hideScheduled, setHideScheduled] = useState(false);
  const sharedSource = readingSource(workSourceUrl);
  const router=useRouter();
  const [pending,start]=useTransition();
  const lock=useRef(false);
  const {readIds: ids, showReadIds: show}=useWorkChapterProgress();
  const read=new Set(ids);
  const [sheet,setSheet]=useState<Chapter|null>(null);
  const [failure,setFailure]=useState<{chapter:Chapter;action:"read"|"unread"|"read-through"}|null>(null);
  const [confirmUnread,setConfirmUnread]=useState<Chapter|null>(null);
  const {enabled}=usePromptPreference();
  const [previousPrompt, setPreviousPrompt] = useState<{ target: Chapter; missing: Chapter[] } | null>(null);
  const preferenceKey = `white-dragon:prompt-previous:${readerId ?? "guest"}:${comicId}`;
  // Read browser storage only during a user action (not during server rendering).
  function shouldOfferPrevious() {
    try { return localStorage.getItem(preferenceKey) !== "off"; }
    catch { return true; }
  }
  function disablePreviousPrompt() {
    try { localStorage.setItem(preferenceKey, "off"); } catch { /* private browsing */ }
  }
  function mark(chapter:Chapter,action:"read"|"unread"|"read-through", approved=false){
    if(lock.current || pending)return;
    if(needsUnreadConfirmation(action, ratings[chapter.id]) && !approved){
      setConfirmUnread(chapter);
      return;
    }
    setConfirmUnread(null);
    const missing = action === "read" && shouldOfferPrevious() && chapter.kind === "MAIN"
      ? unreadEarlierMainChapters(chapters, ids, chapter.id) : [];
    lock.current=true;setFailure(null);
    start(async()=>{
      const next=new Set(ids);
      if(action==="unread")next.delete(chapter.id);
      else if(action==="read")next.add(chapter.id);
      else for(const c of main){next.add(c.id);if(c.id===chapter.id)break;}
      show([...next]);
      try{await writeReading(comicId,{intent:"chapter-reading",action,chapterId:String(chapter.id)});
        router.refresh();
        if (action === "read" && missing.length) setPreviousPrompt({ target: chapter, missing });
        else if(action==="read" && enabled)setSheet(chapter);
      }catch{setFailure({chapter,action});router.refresh();}
      finally{lock.current=false;}
    });
  }
  const active = chapters.filter((c) => c.status === "RELEASED");
  const scheduledCount = chapters.filter((c) => c.status === "SCHEDULED").length;
  const main = active.filter((c) => c.kind === "MAIN");
  const filtered = chapters.filter((c) => (c.status === "RELEASED" || (!hideScheduled && c.status === "SCHEDULED")) && c.kind === kind &&
    `${c.displayCode || c.title || "Глава"} ${c.title ?? ""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const history = chapters.filter((c) => c.status === "ARCHIVED" && read.has(c.id));
  const control = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm";
  const visible = filtered.slice(0, limit);
  const groups = groupChaptersByVolume(visible);
  // A pagination limit or search query must never change a volume's true progress.
  const allVolumeGroups = groupChaptersByVolume(chapters.filter(c =>
    (c.status === "RELEASED" || (!hideScheduled && c.status === "SCHEDULED")) && c.kind === kind));
  const hasVolumes = groups.some(group => group.number !== null);
  const nextChapterId = main.find(chapter => !read.has(chapter.id))?.id ?? null;

  function renderChapter(c: Chapter) {
    const isScheduled = c.status === "SCHEDULED";
    const destination = getChapterReadingSource(c.sourceUrl, workSourceUrl, c.status);
    const direct = destination.kind === "direct" ? destination.source : null;
    const isRead = read.has(c.id);
    const isNext = canMark && c.id === nextChapterId && !isRead && !isScheduled;
    const label = [c.displayCode, c.title].filter(Boolean).join(" · ") || "Глава";
    const heading = c.title?.trim() || c.displayCode?.trim() || "Глава без названия";
    const code = c.displayCode?.trim() || (c.kind === "SPECIAL" ? "Спецвыпуск" : "Глава");
    const art = (comicId + c.id) % 4;
    return (
      <li key={c.id}
        className={`wd-row wd08-row${isScheduled ? " wd-row--scheduled wd08-row--scheduled" : ""}${isRead ? " wd08-row--read" : ""}${isNext ? " wd08-row--next" : ""}`}
        data-ux08-art={art}>
        <span className="wd08-timeline-marker" aria-hidden="true">{isRead ? "✓" : ""}</span>
        <span className="wd08-art" aria-hidden="true" />
        <div className="wd08-index" aria-hidden="true"><span>✦</span></div>
        <div className="wd08-main">
          <span className="wd08-code">{code}</span>
          <div className="wd-row-title">
            {direct ? (
              <a href={direct.href} target="_blank" rel="noopener noreferrer"
                aria-label={label + " — открыть главу в новой вкладке"}>
                {heading} <span className="wd08-external" aria-hidden="true">↗</span>
              </a>
            ) : <span className="wd08-heading">{heading}</span>}
            {destination.kind === "general" && destination.source ? (
              <a className="wd08-source-link" href={destination.source.href}
                target="_blank" rel="noopener noreferrer"
                aria-label={label + " — открыть общий источник произведения в новой вкладке"}>
                Прямой ссылки нет · общий источник ↗
              </a>
            ) : null}
            {destination.kind === "missing" ? (
              <small className="wd08-source-note">Ссылка на чтение пока не добавлена.</small>
            ) : null}
            {!isScheduled && c.supersedesChapterId ? (
              <details className="chapter-revision"><summary>Новая редакция</summary>
                <p>Отметка прежней версии хранится в архиве.</p></details>
            ) : null}
          </div>
          <div className="wd08-state-line">
            <span className={`wd08-publication${isScheduled ? " wd08-publication--planned" : ""}`}>
              {isScheduled ? "◷ Ожидается" : "✓ Вышла"}
            </span>
            {isRead && !isScheduled ? <span className="wd08-read-state">✓ Прочитано</span> : null}
            {isNext ? <span className="wd08-next-state">Продолжить чтение</span> : null}
            {isScheduled && c.expectedRelease ? (
              <span className="wd08-date">Выход: {formatExpectedRelease(c.expectedRelease)}</span>
            ) : null}
          </div>
        </div>
        <div className="wd08-actions">
          {canMark && !isScheduled && isRead ? (
            <button type="button" className="wd-score" disabled={pending}
              aria-label={"Оценить: " + label} onClick={() => setSheet(c)}>
              {ratings[c.id] ? "★ " + ratings[c.id] : "☆"}
            </button>
          ) : null}
          {canMark && !isScheduled ? (
            <button type="button" className="wd-mark" aria-pressed={isRead}
              aria-label={(isRead ? "Снять отметку: " : "Отметить прочитанной: ") + label}
              disabled={pending} onClick={() => mark(c, isRead ? "unread" : "read")}>
              <span>{isRead ? "✓" : ""}</span>
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section className="chapter-panel chapter-panel--ux08" aria-label="Главы и история чтения">
      <header className="wd08-intro">
        <div><p className="wd08-kicker">Оглавление</p><h2>Главы истории</h2>
          <p>Прочитанные страницы, доступные истории и главы, которые ещё ждут своего часа.</p>
        </div>
        <span className="wd08-count">{main.length} вышло{scheduledCount ? ` · ${scheduledCount} ожидается` : ""}</span>
      </header>
      {sharedSource ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div><p className="font-semibold">Общий источник произведения</p><p className="text-xs text-[var(--text-secondary)]">Переход ведёт к произведению целиком, не к отдельной главе.</p></div>
        <a className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-accent)]" href={sharedSource.href} target="_blank" rel="noopener noreferrer">{sharedSource.label} ↗</a>
      </div> : null}
      {scheduledCount > 0 && <label className="wd-planned-toggle">
        <span>Скрыть запланированные <small>Ещё не вышли: {scheduledCount}</small></span>
        <input type="checkbox" checked={hideScheduled} onChange={(e) => { setHideScheduled(e.target.checked); setLimit(30); }}/>
      </label>}
      {chapters.length > 0 && (
      <details className="wd-tools"><summary>Поиск и действия</summary>
      {canMark && main.length > 0 ? (
        <details className="chapter-bulk"><summary>Отметить несколько глав прочитанными</summary>
          <form onSubmit={e=>{e.preventDefault();const id=Number(new FormData(e.currentTarget).get("chapterId"));const c=main.find(x=>x.id===id);if(c)mark(c,"read-through");}}>
            <input type="hidden" name="comicId" value={comicId} />
            <input type="hidden" name="intent" value="chapter-reading" />
            <input type="hidden" name="action" value="read-through" />
            <label className="block text-sm font-medium">
              Прочитано до главы
              <select name="chapterId" required defaultValue="" className={`${control} mt-2`}>
                <option value="" disabled>Выберите последнюю прочитанную главу</option>
                {main.map((c) => <option key={c.id} value={c.id}>{c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""}{c.supersedesChapterId ? " (новая редакция)" : ""}</option>)}
              </select>
            </label>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Отметит основные главы до выбранной включительно в текущем порядке. Спецвыпуски и архивные версии останутся без изменений.</p>
            <Button disabled={pending} type="submit" className="mt-3 w-full sm:w-auto">Отметить прочитанное до выбранной</Button>
          </form>
        </details>
      ) : null}
      <details className="chapter-filters">
        <summary>Поиск и раздел <span>{kind === "MAIN" ? "Основные" : "Спецвыпуски"}{query.trim() ? " · есть поиск" : ""} · {filtered.length}</span></summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Поиск по коду или названию
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(30); }} placeholder="15.5, спецвыпуск, название…" className={`${control} mt-2`} />
        </label>
        <label className="block text-sm">Раздел
          <select value={kind} onChange={(e) => { setKind(e.target.value); setLimit(30); }} className={`${control} mt-2`}>
            <option value="MAIN">Основные главы</option><option value="SPECIAL">Спецвыпуски и бонусы</option>
          </select>
        </label>
      </div>
        {query || kind !== "MAIN" ? <button type="button" className="tea-text-action chapter-filter-reset" onClick={() => { setQuery(""); setKind("MAIN"); setLimit(30); }}>Сбросить фильтры</button> : null}
      </details>
      </details>
      )}
      {failure && <div className="wd-reading-error" role="alert">Не удалось подтвердить отметку. <button className="tea-text-action" disabled={pending} onClick={()=>mark(failure.chapter,failure.action)}>Повторить</button></div>}
      {hasVolumes ? <div className="wd-volumes" aria-label="Тома и главы">
        {groups.map((group) => {
          const allInVolume = allVolumeGroups.find(candidate => candidate.number === group.number)?.chapters ?? group.chapters;
          const progress = volumeProgress(allInVolume, read);
          const scheduled = allInVolume.filter(c => c.status === "SCHEDULED").length;
          const title = volumeHeading(group.number, group.number === null ? null : volumeTitles[group.number]);
          return <details key={group.number ?? "ungrouped"} className="wd-volume" defaultOpen={nextChapterId !== null ? group.chapters.some(c => c.id === nextChapterId) : group.number === groups[0]?.number}>
            <summary className="wd-volume-summary">
              <span className="wd-volume-heading">{title} <small>{allInVolume.length} глав</small></span>
              <span className="wd-volume-stats">
                {canMark && progress.total > 0 ? `Прочитано ${progress.read} из ${progress.total}` : `${progress.total} вышло`}
                {scheduled > 0 ? ` · Ожидается ${scheduled}` : ""}
              </span>
              {canMark && progress.total > 0 && <progress aria-label={`Прогресс: ${title}`} max={progress.total} value={progress.read} />}
            </summary>
            <ul className="wd-chapters">{group.chapters.map(renderChapter)}</ul>
          </details>;
        })}
      </div> : <ul className="wd-chapters">{visible.map(renderChapter)}</ul>}
      {filtered.length === 0 ? <p className="wd-no-chapters mt-4 text-sm text-[var(--text-secondary)]">{query ? "По запросу ничего не найдено." : hideScheduled ? "В этом разделе пока нет вышедших глав." : "В этом разделе пока нет глав."}</p> : null}
      {filtered.length > limit ? <Button variant="secondary" className="mt-3" onClick={() => setLimit(limit + 30)}>Показать ещё 30</Button> : null}
      {history.length ? <details className="mt-5 rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer font-semibold">Прочитанные архивные версии ({history.length})</summary><ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{history.map((c) => <li key={c.id}>{c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""} · прочитано{ratings[c.id] ? ` · ★ ${ratings[c.id]} / 5` : ""}</li>)}</ul></details> : null}
      {confirmUnread && <UnreadChapterConfirmation
        chapter={confirmUnread}
        onCancel={() => setConfirmUnread(null)}
        onConfirm={() => mark(confirmUnread, "unread", true)} />}
      {previousPrompt && <PreviousChaptersPrompt comicId={comicId} target={previousPrompt.target} missing={previousPrompt.missing}
        offerRatings={enabled} onClose={() => setPreviousPrompt(null)} onDecline={() => {
          const target = previousPrompt.target; setPreviousPrompt(null); if (enabled) setSheet(target);
        }} onChanged={() => router.refresh()} onRemember={disablePreviousPrompt} />}
      {sheet && <ChapterRating comicId={comicId} chapter={sheet} rating={ratings[sheet.id]??null} onClose={()=>setSheet(null)}/>}
      {!canMark && chapters.length > 0 ? <p className="wd-library-hint mt-4 text-sm text-[var(--text-secondary)]">Добавьте комикс в свою библиотеку, чтобы отмечать чтение.</p> : null}
    </section>
  );
}
