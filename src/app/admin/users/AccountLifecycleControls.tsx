"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { lifecycleError } from "@/app/account/AccountDeletion";
export function AccountLifecycleControls({id,active,own}:{id:number;active:boolean;own:boolean}){
 const router=useRouter(),[deleting,setDeleting]=useState(false),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function send(action:'BAN'|'UNBAN'|'DELETE'){
  if(!window.confirm(action==='DELETE'?`Навсегда удалить аккаунт ID ${id}? Отзывы и ответы сохранятся с обезличенным автором.`:action==='BAN'?`Заблокировать ID ${id} и завершить все его сессии?`:`Разблокировать ID ${id}?`))return;
  setBusy(true);setMessage('');
  try{const r=await fetch(`/api/admin/users/${id}/lifecycle`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,confirm:`${action}:${id}`})});const v=await r.json();if(!r.ok)setMessage(lifecycleError(v.error));else{setMessage(action==='DELETE'?'Аккаунт удалён.':'Состояние обновлено, прежние сессии отозваны.');setDeleting(false);setConfirm('');router.refresh();}}catch{setMessage('Ответ не получен. Обновите страницу перед повторной попыткой.');}finally{setBusy(false);}
 }
 if(own)return <p className="mt-4 text-sm">Свой аккаунт можно удалить в <a href="/account/delete" className="underline">настройках профиля</a>.</p>;
 return <div className="mt-5 border-t border-[var(--border)] pt-4">
  <div className="flex flex-wrap gap-3"><button className="tea-outline" disabled={busy} onClick={()=>send(active?'BAN':'UNBAN')}>{active?'Заблокировать':'Разблокировать'}</button><button className="tea-outline" disabled={busy} onClick={()=>setDeleting(!deleting)}>Удалить пользователя…</button></div>
  {deleting&&<div className="mt-4"><p>Удаление необратимо. Удаляются профиль и личные данные; обсуждения и технические журналы сохраняются. Введите ID {id}.</p><label>Подтверждение ID<input className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] block w-full max-w-xs" value={confirm} onChange={e=>setConfirm(e.target.value)} inputMode="numeric"/></label><button className="tea-outline mt-3" disabled={busy||confirm!==String(id)} onClick={()=>send('DELETE')}>Удалить навсегда</button></div>}
  {message&&<p role="status" className="mt-3">{message}</p>}
 </div>;
}
