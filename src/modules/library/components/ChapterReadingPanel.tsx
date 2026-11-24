"use client";

import { CoverImage } from "@/shared/components/media/CoverImage";
import { ChapterPublicRating } from "@/modules/community/ChapterPublicRating";
import { formatRating, formatRatingVotes, type RatingAggregate } from "../ratings/community-rating";
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
import { groupChaptersByVolume, volumeHeading } from "@/modules/catalog/chapter-volumes";
import { getChapterReadingSource, readingSource } from "@/modules/library/reading-target";
import { useWorkChapterProgress } from "./WorkChapterProgress";
import { ChapterGroupSummary } from "./ChapterGroupSummary";
import { WorkIcon } from "@/shared/components/WorkIcon";

type Chapter = Omit<ComicChapter, "releasedAt">;
type Props = { comicId: number; readerId: number | null; chapters: Chapter[]; ratings: Record<number, number>; canMark: boolean; workSourceUrl: string | null; volumeTitles?: Record<number, string>; communityRatings?: Record<number, RatingAggregate>; volumeRatings?:Record<number,RatingAggregate>;unassignedRating?:RatingAggregate;viewerRatings?:Record<number,{rating:number|null;source:'review'|'diary'|'withdrawn';hidden:boolean}>; ratingsEnabled?: boolean };

