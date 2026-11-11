"use client";

import { ChapterRating } from "./ChapterRating";
import { UnreadChapterConfirmation } from "./UnreadChapterConfirmation";
import { needsUnreadConfirmation } from "../needs-unread-confirmation";
import { PreviousChaptersPrompt } from "./PreviousChaptersPrompt";
import { unreadEarlierMainChapters } from "@/modules/library/chapter-reading-model";
import { usePromptPreference, writeReading } from "./WorkControls";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/shared/components/ui";
import type { ComicChapter } from "@/modules/comics/queries/get-comic-chapters";
import { formatExpectedRelease } from "@/modules/catalog/chapter-release-dates";
import { groupChaptersByVolume, volumeHeading, volumeProgress } from "@/modules/catalog/chapter-volumes";

type Chapter = Omit<ComicChapter, "releasedAt">;
type Props = { comicId: number; readerId: number | null; chapters: Chapter[]; ratings: Record<number, number>; readIds: number[]; canMark: boolean; volumeTitles?: Record<number, string> };

function safeSource(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? value : null; }
  catch { return null; }
}

export function ChapterReadingPanel({ comicId, readerId, chapters, readIds, ratings, canMark, volumeTitles = {} }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("MAIN");
  const [limit, setLimit] = useState(30);
  const [hideScheduled, setHideScheduled] = useState(false);
  const router=useRouter();
  const [pending,start]=useTransition();
  const lock=useRef(false);
  const [ids,show]=useOptimistic(readIds, (_prev:number[], next:number[])=>next);
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

  function renderChapter(c: Chapter) {
    const isScheduled = c.status === "SCHEDULED";
    const source = isScheduled ? null : safeSource(c.sourceUrl);
    const isRead = read.has(c.id);
    const label=[c.displayCode,c.title].filter(Boolean).join(" · ")||"Глава";
    return <li key={c.id} className={isScheduled ? "wd-row wd-row--scheduled" : "wd-row"}><div className="wd-row-title">
        {source?<a href={source} target="_blank" rel="noopener noreferrer" aria-label={label+" — открыть источник в новой вкладке"}>{label}</a>:<span>{label}</span>}
        {isScheduled ? <small className="wd-planned-date">{c.expectedRelease ? `Ожидается: ${formatExpectedRelease(c.expectedRelease)}` : "Запланирована · дата неизвестна"}</small> : null}
        {!isScheduled && c.supersedesChapterId ? <details className="chapter-revision"><summary>Новая редакция</summary><p>Отметка прежней версии хранится в архиве.</p></details>:null}
      </div>
      {isScheduled ? <span className="wd-planned-indicator" aria-label="Глава ещё не вышла" title="Глава ещё не вышла">◷</span> : null}
      {canMark && !isScheduled && isRead && <button className="wd-score" disabled={pending} aria-label={"Оценить: "+label} onClick={()=>setSheet(c)}>{ratings[c.id] ? "★ "+ratings[c.id] : "☆"}</button>}
      {canMark && !isScheduled && <button className="wd-mark" aria-pressed={isRead} aria-label={(isRead?"Снять отметку: ":"Отметить прочитанной: ")+label} disabled={pending} onClick={()=>mark(c,isRead?"unread":"read")}><span>{isRead?"✓":""}</span></button>}
    </li>;
  }

  return (
    <section className="chapter-panel" aria-label="Главы и история чтения">
      {canMark && main.length>0 && <div className="wd-progress"><span>Прочитано: {main.filter(c=>read.has(c.id)).length} из {main.length}</span><progress max={main.length} value={main.filter(c=>read.has(c.id)).length}/></div>}
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
          return <details key={group.number ?? "ungrouped"} className="wd-volume">
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
