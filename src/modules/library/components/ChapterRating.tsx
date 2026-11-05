"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PromptSwitch, usePromptPreference, writeReading } from "./WorkControls";

export function ChapterRating({comicId,chapter,rating,onClose,onSaved,showPreference=true,refreshOnSave=true}:{comicId:number; chapter:{id:number;title:string|null;displayCode:string};rating:number|null;onClose:()=>void;onSaved?:(rating:number|null)=>void;showPreference?:boolean;refreshOnSave?:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [pending,setPending]=useState(false), [error,setError]=useState("");
  const [selected,setSelected]=useState<number|null>(rating);
  const [preview,setPreview]=useState<number|null>(null);
  const [saved,setSaved]=useState(false);
  const {busy:prefBusy}=usePromptPreference();
  const lock=useRef(false), router=useRouter();
  useEffect(()=>{const d=dialog.current!;d.showModal();return ()=>d.close();},[]);
  async function save(value:number|null) {
    if(lock.current)return;
    const previous=selected;
    lock.current=true;setSelected(value);setPreview(null);setPending(true);setError("");setSaved(false);
    try{await writeReading(comicId,{intent:"chapter-rating",chapterId:String(chapter.id),rating:String(value??"")});setSaved(true);onSaved?.(value);if(refreshOnSave)router.refresh();}
    catch{setSelected(previous);setError("Не удалось сохранить оценку. Попробуйте ещё раз.");}
    finally{lock.current=false;setPending(false);}
  }
  return <dialog ref={dialog} aria-labelledby="wd-sheet-title" className="wd-sheet" onCancel={e=>{e.preventDefault();if(!pending&&!prefBusy)onClose();}} onClick={e=>{if(e.target===dialog.current&&!pending&&!prefBusy)onClose();}}>
    <div className="wd-sheet-body"><button type="button" className="wd-close" aria-label="Закрыть окно оценки главы" disabled={pending||prefBusy} onClick={onClose}>×</button>
    <small>ОЦЕНКА ГЛАВЫ</small><h2 id="wd-sheet-title">{chapter.title||"Глава "+chapter.displayCode}</h2>
    {chapter.title && chapter.displayCode && <p>Глава {chapter.displayCode}</p>}
    <div className="wd-stars" role="group" aria-label="Оценка от 1 до 5" onMouseLeave={()=>setPreview(null)}>{[1,2,3,4,5].map(n=><button type="button" key={n} aria-label={n+" из 5"} aria-pressed={selected===n} disabled={pending||prefBusy} onMouseEnter={()=>{if(!pending&&!prefBusy)setPreview(n);}} onFocus={()=>{if(!pending&&!prefBusy)setPreview(n);}} onBlur={()=>setPreview(null)} onClick={()=>void save(n)}>{n<=(preview??selected??0)?"★":"☆"}</button>)}</div>
    {selected!==null && <button type="button" className="tea-text-action" disabled={pending||prefBusy} onClick={()=>void save(null)}>Убрать оценку</button>}
    {!showPreference && <p className="wd-rating-optional">Оценивать необязательно. Можно закрыть окно без оценки.</p>}
    <div role="status" aria-live="polite">{pending?"Сохраняем…":error||(saved?(selected===null?"Оценка удалена":"Оценка сохранена"):"")}</div>{showPreference ? <PromptSwitch inverse/> : null}</div>
  </dialog>;
}
