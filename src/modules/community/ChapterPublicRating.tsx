'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ReviewDialog} from './ReviewDialog';
import type {OwnChapterRating} from './chapter-rating-policy';
import './reviews.css';

export function ChapterPublicRating({comicId,chapterId,title,onClose}:{comicId:number;chapterId:number;title:string;onClose:()=>void}){
 const [data,setData]=useState<OwnChapterRating|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),router=useRouter();
 useEffect(()=>{const abort=new AbortController();void fetch(`/api/community/chapter-rating?comicId=${comicId}&chapterId=${chapterId}`,{cache:'no-store',signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const value:OwnChapterRating=await r.json();if(!abort.signal.aborted)setData(value);}).catch(()=>{if(!abort.signal.aborted)setError('Не удалось загрузить оценку. Закройте окно и попробуйте снова.');});return()=>abort.abort();},[comicId,chapterId]);
 async function save(rating:number|null){
  if(lock.current||!data)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/community/chapter-rating',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({comicId,chapterId,rating,version:data.version})});
   if(!r.ok){setError(r.status===409?'Оценка изменена в другой вкладке. Закройте окно и откройте его заново.':r.status===429?'Слишком частые изменения. Подождите и попробуйте позже.':'Не удалось сохранить оценку.');return;}
   const saved=await r.json();setData({...data,rating,version:saved.version??(data.version===null?null:data.version+1)});setNotice(rating===null?'Оценка убрана.':'Оценка сохранена.');router.refresh();
  }catch{setError('Ответ не получен. Перед повтором закройте окно и проверьте актуальную оценку.');}
  finally{setBusy(false);lock.current=false;}
 }
 return <ReviewDialog title={'Оценка главы — '+title} onClose={onClose} busy={busy} closeLabel="Закрыть окно оценки главы">
  {!data&&!error&&<p role="status">Загружаем оценку…</p>}
  {data&&<><p className="reviews-muted">Одна оценка от 1 до 5. Она учитывается в рейтинге главы. Личная оценка дневника сохраняется отдельно.</p>
   {data.hidden&&<p role="status">Оценка скрыта модератором и не учитывается в рейтинге.</p>}
   <div className="wd-stars" role="group" aria-label="Ваша оценка главы">{[1,2,3,4,5].map(n=><button type="button" key={n} aria-label={n+' из 5'} aria-pressed={data.rating===n} disabled={busy||data.hidden} onClick={()=>void save(n)}>{n<=(data.rating??0)?'★':'☆'}</button>)}</div>
   {data.rating!==null&&<button className="reviews-button reviews-button--quiet" type="button" disabled={busy} onClick={()=>void save(null)}>Убрать оценку</button>}</>}
  {busy&&<p role="status">Сохраняем…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </ReviewDialog>;
}
