"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
let depth=0,originalOverflow='';
export function ReviewDialog({title,children,onClose,dirty=false,busy=false,wide=false}:{title:string;children:ReactNode;onClose:()=>void;dirty?:boolean;busy?:boolean;wide?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null),id=useId();const [confirm,setConfirm]=useState(false);
 useEffect(()=>{const dialog=ref.current!,focused=document.activeElement as HTMLElement|null;
  if(depth++===0){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}dialog.showModal();
  return()=>{dialog.close();if(--depth===0)document.body.style.overflow=originalOverflow;focused?.focus();};
 },[]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 function close(){if(busy)return;if(dirty)setConfirm(true);else onClose();}
 return <dialog ref={ref} className={'reviews-dialog'+(wide?' reviews-dialog--wide':'')} aria-labelledby={id}
  onCancel={e=>{e.preventDefault();e.stopPropagation();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
  <header className="reviews-dialog-header"><div><p className="reviews-kicker">Читательская гостиная</p><h2 id={id}>{title}</h2></div>
   <button className="reviews-icon-button" type="button" disabled={busy} aria-label="Закрыть окно отзывов" onClick={close}>×</button></header>
  {confirm&&<div className="reviews-discard" role="alert"><p>Есть несохранённые изменения. Закрыть окно без сохранения?</p>
   <button type="button" className="reviews-button" autoFocus onClick={()=>setConfirm(false)}>Продолжить редактирование</button>
   <button type="button" className="reviews-button reviews-button--quiet" onClick={onClose}>Закрыть без сохранения</button></div>}
  {children}
 </dialog>;
}
