"use client";

import { ChapterRating } from "./ChapterRating";
import { usePromptPreference, writeReading } from "./WorkControls";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/shared/components/ui";
import type { ComicChapter } from "@/modules/comics/queries/get-comic-chapters";

type Chapter = Omit<ComicChapter, "releasedAt">;
type Props = { comicId: number; chapters: Chapter[]; ratings: Record<number, number>; readIds: number[]; canMark: boolean };

function safeSource(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? value : null; }
  catch { return null; }
}

export function ChapterReadingPanel({ comicId, chapters, readIds, ratings, canMark }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("MAIN");
  const [limit, setLimit] = useState(30);
  const router=useRouter();
  const [pending,start]=useTransition();
  const lock=useRef(false);
  const [ids,show]=useOptimistic(readIds, (_prev:number[], next:number[])=>next);
  const read=new Set(ids);
  const [sheet,setSheet]=useState<Chapter|null>(null);
  const [failure,setFailure]=useState<{chapter:Chapter;action:"read"|"unread"|"read-through"}|null>(null);
  const {enabled}=usePromptPreference();
  function mark(chapter:Chapter,action:"read"|"unread"|"read-through"){
    if(lock.current || pending)return;
    if(action==="unread" && ratings[chapter.id] && !window.confirm("Снять отметку чтения и удалить оценку этой главы?"))return;
    lock.current=true;setFailure(null);
    start(async()=>{
      const next=new Set(readIds);
      if(action==="unread")next.delete(chapter.id);
      else if(action==="read")next.add(chapter.id);
      else for(const c of main){next.add(c.id);if(c.id===chapter.id)break;}
      show([...next]);
      try{await writeReading(comicId,{intent:"chapter-reading",action,chapterId:String(chapter.id)});
        router.refresh();
        if(action==="read" && enabled)setSheet(chapter);
      }catch{setFailure({chapter,action});router.refresh();}
      finally{lock.current=false;}
    });
  }
  const active = chapters.filter((c) => c.status === "RELEASED");
  const main = active.filter((c) => c.kind === "MAIN");
  const filtered = active.filter((c) => c.kind === kind &&
    `${c.displayCode || c.title || "Глава"} ${c.title ?? ""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const history = chapters.filter((c) => c.status === "ARCHIVED" && read.has(c.id));
  const control = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm";

  return (
    <section className="chapter-panel" aria-label="Главы и история чтения">
      {canMark && main.length>0 && <div className="wd-progress"><span>Прочитано: {main.filter(c=>read.has(c.id)).length} из {main.length}</span><progress max={main.length} value={main.filter(c=>read.has(c.id)).length}/></div>}
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
      {failure && <div role="alert">Не удалось подтвердить отметку. <button className="tea-text-action" disabled={pending} onClick={()=>mark(failure.chapter,failure.action)}>Повторить</button></div>}
      <ul className="wd-chapters">
        {filtered.slice(0, limit).map((c) => {
          const source = safeSource(c.sourceUrl);
          const isRead = read.has(c.id);
          const label=[c.displayCode,c.title].filter(Boolean).join(" · ")||"Глава";
          return <li key={c.id} className="wd-row"><div className="wd-row-title">
              {source?<a href={source} target="_blank" rel="noopener noreferrer" aria-label={label+" — открыть источник в новой вкладке"}>{label} <small>↗</small></a>:<span>{label}</span>}
              {c.supersedesChapterId ? <details className="chapter-revision"><summary>Новая редакция</summary><p>Отметка прежней версии хранится в архиве.</p></details>:null}
            </div>
            {canMark && isRead && <button className="wd-score" disabled={pending} aria-label={"Оценить: "+label} onClick={()=>setSheet(c)}>{ratings[c.id] ? "★ "+ratings[c.id] : "☆"}</button>}
            {canMark && <button className="wd-mark" aria-pressed={isRead} aria-label={(isRead?"Снять отметку: ":"Отметить прочитанной: ")+label} disabled={pending} onClick={()=>mark(c,isRead?"unread":"read")}><span>{isRead?"✓":""}</span></button>}
          </li>;
        })}
      </ul>
      {filtered.length === 0 ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{query ? "По запросу ничего не найдено." : "В этом разделе пока нет опубликованных глав."}</p> : null}
      {filtered.length > limit ? <Button variant="secondary" className="mt-3" onClick={() => setLimit(limit + 30)}>Показать ещё 30</Button> : null}
      {history.length ? <details className="mt-5 rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer font-semibold">Прочитанные архивные версии ({history.length})</summary><ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{history.map((c) => <li key={c.id}>{c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""} · прочитано{ratings[c.id] ? ` · ★ ${ratings[c.id]} / 5` : ""}</li>)}</ul></details> : null}
      {sheet && <ChapterRating comicId={comicId} chapter={sheet} rating={ratings[sheet.id]??null} onClose={()=>setSheet(null)}/>}
      {!canMark ? <p className="mt-4 text-sm text-[var(--text-secondary)]">Добавьте комикс в свою библиотеку, чтобы отмечать чтение.</p> : null}
    </section>
  );
}
