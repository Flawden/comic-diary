'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import '@/modules/library/components/work-presentation.css';
type Row={id:number;title:string|null;code:string;status:string;pageCount:number|null;readingMinutes:number|null};
type Data={revision:number;ageRating:number|null;genres:string[];chapters:Row[]};
export function AdminPresentationEditor({comicId,disabled,onDirtyChange}:{comicId:number;disabled:boolean;onDirtyChange:(dirty:boolean)=>void}){
 const [data,setData]=useState<Data|null>(null),[age,setAge]=useState(''),[tags,setTags]=useState(''),[edits,setEdits]=useState<Record<number,{pages:string;minutes:string}>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[query,setQuery]=useState('');
 const lock=useRef(false);const router=useRouter();
 const dirty=!!data&&(age!==(data.ageRating===null?'':String(data.ageRating))||tags!==data.genres.join(', ')||Object.keys(edits).length>0);
 useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 async function load(){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{const r=await fetch(`/api/admin/catalog/comics/${comicId}/presentation`,{cache:'no-store'});if(!r.ok)throw Error();const d:Data=await r.json();setData(d);setAge(d.ageRating===null?'':String(d.ageRating));setTags(d.genres.join(', '));setEdits({});}catch{setMessage('Не удалось загрузить данные.');}finally{lock.current=false;setBusy(false);}}
 async function save(){if(lock.current||!data)return;lock.current=true;setBusy(true);setMessage('');try{
  const number=(v:string)=>v.trim()===''?null:Number(v);
  const changed=Object.entries(edits).map(([id,v])=>({id:Number(id),pageCount:number(v.pages),readingMinutes:number(v.minutes)}));
  const r=await fetch(`/api/admin/catalog/comics/${comicId}/presentation`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision,ageRating:age===''?null:Number(age),genres:tags.trim()?tags.split(',').map(x=>x.trim()):[],chapters:changed})});
  if(!r.ok){setMessage(r.status===409?'Данные изменены в другой вкладке. Ваш ввод сохранён; скопируйте его и загрузите актуальные данные.':'Не удалось сохранить. Проверьте поля и соединение.');return;}
  const response=await r.json();setData({...data,revision:response.revision,ageRating:age===''?null:Number(age),genres:tags.trim()?tags.split(',').map(x=>x.trim()):[],chapters:data.chapters.map(c=>{const e=edits[c.id];return e?{...c,pageCount:number(e.pages),readingMinutes:number(e.minutes)}:c;})});setEdits({});setMessage('Данные сохранены.');router.refresh();
 }catch{setMessage('Ответ не получен. Ваш ввод сохранён; перед повтором проверьте актуальные данные.');}finally{lock.current=false;setBusy(false);}}
 const control='w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2';
 return <details className="presentation-admin" onKeyDown={e=>{if(e.key==='Enter'&&e.target instanceof HTMLInputElement)e.preventDefault();}} onToggle={e=>{if(e.currentTarget.open&&!data&&!busy&&!message)void load();}}><summary>Возраст, жанры, страницы и время чтения</summary>
 <p>Необязательные сведения. Пустые поля не показываются читателям. Жанры разделяйте запятыми (до 10).</p>
 {data&&<><div className="presentation-admin-fields"><label>Возрастная маркировка<select className={control} value={age} disabled={disabled||busy} onChange={e=>setAge(e.target.value)}><option value="">Не указана</option>{[0,6,12,16,18].map(v=><option key={v} value={v}>{v}+</option>)}</select></label><label>Жанры<input className={control} value={tags} disabled={disabled||busy} maxLength={500} onChange={e=>setTags(e.target.value)}/></label></div>
 <label>Найти главу<input className={control} value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <div className="presentation-admin-chapters">{data.chapters.filter(c=>(c.code+' '+c.title).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).map(c=>{const value=edits[c.id]??{pages:c.pageCount===null?'':String(c.pageCount),minutes:c.readingMinutes===null?'':String(c.readingMinutes)};return <div key={c.id}><strong>{c.code} {c.title}{c.status==='ARCHIVED'?' · Архив':''}</strong>{(['pages','minutes'] as const).map(field=><label key={field}>{field==='pages'?'Страниц':'Примерное время, мин'}<input className={control} type="number" min={1} max={100000} step={1} value={value[field]} disabled={disabled||busy} onChange={e=>setEdits(old=>({...old,[c.id]:{...value,[field]:e.target.value}}))}/></label>)}</div>;})}</div>
 <button type="button" className="tea-outline" disabled={disabled||busy||!dirty} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить сведения'}</button></>}
 <button type="button" className="tea-text-action" disabled={disabled||busy} onClick={()=>{if(!dirty||window.confirm('Заменить несохранённый ввод актуальными данными?'))void load();}}>Загрузить актуальные данные</button>
 {message&&<p role="status">{message}</p>}{busy&&<p role="status">Обрабатываем данные…</p>}</details>;
}
