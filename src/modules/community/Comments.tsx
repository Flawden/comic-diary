"use client";
import {UserAvatar} from '@/shared/components/UserAvatar';
import "./community.css";
import { commentThreads } from "./thread-model";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/shared/components/ui";
import { REPORT_REASONS, type CommentPage, type PublicComment } from "./policy";
import { communityRequest, communityErrorMessage, CommunityRequestError } from "./client";

const empty: CommentPage = { items: [], nextCursor: null, visibleCount: 0 };
function SpoilerBody({ item }: { item: PublicComment }) {
  const [revealed, reveal] = useState(false);
  if (item.status !== "VISIBLE") return <p className="text-sm text-[var(--text-secondary)]">{item.status === "REMOVED_BY_AUTHOR" ? "Удалённый комментарий" : "Комментарий скрыт модератором"}</p>;
  return <div>
    {item.spoiler && <button type="button" className="tea-text-action mb-2" aria-expanded={revealed}
      onClick={() => reveal(v => !v)}>{revealed ? "Скрыть спойлер" : "Раскрыть спойлер"}</button>}
    {(!item.spoiler || revealed) && <p className="whitespace-pre-wrap text-sm leading-6" style={{ overflowWrap: "anywhere" }}>{item.body}</p>}
  </div>;
}

