"use client";
import {UserAvatar} from '@/shared/components/UserAvatar';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ReviewDialog} from './ReviewDialog';
import {reviewCriteria,reviewAverage,type Review,type ReviewPage,type ReviewFilter} from './review-policy';
import {formatRating} from '@/modules/library/ratings/community-rating';
import './reviews.css';
import { CategoryIcon } from '@/shared/components/RatingIcon';
import { CommunityRatings } from '@/modules/library/components/CommunityRatings';
type Props={ratings?:import('@/modules/library/ratings/community-rating').CommunityRatings;comicId:number;chapterId?:number;canWrite:boolean;loginHref:string;refreshToken?:string;canModerate?:boolean};
const countLabel=(n:number)=>n+' '+(({one:'отзыв',few:'отзыва',many:'отзывов',other:'отзывов'} as Record<string,string>)[new Intl.PluralRules('ru').select(n)]??'отзывов');
const date=(value:string)=>new Date(value).toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'});
function failure(error:unknown){const status=error instanceof ReviewRequestError?error.status:0;return status===409?'Отзыв уже изменился. Обновите обсуждение и проверьте сохранённую версию. Ваш текст остался в форме.':status===429?'Слишком много действий. Подождите немного и повторите — введённый текст сохранён в окне.':status===401?'Сессия завершилась. Войдите в аккаунт заново.':'Не удалось выполнить действие. Повторите попытку.';}
class ReviewRequestError extends Error{constructor(readonly status:number){super('review request failed');}}
async function request<T>(url:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});if(!response.ok)throw new ReviewRequestError(response.status);return response.json();}
export function ReviewStars({value}:{value:number}){return <span className="reviews-stars" aria-label={value+' из 5'}><span aria-hidden="true">{'★'.repeat(Math.round(value))}<span className="reviews-stars-empty">{'☆'.repeat(5-Math.round(value))}</span></span></span>;}
type HistoricalPage={items:{id:number;mine:boolean;author:string;appearance?:import('@/modules/appearance/policy').PublicAppearance;body:string|null;spoiler:boolean;status:string;createdAt:string}[];nextCursor:string|null};
function HistoricalComments({comicId,chapterId}:Props){
 const [page,setPage]=useState<HistoricalPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revealed,setRevealed]=useState<number[]>([]),[removing,setRemoving]=useState<number|null>(null);const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function load(cursor:string|null=null){if(loading)return;const abort=new AbortController();active.current=abort;setLoading(true);setError('');const q=new URLSearchParams({comicId:String(comicId)});if(chapterId)q.set('chapterId',String(chapterId));if(cursor)q.set('cursor',cursor);
  try{const result=await request<HistoricalPage>('/api/community/reviews/history?'+q,'GET',undefined,abort.signal);if(!abort.signal.aborted)setPage(old=>cursor&&old?{...result,items:[...old.items,...result.items]}:result);}catch(e){if(!abort.signal.aborted)setError(failure(e));}finally{if(!abort.signal.aborted)setLoading(false);}}
 return <details className="reviews-history" onToggle={e=>{if(e.currentTarget.open&&!page&&!loading&&!error)void load();}}><summary>Ранее опубликованные комментарии</summary><p className="reviews-muted">Сохранённый архив сообщений. Новые впечатления публикуются как отзывы выше.</p>
  {page?.items.map(item=><article key={item.id}><header><UserAvatar name={item.author} appearance={item.appearance}/><strong>{item.author}</strong><time dateTime={item.createdAt}>{date(item.createdAt)}</time></header>{item.mine&&item.status==='VISIBLE'&&<button className="reviews-link" type="button" onClick={()=>setRemoving(item.id)}>Удалить сообщение</button>}{removing===item.id&&<div className="reviews-discard"><p>Удалить ваше архивное сообщение?</p><button type="button" className="reviews-button" onClick={async()=>{try{await request('/api/community/comments/'+item.id,'DELETE');setRemoving(null);await load();}catch(e){setError(failure(e));}}}>Подтвердить удаление</button><button type="button" className="reviews-button reviews-button--quiet" onClick={()=>setRemoving(null)}>Отмена</button></div>}
   {item.body?item.spoiler&&!revealed.includes(item.id)?<button type="button" className="reviews-link" onClick={()=>setRevealed(x=>[...x,item.id])}>Показать текст со спойлерами</button>:<p className="reviews-card-body">{item.body}</p>:<p className="reviews-muted">{item.status==='REMOVED_BY_AUTHOR'?'Комментарий удалён автором':'Комментарий скрыт модератором'}</p>}</article>)}
  {loading&&<p role="status">Загружаем архив…</p>}{error&&<p role="alert">{error}</p>}{page&&!page.items.length&&<p className="reviews-muted">Архив комментариев пуст.</p>}
  {(page?.nextCursor||error)&&<button className="reviews-button reviews-button--quiet" type="button" disabled={loading} onClick={()=>void load(page?.nextCursor??null)}>Показать ещё</button>}
 </details>;
}
function Editor({props,own,onClose,onSaved}:{props:Props;own:Review|null;onClose:()=>void;onSaved:()=>Promise<void>}){
 // A background list refresh must not advance the version of an open draft.
 // Keep its text, dirty baseline and optimistic concurrency token together.
 const [original]=useState(own);
 const n=props.chapterId?1:5;const [scores,setScores]=useState(original?.scores??Array(n).fill(0));const [body,setBody]=useState(original?.body??'');
 const [spoiler,setSpoiler]=useState(original?.spoiler??!!props.chapterId);const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const initial=JSON.stringify([original?.scores??Array(n).fill(0),original?.body??'',original?.spoiler??!!props.chapterId]);
 const dirty=JSON.stringify([scores,body,spoiler])!==initial;
 async function save(e:React.FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await request('/api/community/reviews','PUT',{comicId:props.comicId,chapterId:props.chapterId??null,scores,body,spoiler,version:original?.version??null});
   await onSaved();onClose();
  }catch(e){setError(failure(e));}finally{lock.current=false;setBusy(false);}}
 return <ReviewDialog title={original?'Редактировать отзыв':props.chapterId?'Ваша оценка главы':'Оценить и оставить отзыв'} onClose={onClose} dirty={dirty} busy={busy}>
  <p className="reviews-muted">Публичный отзыв. Личные заметки и оценки остаются в вашем дневнике.</p>
  <form onSubmit={save} className="reviews-editor"><fieldset disabled={busy} className="reviews-editor-fields">
   {scores.map((value,i)=><fieldset className="reviews-score-choice" key={i}><legend>{n===1?'Ваша оценка':reviewCriteria[i][1]}</legend>
    <div>{[1,2,3,4,5].map(rating=><label key={rating}><input type="radio" required name={'review-score-'+i} value={rating} checked={value===rating} onChange={()=>setScores(old=>old.map((x,j)=>j===i?rating:x))}/><span aria-hidden="true" data-selected={rating<=value}>★</span><span className="sr-only">{rating} из 5 — {n===1?'глава':reviewCriteria[i][1]}</span></label>)}</div></fieldset>)}
   <label className="reviews-text-label">Что вы думаете {props.chapterId?'об этой главе':'об этой истории'}? <small>Необязательно · до 2000 символов</small>
    <textarea maxLength={2000} rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="Поделитесь впечатлениями…"/></label>
   <label className="reviews-spoiler-choice"><input type="checkbox" checked={spoiler} onChange={e=>setSpoiler(e.target.checked)}/>В тексте есть спойлеры</label>
   {error&&<p role="alert" className="reviews-error">{error}</p>}
   <button type="submit" className="reviews-button" disabled={scores.some(x=>x<1)||busy}>{busy?'Сохраняем…':'Сохранить отзыв'}</button>
  </fieldset></form>
 </ReviewDialog>;
}
function Card({review,canWrite,onEdit,onDelete,onReaction,pending,canModerate,onModerate}:{review:Review;canWrite:boolean;canModerate:boolean;onModerate:(action:string,reason:string)=>void;onEdit:()=>void;onDelete:()=>void;onReaction:(value:number)=>void;pending:boolean}){
 const [revealed,setRevealed]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[moderating,setModerating]=useState(false),[reason,setReason]=useState('');const average=reviewAverage(review.scores);
 return <article className={'reviews-card'+(review.mine?' reviews-card--mine':'')} data-review-id={review.id}>
  <header><UserAvatar name={review.author} appearance={review.appearance}/><div className="reviews-card-author"><strong>{review.mine?'Вы':review.author}</strong><time dateTime={review.updatedAt}>{date(review.updatedAt)}</time></div><span className="reviews-card-score"><ReviewStars value={average}/><b>{average.toLocaleString('ru',{maximumFractionDigits:1})}</b></span></header>
  {review.scores.length===5&&<dl className="reviews-card-criteria">{review.scores.map((value,i)=><div key={i}><dt><CategoryIcon index={i}/>{reviewCriteria[i][1]}</dt><dd>{value}</dd></div>)}</dl>}
  {review.body?review.spoiler&&!revealed?<button type="button" className="reviews-spoiler" onClick={()=>setRevealed(true)}>Показать текст со спойлерами</button>:<p className="reviews-card-body">{review.body}</p>:<p className="reviews-muted reviews-no-text">Оценка без текста</p>}
  {review.hidden&&<p className="reviews-error">Скрыто модератором. Этот текст не виден другим читателям.</p>}
  <footer>{review.mine?<><span className="reviews-own-label">Ваш отзыв</span><button type="button" className="reviews-link" onClick={onEdit} disabled={pending||review.hidden}>Редактировать</button><button type="button" className="reviews-link" onClick={()=>setConfirmDelete(v=>!v)} disabled={pending}>Удалить</button></>:<>
   <button type="button" className="reviews-reaction" aria-label="Полезный отзыв" aria-pressed={review.reaction===1} disabled={!canWrite||pending||review.hidden} onClick={()=>onReaction(review.reaction===1?0:1)}>👍 <span>{review.up}</span></button>
   <button type="button" className="reviews-reaction" aria-label="Не согласен с отзывом" aria-pressed={review.reaction===-1} disabled={!canWrite||pending||review.hidden} onClick={()=>onReaction(review.reaction===-1?0:-1)}>👎 <span>{review.down}</span></button></>}
   {canModerate&&<button type="button" className="reviews-link" disabled={pending} onClick={()=>setModerating(x=>!x)}>{review.hidden?'Восстановить отзыв':'Скрыть отзыв'}</button>}
  </footer>
  {moderating&&<form className="reviews-discard" onSubmit={e=>{e.preventDefault();onModerate(review.hidden?'RESTORE':'HIDE',reason);setModerating(false);}}><label className="reviews-text-label">Причина действия<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={450} required rows={2}/></label><button type="submit" className="reviews-button" disabled={pending}>{review.hidden?'Подтвердить восстановление':'Подтвердить скрытие'}</button></form>}
  {confirmDelete&&<div className="reviews-discard"><p>Удалить ваш публичный отзыв? Личный дневник сохранится.</p><button className="reviews-button" type="button" disabled={pending} onClick={onDelete}>Удалить отзыв</button><button className="reviews-button reviews-button--quiet" type="button" onClick={()=>setConfirmDelete(false)}>Отмена</button></div>}
 </article>;
}
export function Reviews(props:Props){
 const router=useRouter();const [page,setPage]=useState<ReviewPage|null>(null),[filter,setFilter]=useState<ReviewFilter>('all'),[order,setOrder]=useState<'new'|'old'>('new');
 const [editor,setEditor]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const active=useRef<AbortController|null>(null),mutationLock=useRef(false);const {comicId,chapterId,refreshToken}=props;
 const load=useCallback(async(cursor:string|null=null)=>{
  active.current?.abort();const abort=new AbortController();active.current=abort;
  const q=new URLSearchParams({comicId:String(comicId),filter,order});if(chapterId)q.set('chapterId',String(chapterId));if(cursor)q.set('cursor',cursor);
  try{const result=await request<ReviewPage>('/api/community/reviews?'+q,'GET',undefined,abort.signal);if(!abort.signal.aborted){setError('');setPage(old=>cursor&&old?{...result,items:[...old.items,...result.items.filter(x=>!old.items.some(y=>x.id===y.id))]}:result);}}
  catch(e){if(!abort.signal.aborted){setError(failure(e));throw e;}}
  finally{if(active.current===abort)setLoading(false);}
 },[comicId,chapterId,filter,order]);
 useEffect(()=>{const task=window.setTimeout(()=>{void load().catch(()=>{});},0);return()=>{window.clearTimeout(task);active.current?.abort();};},[load,refreshToken]);
 async function action(task:()=>Promise<unknown>){if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');try{await task();await load();router.refresh();}catch(e){setError(failure(e));}finally{setBusy(false);mutationLock.current=false;}}
 const saved=async()=>{await load();setFilter('all');setOrder('new');setNotice('Отзыв сохранён');router.refresh();};
 const mineMatches=page?.mine&&(filter==='hidden'?page.mine.hidden:page.mine.hidden||filter==='all'||(filter==='text'?!!page.mine.body:!page.mine.body));
 const items=page?(mineMatches?[page.mine!,...page.items.filter(x=>x.id!==page.mine!.id)]:page.items):[];
 return <section className="reviews" aria-label={chapterId?'Отзывы о главе':'Отзывы и комментарии'} data-reviews-target={chapterId??'work'}>
  {!chapterId&&props.ratings&&<CommunityRatings ratings={props.ratings} personalAverage={page?.mine?reviewAverage(page.mine.scores):null}
    personalHidden={page?.mine?.hidden??false} onEdit={props.canWrite&&page!==null?()=>setEditor(true):undefined} loginHref={props.canWrite?undefined:props.loginHref}/>}
  <header className="reviews-heading"><div><p className="reviews-kicker">Мнение читателей</p><h2>{chapterId?'Отзывы о главе':'Отзывы и комментарии'} <span>{page?countLabel(page.total):'…'}</span></h2></div>
   {props.canWrite?<button className="reviews-button" type="button" disabled={(loading&&!page)||page?.mine?.hidden} onClick={()=>setEditor(true)}>{page?.mine?.hidden?'Ваш отзыв скрыт':page?.mine?'Редактировать свой отзыв':'Оценить и оставить отзыв'}</button>:<a className="reviews-button" href={props.loginHref}>Войти и оставить отзыв</a>}</header>
  <div className="reviews-toolbar"><div role="group" aria-label="Фильтр отзывов">{([['all','Все отзывы'],['text','С текстом'],['scores','Только оценки']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} onClick={()=>{if(id!==filter){setLoading(true);setFilter(id);}}}>{label}</button>)}{props.canModerate&&<button type="button" aria-pressed={filter==='hidden'} onClick={()=>{setLoading(true);setFilter('hidden');}}>Скрытые</button>}</div>
   <label><span className="sr-only">Порядок отзывов</span><select value={order} onChange={e=>{setLoading(true);setOrder(e.target.value as 'new'|'old');}}><option value="new">Сначала новые</option><option value="old">Сначала ранние</option></select></label></div>
  {notice&&<p role="status" className="reviews-feedback">{notice}</p>}{error&&<p role="alert" className="reviews-error">{error} <button type="button" className="reviews-link" onClick={()=>void load().catch(()=>{})}>Обновить отзывы</button></p>}
  <div className="reviews-layout"><div className="reviews-list" aria-busy={loading}>
   {loading&&!page&&<p role="status">Загружаем отзывы…</p>}
   {items.map(review=><Card key={review.id} review={review} canWrite={props.canWrite} pending={busy} canModerate={props.canModerate??false} onModerate={(actionName,reason)=>void action(()=>request('/api/community/reviews/'+review.id+'/moderation','PUT',{action:actionName,reason}))} onEdit={()=>setEditor(true)} onDelete={()=>void action(()=>request('/api/community/reviews/'+review.id,'DELETE',{version:review.version}))} onReaction={value=>void action(()=>request('/api/community/reviews/'+review.id+'/reaction','PUT',{value}))}/>)}
   {page&&!items.length&&!loading&&!error&&<div className="reviews-empty"><span aria-hidden="true">✧</span><h3>{filter==='all'?'Здесь начинается разговор об истории':'Таких отзывов пока нет'}</h3><p>{filter==='all'?'Первая оценка и несколько слов помогут другим читателям выбрать свою историю.':'Попробуйте другой фильтр.'}</p></div>}
   {page?.nextCursor&&<button type="button" className="reviews-button reviews-button--quiet" disabled={loading} onClick={()=>void load(page.nextCursor).catch(()=>{})}>{loading?'Загружаем…':'Показать ещё отзывы'}</button>}
  </div>{!chapterId&&page?.mine&&<aside className="reviews-own-summary" aria-label="Ваша оценка и отзыв"><p className="reviews-kicker">Ваше впечатление</p><h3>Ваша оценка</h3><p className="reviews-own-average">{formatRating(reviewAverage(page.mine.scores))}</p><dl>{page.mine.scores.map((value,i)=><div key={i}><dt><CategoryIcon index={i}/>{reviewCriteria[i][1]}</dt><dd><ReviewStars value={value}/><b>{value}</b></dd></div>)}</dl><p className="reviews-muted">Изменено {date(page.mine.updatedAt)}</p><button type="button" className="reviews-button reviews-button--quiet" disabled={page.mine.hidden} onClick={()=>setEditor(true)}>Редактировать отзыв</button></aside>}</div>
  {editor&&<Editor props={props} own={page?.mine??null} onClose={()=>setEditor(false)} onSaved={saved}/>}
  <HistoricalComments comicId={props.comicId} chapterId={props.chapterId} canWrite={false} loginHref={props.loginHref}/>
 </section>;
}