export function ChapterReadingPanel({ comicId, readerId, chapters, ratings, canMark, workSourceUrl, volumeTitles = {}, communityRatings = {}, volumeRatings={},unassignedRating,viewerRatings={},ratingsEnabled = false }: Props) {
  const [discussion, setDiscussion] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [mainLimit, setMainLimit] = useState(30);
  const [specialLimit, setSpecialLimit] = useState(30);
  const [hideScheduled, setHideScheduled] = useState(false);
  // A reader's explicit expand/collapse choice overrides automatic next-chapter focus.
  const [manualVolumeOpen, setManualVolumeOpen] = useState<Record<string, boolean>>({});
  const sharedSource = readingSource(workSourceUrl);
  const router=useRouter();
  const [pending,start]=useTransition();
  const lock=useRef(false);
  const {readIds: ids, showReadIds: show}=useWorkChapterProgress();
  const read=new Set(ids);
  const [sheet,setSheet]=useState<Chapter|null>(null);
  const [failure,setFailure]=useState<{chapter:Chapter;action:"read"|"unread"}|null>(null);
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
  function mark(chapter:Chapter,action:"read"|"unread", approved=false){
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
      else next.add(chapter.id);
      show([...next]);
      try{await writeReading(comicId,{intent:"chapter-reading",action,chapterId:String(chapter.id)});
        router.refresh();
        if (action === "read" && missing.length) setPreviousPrompt({ target: chapter, missing });
        else if(action==="read" && enabled)setSheet(chapter);
      }catch{setFailure({chapter,action});router.refresh();}
      finally{lock.current=false;}
    });
  }
  const allMain = chapters.filter(c => c.kind === "MAIN" && (c.status === "RELEASED" || c.status === "SCHEDULED"));
  const allSpecials = chapters.filter(c => c.kind === "SPECIAL" && (c.status === "RELEASED" || c.status === "SCHEDULED"));
  const main = allMain.filter(c => c.status === "RELEASED");
  const scheduledCount = [...allMain, ...allSpecials].filter(c => c.status === "SCHEDULED").length;
  const search = query.trim().toLocaleLowerCase("ru");
  const matches = (c: Chapter) => (!hideScheduled || c.status !== "SCHEDULED") &&
    `${c.displayCode} ${c.title ?? ""}`.toLocaleLowerCase("ru").includes(search);
  const filteredMain = allMain.filter(matches);
  const filteredSpecials = allSpecials.filter(matches);
  const visibleMain = filteredMain.slice(0, mainLimit);
  const visibleSpecials = filteredSpecials.slice(0, specialLimit);
  const history = chapters.filter(c => c.status === "ARCHIVED" && read.has(c.id));
  const control = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm";
  const groups = groupChaptersByVolume(visibleMain);
  // Full membership, never a filtered/paginated subset, defines progress and grouping.
  const allVolumeGroups = groupChaptersByVolume(allMain);
  const hasVolumes = allVolumeGroups.some(group => group.number !== null);
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
    const personal=viewerRatings[c.id];
    const publicScore=personal?.source==='review'||personal?.source==='withdrawn';
    const usePublicEditor=publicScore||!isRead;
    const myRating=personal?.rating??(publicScore?null:ratings[c.id]??null);
    return (
      <li key={c.id}
        className={`wd-row wd08-row${isScheduled ? " wd-row--scheduled wd08-row--scheduled" : ""}${isRead ? " wd08-row--read" : ""}${isNext ? " wd08-row--next" : ""}`}
        data-ux08-art={art}>
        <span className="wd08-timeline-marker" aria-hidden="true">{isRead ? "✓" : ""}</span>
        {c.coverUrl ? (
          <CoverImage src={c.coverUrl} alt="" decorative className="wd08-cover-art" imageClassName="wd08-cover-art-image" />
        ) : (
          <span className="wd08-art" aria-hidden="true" />
        )}
        <div className="wd08-index" aria-hidden="true"><WorkIcon name={isRead?'check':isNext?'play':'book'}/></div>
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
            {isScheduled&&<span className="wd08-publication wd08-publication--planned"><WorkIcon name="clock"/>Ожидается</span>}
            {isRead && !isScheduled ? <span className="wd08-read-state"><WorkIcon name="check"/>Прочитано</span> : null}
            {isNext ? <span className="wd08-next-state"><WorkIcon name="play"/>Продолжить чтение</span> : null}
            {c.readingMinutes!==null&&c.readingMinutes!==undefined&&<span className="wd08-reading-time"><WorkIcon name="clock"/>≈ {c.readingMinutes} мин</span>}
            {isScheduled && c.expectedRelease ? (
              <span className="wd08-date">Выход: {formatExpectedRelease(c.expectedRelease)}</span>
            ) : null}
          </div>
        </div>
        <div className="wd08-actions">
          {c.pageCount!==null&&c.pageCount!==undefined&&<span className="wd08-pages"><WorkIcon name="pages"/>{c.pageCount} стр.</span>}
          {!isScheduled&&<span className="wd08-community-score" data-chapter-community={c.id} title={formatRatingVotes(communityRatings[c.id]?.votes??0)} aria-label={`Рейтинг читателей: ${communityRatings[c.id]?.average==null?'оценок пока нет':formatRating(communityRatings[c.id].average)}`}><WorkIcon name="star"/>{communityRatings[c.id]?.average==null?'—':communityRatings[c.id].average!.toLocaleString('ru',{maximumFractionDigits:1,minimumFractionDigits:1})}</span>}
          {readerId!==null && !isScheduled ? (
            <button type="button" className="wd-score" disabled={pending}
              title={personal?.hidden?'Оценка скрыта и не учитывается в рейтинге':usePublicEditor?'Оценка главы':'Личная оценка дневника'}
              aria-label={(usePublicEditor?'Моя оценка главы: ':"Оценить: ") + label} onClick={() => usePublicEditor?setDiscussion(c.id):setSheet(c)}>
              <small>{usePublicEditor?'Моя оценка':'Моя · дневник'}</small><span>{myRating===null?'—':`★ ${myRating}`}{personal?.hidden?' · скрыта':''}</span>
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
      {sharedSource ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div><p className="font-semibold">Общий источник произведения</p><p className="text-xs text-[var(--text-secondary)]">Переход ведёт к произведению целиком, не к отдельной главе.</p></div>
        <a className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-accent)]" href={sharedSource.href} target="_blank" rel="noopener noreferrer">{sharedSource.label} ↗</a>
      </div> : null}
      {scheduledCount > 0 && <label className="wd-planned-toggle">
        <span>Скрыть запланированные <small>Ещё не вышли: {scheduledCount}</small></span>
        <input type="checkbox" checked={hideScheduled} onChange={(e) => { setHideScheduled(e.target.checked); setMainLimit(30); setSpecialLimit(30); }}/>
      </label>}
      {chapters.length > 0 && <div className="wd-chapter-navigation">
        {allSpecials.length > 0 && <nav className="wd-chapter-sections" aria-label="Разделы оглавления">
          <a href="#main-chapters">Основная история <span>{main.length}</span></a>
          <a href="#special-chapters">Спецвыпуски и бонусы <span>{allSpecials.filter(c => c.status === "RELEASED").length}</span></a>
        </nav>}
        <label className="block text-sm">Поиск глав и спецвыпусков
          <input type="search" value={query} onChange={e => {setQuery(e.target.value);setMainLimit(30);setSpecialLimit(30);}} placeholder="Код или название…" className={`${control} mt-2`}/>
        </label>
        {query && <button type="button" className="tea-text-action chapter-filter-reset" onClick={() => {setQuery("");setMainLimit(30);setSpecialLimit(30);}}>Сбросить поиск</button>}
      </div>}
      {failure && <div className="wd-reading-error" role="alert">Не удалось подтвердить отметку. <button className="tea-text-action" disabled={pending} onClick={()=>mark(failure.chapter,failure.action)}>Повторить</button></div>}
      <section id="main-chapters" data-chapter-section="main" aria-label="Основная история" className="wd-chapter-section">
        {hasVolumes ? <div className="wd-volumes" aria-label="Тома и главы">
          {groups.map(group => {
            const allInVolume = allVolumeGroups.find(candidate => candidate.number === group.number)?.chapters ?? group.chapters;
            const title = volumeHeading(group.number, group.number === null ? null : volumeTitles[group.number]);
            const volumeKey = group.number === null ? "ungrouped" : `volume-${group.number}`;
            const autoOpen = nextChapterId !== null ? allInVolume.some(c => c.id === nextChapterId) : group.number === groups[0]?.number;
            const expanded = manualVolumeOpen[volumeKey] ?? autoOpen;
            return <details key={volumeKey} className="wd-volume" open={expanded}>
              <summary className="wd-volume-summary" onClick={event => {
                event.preventDefault();
                setManualVolumeOpen(current => ({...current,[volumeKey]:!(current[volumeKey] ?? autoOpen)}));
              }}>
                <ChapterGroupSummary title={title} chapters={allInVolume} read={read} canMark={canMark}
                  rating={group.number === null ? unassignedRating : volumeRatings[group.number]}/>
              </summary>
              <ul className="wd-chapters">{group.chapters.map(renderChapter)}</ul>
            </details>;
          })}
        </div> : allMain.length > 0 ? <section className="wd-volume wd-flat-summary" aria-label="Сводка основной истории">
          <div className="wd-volume-summary"><ChapterGroupSummary title="Основная история" headingAs="h2" chapters={allMain} read={read} canMark={canMark} rating={unassignedRating}/></div>
          <ul className="wd-chapters">{visibleMain.map(renderChapter)}</ul>
        </section> : null}
        {filteredMain.length === 0 && <p className="wd-no-chapters mt-4 text-sm text-[var(--text-secondary)]">{search ? "Основные главы по запросу не найдены." : hideScheduled && allMain.length ? "Основные главы пока ожидаются." : "Основных глав пока нет."}</p>}
        {filteredMain.length > mainLimit && <Button variant="secondary" className="mt-3" onClick={() => setMainLimit(mainLimit + 30)}>Показать ещё 30 глав</Button>}
      </section>
      {allSpecials.length > 0 && <section id="special-chapters" data-chapter-section="special" aria-labelledby="special-chapters-title" className="wd-chapter-section wd-specials">
        <header className="wd-specials-heading"><div><h2 id="special-chapters-title">Спецвыпуски и бонусы</h2>
          <p>Отдельные истории и дополнения. Не входят в прогресс основной истории.</p></div>
          <span>{allSpecials.filter(c => c.status === "RELEASED").length} вышло{allSpecials.some(c => c.status === "SCHEDULED") ? ` · ${allSpecials.filter(c => c.status === "SCHEDULED").length} ожидается` : ""}</span>
        </header>
        <ul className="wd-chapters">{visibleSpecials.map(renderChapter)}</ul>
        {filteredSpecials.length === 0 && <p className="wd-no-chapters mt-4 text-sm text-[var(--text-secondary)]">{search ? "Спецвыпуски по запросу не найдены." : "Спецвыпуски пока ожидаются."}</p>}
        {filteredSpecials.length > specialLimit && <Button variant="secondary" className="mt-3" onClick={() => setSpecialLimit(specialLimit + 30)}>Показать ещё 30 спецвыпусков</Button>}
      </section>}
      {history.length ? <details className="mt-5 rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer font-semibold">Прочитанные архивные версии ({history.length})</summary><ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{history.map((c) => <li key={c.id}>{c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""} · прочитано{ratings[c.id] ? ` · ★ ${ratings[c.id]} / 5` : ""}</li>)}</ul></details> : null}
      {confirmUnread && <UnreadChapterConfirmation
        preservePublicRating={viewerRatings[confirmUnread.id]?.source === 'review' && viewerRatings[confirmUnread.id]?.rating != null}
        chapter={confirmUnread}
        onCancel={() => setConfirmUnread(null)}
        onConfirm={() => mark(confirmUnread, "unread", true)} />}
      {previousPrompt && <PreviousChaptersPrompt comicId={comicId} target={previousPrompt.target} missing={previousPrompt.missing}
        offerRatings={enabled} onClose={() => setPreviousPrompt(null)} onDecline={() => {
          const target = previousPrompt.target; setPreviousPrompt(null); if (enabled) setSheet(target);
        }} onChanged={() => router.refresh()} onRemember={disablePreviousPrompt} />}
      {ratingsEnabled && discussion !== null && chapters.some(c => c.id === discussion && c.status === "RELEASED") && <ChapterPublicRating
        key={discussion} comicId={comicId} chapterId={discussion}
        title={chapters.find(c=>c.id===discussion)?.title||'Глава'} onClose={()=>setDiscussion(null)}/>}
      {sheet && <ChapterRating comicId={comicId} chapter={sheet} rating={ratings[sheet.id]??null} onClose={()=>setSheet(null)}/>}
      {!canMark && chapters.length > 0 ? <p className="wd-library-hint mt-4 text-sm text-[var(--text-secondary)]">Добавьте комикс в свою библиотеку, чтобы отмечать чтение.</p> : null}
    </section>
  );
}