export function Comments({ comicId, chapterId = null, canWrite, loginHref, refreshToken }: {
  comicId: number; chapterId?: number | null; canWrite: boolean; loginHref: string; refreshToken: string;
}) {
  const heading = useId(), textId = useId();
  const base = `/api/community/comments?comicId=${comicId}${chapterId === null ? "" : `&chapterId=${chapterId}`}`;
  const [page, setPage] = useState<CommentPage>(empty), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [closed, setClosed] = useState(false);
  const [text, setText] = useState(""), [spoiler, setSpoiler] = useState(chapterId !== null);
  const [parentId, setParentId] = useState<number | null>(null), [posted, setPosted] = useState<PublicComment | null>(null);
  const [edit, setEdit] = useState<{ id: number; body: string; spoiler: boolean } | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null), [reportId, setReportId] = useState<number | null>(null);
  const [reason, setReason] = useState<string>("SPAM"), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  function fail(e: unknown) {
    setError(communityErrorMessage(e));
    if (e instanceof CommunityRequestError && e.status === 404) { setClosed(true); setPage(empty); setPosted(null); setEdit(null); }
  }
  useEffect(() => {
    const abort = new AbortController();
    // RSC refresh preserves useState: revalidate server visibility without remounting the draft.
    communityRequest<CommentPage>(base, "GET", undefined, abort.signal).then(data => {
      if (abort.signal.aborted) return;
      setPage(data); setClosed(false); setPosted(null); setError("");
    })
      .catch(e => { if (!abort.signal.aborted) fail(e); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [base, refreshToken]);

  async function refresh(more = false) {
    const result = await communityRequest<CommentPage>(base + (more && page.nextCursor ? `&cursor=${page.nextCursor}` : ""));
    setPage(old => ({ ...result, items: more ? [...old.items, ...result.items.filter(i => !old.items.some(o => o.id === i.id))] : result.items,
      replyPages: more ? { ...old.replyPages, ...result.replyPages } : result.replyPages }));
    setClosed(false); if (!more) setPosted(null); return result;
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { fail(e); } finally { lock.current = false; setBusy(false); }
  }
  const extras = posted && !page.items.some(i => i.id === posted.id) ? [posted] : [];
  const items = [...page.items, ...extras];
  const threads = commentThreads(items);
  const replyTargetLoaded = parentId === null || items.some(item => item.id === parentId && item.parentId === null && item.status === "VISIBLE");
  const loadedIds = new Set(items.map(item => item.id));
  function renderItem(item: PublicComment) {
    return <article key={item.id} id={`community-comment-${item.id}`} tabIndex={-1} data-comment={item.id} className={`community-comment${item.parentId === null ? "" : " community-comment--reply"}`}>
      <header className="community-comment-meta">
        <UserAvatar name={item.author} appearance={item.appearance}/>
        <strong className="text-[var(--text-primary)]" style={{ overflowWrap: "anywhere" }}>{item.author}</strong>
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ru-RU")}</time>
        {item.editedAt && <span>изменено</span>}{item.parentId && (loadedIds.has(item.parentId) ?
          <button type="button" className="tea-text-action" onClick={() => {
            const parent = document.getElementById(`community-comment-${item.parentId}`);
            parent?.focus(); parent?.scrollIntoView({ block: "center" });
          }}>Ответ на исходное сообщение</button> : <span>Ответ на более ранний комментарий</span>)}
      </header>
      <SpoilerBody key={`${item.id}-${item.status}-${item.editedAt}`} item={item} />
      {canWrite && item.status === "VISIBLE" && <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {item.parentId === null && <button type="button" className="tea-text-action" disabled={busy} onClick={() => { setParentId(item.id); requestAnimationFrame(() => textArea.current?.focus()); }}>Ответить</button>}
        {item.mine ? <>
          <button type="button" className="tea-text-action" disabled={busy} onClick={() => setEdit({ id: item.id, body: item.body ?? "", spoiler: item.spoiler })}>Редактировать</button>
          <button type="button" className="tea-text-action" disabled={busy} onClick={() => setRemoveId(item.id)}>Удалить</button>
        </> : <button type="button" className="tea-text-action" disabled={busy} onClick={() => { setReportId(item.id); setNote(""); }}>Пожаловаться</button>}
      </div>}
      {removeId === item.id && <div role="group" aria-label="Подтверждение удаления" className="mt-3 space-y-2">
        <p className="text-sm">Удалить текст комментария? Ответы сохранятся.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void perform(async () => {
          const result = await communityRequest<{ item: PublicComment }>(`/api/community/comments/${item.id}`, "DELETE");
          setPage(old => ({ ...old, items: old.items.map(i => i.id === result.item.id ? result.item : i), visibleCount: Math.max(0, old.visibleCount - 1) }));
          setRemoveId(null); setPosted(null); setNotice("Комментарий удалён.");

        })}>Подтвердить удаление</Button><button type="button" disabled={busy} className="tea-text-action" onClick={() => setRemoveId(null)}>Отмена</button></div>
      </div>}
      {item.status === "VISIBLE" && edit?.id === item.id && <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void perform(async () => {
        const result = await communityRequest<{ item: PublicComment }>(`/api/community/comments/${item.id}`, "PATCH", { body: edit.body, spoiler: edit.spoiler });
        setPage(old => ({ ...old, items: old.items.map(i => i.id === result.item.id ? result.item : i) }));
        setEdit(null); setPosted(null); setNotice("Изменения сохранены.");
      }); }}>
        <label className="block text-sm">Изменить текст<textarea aria-label="Изменить текст" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3" value={edit.body} maxLength={4000} rows={4} onChange={e => setEdit({ ...edit, body: e.target.value })}/></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={edit.spoiler} onChange={e => setEdit({ ...edit, spoiler: e.target.checked })}/>Содержит спойлеры</label>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>Сохранить изменения</Button><button type="button" className="tea-text-action" onClick={() => setEdit(null)}>Отмена</button></div>
      </form>}
      {reportId === item.id && <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void perform(async () => {
        await communityRequest(`/api/community/comments/${item.id}/reports`, "POST", { reason, note }); setReportId(null); setNotice("Жалоба принята. Её рассмотрит администратор.");
      }); }}>
        <label className="block text-sm">Причина<select aria-label="Причина жалобы" value={reason} onChange={e => setReason(e.target.value)} className="ml-2 max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
          {REPORT_REASONS.map((r, i) => <option key={r} value={r}>{["Спам", "Оскорбление", "Спойлер", "Другое"][i]}</option>)}</select></label>
        <label className="block text-sm">Пояснение (необязательно)<textarea aria-label="Пояснение к жалобе" value={note} onChange={e => setNote(e.target.value)} maxLength={600} rows={2} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"/></label>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>Отправить жалобу</Button><button type="button" className="tea-text-action" onClick={() => setReportId(null)}>Отмена</button></div>
      </form>}
    </article>;
  }
  const composer = !closed && (canWrite ? <form className="community-composer space-y-3" onSubmit={e => { e.preventDefault(); void perform(async () => {
      const payload = { comicId, chapterId, parentId, body: text, spoiler };
      const fingerprint = JSON.stringify(payload);
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
      const result = await communityRequest<{ item: PublicComment; replay: boolean }>("/api/community/comments", "POST", { ...payload, requestId: retry.current.requestId });
      retry.current = null; setText(""); setParentId(null); setPosted(result.item); setNotice("Комментарий опубликован.");
      if (result.item.parentId !== null) {
        const id = result.item.parentId;
        setPosted(null);
        setPage(old => ({ ...old, items: [...old.items.filter(i => i.id !== result.item.id), result.item],
          visibleCount: old.visibleCount + (!old.items.some(item => item.id === result.item.id) && result.item.status === "VISIBLE" ? 1 : 0),
          replyPages: { ...old.replyPages, [id]: { total: (old.replyPages?.[id]?.total ?? 0) + (old.items.some(item => item.id === result.item.id) ? 0 : 1),
            nextCursor: old.replyPages?.[id]?.nextCursor ?? null } } }));
        return;
      }
      try { const fresh = await refresh(); if (!fresh.items.some(i => i.id === result.item.id)) setPosted(result.item); }
      catch (e) { fail(e); }
    }); }}>
      {parentId !== null && <p className="text-sm">Ответ: {items.find(item => item.id === parentId)?.author ?? "выбранный комментарий"}. <button className="tea-text-action" type="button" onClick={() => { setParentId(null); requestAnimationFrame(() => textArea.current?.focus()); }}>Отменить ответ</button></p>}
      {!replyTargetLoaded && <p role="alert">Выбранная ветка не загружена. Загрузите её снова или отмените ответ; текст сохранён.</p>}
      <label className="block text-sm font-medium" htmlFor={textId}>{parentId === null ? "Ваш комментарий" : "Ваш ответ"}</label>
      <textarea id={textId} ref={textArea} value={text} rows={4} maxLength={4000} disabled={busy} onChange={e => setText(e.target.value)} className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3"/>
      <p className="text-xs text-[var(--text-secondary)]">{Array.from(text).length} / 2000 · Открытое обсуждение, не личная заметка.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={spoiler} disabled={busy} onChange={e => setSpoiler(e.target.checked)}/>Содержит спойлеры</label>
      <Button type="submit" disabled={busy || !replyTargetLoaded || !text.trim() || Array.from(text).length > 2000}>{busy ? "Сохраняем…" : "Опубликовать"}</Button>
    </form> : <p className="text-sm"><Link className="tea-text-action" href={loginHref}>Войдите</Link>, чтобы написать, ответить или пожаловаться.</p>);
  return <section aria-labelledby={heading} data-discussion={chapterId === null ? "work" : "chapter"} className="community-section">
    <p className="community-kicker">Читательская беседа</p>
    <h2 id={heading} className="community-heading">{chapterId === null ? "Обсуждение произведения" : "Обсуждение главы"}</h2>
    {chapterId !== null && <p className="text-sm text-[var(--text-secondary)]">В обсуждении главы возможны спойлеры. Новые сообщения по умолчанию скрыты.</p>}
    {loading ? <p role="status">Загрузка обсуждения…</p> : !closed && <p className="text-sm text-[var(--text-secondary)]">Видимых сообщений: {page.visibleCount} (включая ответы)</p>}
    {error && <p role="alert" className="text-sm">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <button type="button" className="tea-text-action text-sm" disabled={busy} onClick={() => void perform(async () => { await refresh(); setLoading(false); })}>Обновить обсуждение</button>
    {!loading && !closed && !error && items.length === 0 && <p>Пока нет комментариев. Начните обсуждение.</p>}
    <div className="community-threads">{threads.map(({ root, replies }) => <div key={root.id} data-thread={root.id} className="community-thread">
      {renderItem(root)}
      {(replies.length > 0 || page.replyPages?.[root.id]?.nextCursor || parentId === root.id) && <div className="community-replies" role="group" aria-label={`Ответы: ${root.author}`}>
        {replies.map(renderItem)}
        {page.replyPages?.[root.id]?.nextCursor && <button type="button" className="tea-text-action community-more-replies" disabled={busy} onClick={() => void perform(async () => {
          const result = await communityRequest<CommentPage>(base + `&parentId=${root.id}&cursor=${page.replyPages![root.id].nextCursor}`);
          setPage(old => ({ ...old, visibleCount: result.visibleCount,
            items: [...old.items, ...result.items.filter(item => !old.items.some(prior => prior.id === item.id))],
            replyPages: { ...old.replyPages, ...result.replyPages } }));
        })}>Показать ещё ответы</button>}
        {parentId === root.id && replyTargetLoaded ? composer : null}
      </div>}
    </div>)}</div>
    {page.nextCursor && <Button variant="secondary" disabled={busy} onClick={() => void perform(async () => { await refresh(true); })}>Показать ещё комментарии</Button>}
    {parentId === null || !replyTargetLoaded ? composer : null}
  </section>;
}
