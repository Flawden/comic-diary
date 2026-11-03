"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PromptSwitch, usePromptPreference, writeReading } from "./WorkControls";

export function ChapterRating({comicId,chapter,rating,onClose}:{comicId:number; chapter:{id:number;title:string|null;displayCode:string};rating:number|null;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [pending,setPending]=useState(false), [error,setError]=useState("");
  const {busy:prefBusy}=usePromptPreference();
  const lock=useRef(false), router=useRouter();
  useEffect(()=>{const d=dialog.current!;d.showModal();return ()=>d.close();},[]);
  async function save(value:number|null) {
    if(lock.current)return;
    lock.current=true;setPending(true);setError("");
    try{await writeReading(comicId,{intent:"chapter-rating",chapterId:String(chapter.id),rating:String(value??"")});router.refresh();onClose();}
    catch{setError("Не удалось сохранить оценку. Попробуйте ещё раз.");}
    finally{lock.current=false;setPending(false);}
  }
  return <dialog ref={dialog} aria-labelledby="wd-sheet-title" className="wd-sheet" onCancel={e=>{e.preventDefault();if(!pending&&!prefBusy)onClose();}} onClick={e=>{if(e.target===dialog.current&&!pending&&!prefBusy)onClose();}}>
    <div className="wd-sheet-body"><button type="button" className="wd-close" aria-label="Закрыть без изменения оценки" disabled={pending||prefBusy} onClick={onClose}>×</button>
    <small>ОЦЕНКА ГЛАВЫ</small><h2 id="wd-sheet-title">{chapter.title||"Глава "+chapter.displayCode}</h2>
    {chapter.title && chapter.displayCode && <p>Глава {chapter.displayCode}</p>}
    <div className="wd-stars" aria-label="Оценка от 1 до 5">{[1,2,3,4,5].map(n=><button key={n} aria-label={n+" из 5"} aria-pressed={rating===n} disabled={pending||prefBusy} onClick={()=>void save(n)}>{n<=(rating??0)?"★":"☆"}</button>)}</div>
    {rating!==null && <button className="tea-text-action" disabled={pending||prefBusy} onClick={()=>void save(null)}>Убрать оценку</button>}
    <div aria-live="polite">{pending?"Сохраняем…":error}</div><PromptSwitch inverse/></div>
  </dialog>;
}
