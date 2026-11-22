"use client";
import {UserAvatar} from '@/shared/components/UserAvatar';
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/shared/components/ui";
import { communityRequest, communityErrorMessage, CommunityRequestError } from "@/modules/community/client";
import type { ModerationPage } from "@/modules/community/service";
type Decision = { action: string; commentId?: number; reportId?: number; userId?: number };
const labels: Record<string, string> = { HIDE: "Скрыть", RESTORE: "Восстановить", RESOLVE: "Закрыть жалобу",
  REJECT: "Отклонить жалобу", RESTRICT: "Ограничить публикации", UNRESTRICT: "Снять ограничение" };

export function Moderation({ refreshToken }: { refreshToken: string }) {
  const [status, setStatus] = useState("OPEN"), [page, setPage] = useState<ModerationPage | null>(null);
  const [reviewId, setReviewId] = useState(""), [reviewFilter, setReviewFilter] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null), [reason, setReason] = useState(""), [until, setUntil] = useState("");
  const lock = useRef(false), reasonRef = useRef<HTMLTextAreaElement>(null);
  const base = `/api/admin/community/comments?status=${status}${reviewFilter ? `&reviewId=${reviewFilter}` : ""}`;
  useEffect(() => {
    const abort = new AbortController();
    communityRequest<ModerationPage>(base, "GET", undefined, abort.signal).then(data => { if (!abort.signal.aborted) { setPage(data); setError(""); } })
      .catch(e => { if (!abort.signal.aborted) { setPage(null); setError(communityErrorMessage(e)); } });
    return () => abort.abort();
  }, [base, refreshToken]);
  async function refresh(more = false) {
    const data = await communityRequest<ModerationPage>(base + (more && page?.nextCursor ? `&cursor=${page.nextCursor}` : ""));
    setPage(old => ({ ...data, items: more ? [...(old?.items ?? []), ...data.items] : data.items }));
  }
  async function moreAudit() {
    if (!page?.nextAuditCursor) return;
    const data = await communityRequest<ModerationPage>(base + `&auditCursor=${page.nextAuditCursor}`);
    setPage(old => old ? { ...old, audit: [...old.audit, ...data.audit], nextAuditCursor: data.nextAuditCursor } : data);
  }
  function choose(value: Decision) {
    setDecision(value); setReason("");
    setUntil("");
    requestAnimationFrame(() => reasonRef.current?.focus());
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) {
      if (e instanceof CommunityRequestError && [401, 403, 404].includes(e.status)) { setPage(null); setDecision(null); }
      setError(communityErrorMessage(e));
    } finally { lock.current = false; setBusy(false); }
  }
  return <div className="mt-5 min-w-0 space-y-5">
    <div className="flex flex-wrap items-center gap-3"><label>Жалобы<select className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2" value={status} onChange={e => { setPage(null); setStatus(e.target.value); setDecision(null); }}>
      <option value="OPEN">Открытые</option><option value="RESOLVED">Закрытые</option><option value="REJECTED">Отклонённые</option><option value="ALL">Все</option>
    </select></label><button type="button" className="tea-text-action" disabled={busy} onClick={() => void perform(() => refresh())}>Обновить очередь</button></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {decision && <form aria-label="Подтверждение модерации" className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" onSubmit={e => { e.preventDefault(); void perform(async () => {
      await communityRequest("/api/admin/community/comments", "POST", { ...decision, reason,
        ...(decision.action === "RESTRICT" ? { until: new Date(until).toISOString() } : {}) });
      setDecision(null); await refresh(); setNotice("Решение сохранено. Событие записано в аудит.");
    }); }}>
      <h2 className="font-semibold">Подтвердить: {labels[decision.action]}</h2>
      <label className="block">Причина решения<textarea ref={reasonRef} value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000} required className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"/></label>
      {decision.action === "RESTRICT" && <label className="block">Ограничить до (не более 30 дней)<input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} required className="mt-1 block max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"/></label>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !reason.trim()}>Подтвердить решение</Button><button type="button" disabled={busy} className="tea-text-action" onClick={() => setDecision(null)}>Отмена</button></div>
    </form>}
    {!page && !error && <p role="status">Загрузка очереди…</p>}
    {page && page.items.length === 0 && <p>Жалоб в выбранном разделе нет.</p>}
    {page?.items.map(item => <article key={item.id} data-moderation-report={item.id} className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ overflowWrap: "anywhere" }}>
      <h2 className="font-semibold"><Link className="tea-text-action" href={`/comics/${item.slug}${item.chapterId === null ? "" : "#chapters"}`}>{item.title}</Link>{item.chapterId !== null && <span> · обсуждение главы</span>}</h2>
      <p className="text-sm"><UserAvatar name={item.author} appearance={item.appearance}/> Автор: {item.author} · {new Date(item.createdAt).toLocaleString("ru-RU")}</p>
      <p className="text-sm">Причина: {item.reason} · Жалоба: {item.status} · Сообщение: {item.commentStatus}</p>
      {item.note && <p className="whitespace-pre-wrap text-sm">Пояснение: {item.note}</p>}
      {item.body === null ? <p>Удалённый комментарий</p> : <details><summary className="cursor-pointer">Показать текст сообщения</summary><p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p></details>}
      {item.blockedUntil && <p className="text-sm">Публикации автора ограничены до {new Date(item.blockedUntil).toLocaleString("ru-RU")}</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        {item.commentStatus === "VISIBLE" && <button className="tea-text-action" disabled={busy} onClick={() => choose({ action: "HIDE", commentId: item.commentId })}>Скрыть</button>}
        {item.commentStatus === "HIDDEN_BY_MODERATOR" && <button className="tea-text-action" disabled={busy} onClick={() => choose({ action: "RESTORE", commentId: item.commentId })}>Восстановить</button>}
        {item.status === "OPEN" && <><button className="tea-text-action" disabled={busy} onClick={() => choose({ action: "RESOLVE", reportId: item.id })}>Закрыть жалобу</button><button className="tea-text-action" disabled={busy} onClick={() => choose({ action: "REJECT", reportId: item.id })}>Отклонить жалобу</button></>}
        {item.authorUserId !== null && <><button className="tea-text-action" disabled={busy} onClick={() => choose({ action: "RESTRICT", userId: item.authorUserId! })}>Ограничить публикации</button><button className="tea-text-action" disabled={busy} onClick={() => choose({ action: "UNRESTRICT", userId: item.authorUserId! })}>Снять ограничение</button></>}
      </div>
    </article>)}
    {page?.nextCursor && <Button variant="secondary" disabled={busy} onClick={() => void perform(() => refresh(true))}>Следующие 20 жалоб</Button>}
    {page && <section aria-label="Аудит модерации" className="space-y-2"><h2 className="text-lg font-semibold">Последние события модерации</h2>
      <form className="flex flex-wrap items-center gap-3" onSubmit={e => { e.preventDefault(); setPage(null); setReviewFilter(reviewId); }}>
        <label>ID отзыва<input type="number" min="1" step="1" value={reviewId} onChange={e => setReviewId(e.target.value)} className="ml-2 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"/></label>
        <button type="submit" className="tea-text-action" disabled={busy || reviewId === reviewFilter}>Показать историю отзыва</button>
      </form>
      {page.audit.length === 0 ? <p className="text-sm">Событий пока нет.</p> : <ul className="space-y-2">{page.audit.map(event => <li key={event.id} className="break-words text-sm">{new Date(event.createdAt).toLocaleString("ru-RU")} · {event.action} · Администратор #{event.actorUserId ?? "удалён"}{event.reviewId !== null && ` · Отзыв #${event.reviewId}`} · {event.reason}</li>)}</ul>}
      {page.nextAuditCursor && <Button variant="secondary" disabled={busy} onClick={() => void perform(moreAudit)}>Следующие 20 событий</Button>}
    </section>}
  </div>;
}
