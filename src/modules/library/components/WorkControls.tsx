"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export async function writeReading(comicId: number, fields: Record<string,string>) {
  const res = await fetch("/api/library/reading-state", {method:"POST", headers:{Accept:"application/json"},
    body:new URLSearchParams({comicId:String(comicId), ...fields})});
  if (!res.ok || !(await res.json()).ok) throw new Error("Не удалось сохранить.");
}

const Pref = createContext({enabled:true, busy:false, save: async (_enabled:boolean) => { void _enabled; }});
export function WorkPreferences({comicId, initial, children}:{comicId:number; initial:boolean; children:ReactNode}) {
  const [enabled,setEnabled] = useState(initial), [busy,setBusy] = useState(false);
  const lock=useRef(false);
  async function save(value:boolean) {
    if(lock.current) return;
    lock.current=true; setBusy(true); setEnabled(value);
    try {await writeReading(comicId,{intent:"rating-prompt", enabled:String(value)});}
    catch(error){setEnabled(!value);throw error;}
    finally {lock.current=false; setBusy(false);}
  }
  return <Pref.Provider value={{enabled,busy,save}}>{children}</Pref.Provider>;
}
export const usePromptPreference=()=>useContext(Pref);
export function PromptSwitch({inverse=false}:{inverse?:boolean}) {
  const {enabled,busy,save}=usePromptPreference();
  const [error,setError]=useState("");
  return <div><label className="wd-switch"><span>{inverse?"Больше не предлагать для этого тайтла":"Предлагать оценку главы"}{!inverse && <small>Только для этого тайтла</small>}</span>
    <input type="checkbox" checked={inverse?!enabled:enabled} disabled={busy} onChange={async()=>{setError("");try{await save(!enabled);}catch{setError("Не удалось сохранить настройку.");}}}/></label>
    {error && <small role="alert">{error}</small>}</div>;
}
export function ShelfAction({comicId, member, login}:{comicId:number;member:boolean;login:string|null}) {
  const router=useRouter(), [pending,setPending]=useState(false), [error,setError]=useState("");
  if(member) return <a href="#my-reading" className="wd-bookmark">✓ В дневнике</a>;
  if(login) return <a className="wd-bookmark" href={login}>Войти в дневник</a>;
  return <div><button type="button" className="wd-bookmark" disabled={pending} onClick={async()=>{setPending(true);setError("");try{await writeReading(comicId,{intent:"add-to-library"});router.refresh();}catch{setPending(false);setError("Не удалось добавить. Попробуйте ещё раз.");}}}>{pending?"Добавляем…":"＋ В дневник"}</button>{error && <small role="alert">{error}</small>}</div>;
}

const tabs=[["chapters","Главы"],["about","Об истории"],["my-reading","Мой дневник"]] as const;
export function WorkTabs({chapters,about,diary,count}:{chapters:ReactNode;about:ReactNode;diary:ReactNode;count:number}) {
  const [tab,setTab]=useState<string>("chapters");
  const refs=useRef<(HTMLAnchorElement|null)[]>([]);
  useEffect(()=>{function sync(){const hash=window.location.hash.slice(1);setTab(tabs.some(([id])=>id===hash)?hash:"chapters");}
    sync();window.addEventListener("hashchange",sync);window.addEventListener("popstate",sync);
    return ()=>{window.removeEventListener("hashchange",sync);window.removeEventListener("popstate",sync);};},[]);
  function choose(id:string){setTab(id);if(location.hash!=="#"+id)history.pushState(null,"","#"+id);}
  const panels=[chapters,about,diary];
  return <><nav className="wd-tabs" role="tablist" aria-label="О произведении">{tabs.map(([id,label],i)=><a key={id} ref={el=>{refs.current[i]=el;}} href={"#"+id} role="tab" id={"tab-"+id} aria-controls={id} aria-selected={id===tab} tabIndex={id===tab?0:-1}
    onClick={e=>{e.preventDefault();choose(id);}} onKeyDown={e=>{const j=e.key==="ArrowRight"?(i+1)%3:e.key==="ArrowLeft"?(i+2)%3:e.key==="Home"?0:e.key==="End"?2:-1;if(j>=0){e.preventDefault();choose(tabs[j][0]);refs.current[j]?.focus();}}}>{label}{i===0?" · "+count:""}</a>)}</nav>
    {tabs.map(([id],i)=><section key={id} id={id} role="tabpanel" aria-labelledby={"tab-"+id} hidden={tab!==id}>{panels[i]}</section>)}</>;
}

export function DiaryForm({comicId,children}:{comicId:number;children:ReactNode}) {
  const router=useRouter(), [pending,setPending]=useState(false), [error,setError]=useState("");
  return <form className="journal-form" onSubmit={async e=>{
    e.preventDefault();if(pending)return;
    const fields=Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;
    setPending(true);setError("");
    try{await writeReading(comicId,{...fields,intent:"update-diary"});router.refresh();}
    catch{setError("Не удалось сохранить. Черновик остался на странице.");}
    finally{setPending(false);}
  }}><fieldset disabled={pending}>{children}</fieldset>{error && <p role="alert">{error}</p>}</form>;
}
