"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CoverImage } from "@/shared/components/media";
import { Button, Badge } from "@/shared/components/ui";
import type { UpdatesChapter, UpdatesKind, UpdatesTitle } from "../queries/get-reading-updates";

type MarkAction = "read" | "unread" | "read-through";
async function mark(comicId: number, chapterId: number, action: MarkAction) {
  const body = new FormData();
  body.set("comicId", String(comicId)); body.set("chapterId", String(chapterId));
  body.set("intent", "chapter-reading"); body.set("action", action);
  const response = await fetch("/api/library/reading-state", { method: "POST", headers: { Accept: "application/json" }, body });
  if (!response.ok) throw new Error("Не удалось сохранить отметку. Проверьте соединение и вход в аккаунт.");
}
function sourceUrl(value: string | null) {
  try { if (value && ["http:", "https:"].includes(new URL(value).protocol)) return value; } catch {}
  return null;
}

export function ReadingUpdatesList({ titles, kind }: { titles: UpdatesTitle[]; kind: UpdatesKind }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [last, setLast] = useState<{ comicId: number; chapterId: number } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);
  async function undo() {
    if (!last || undoBusy) return;
    setUndoBusy(true);
    try { await mark(last.comicId, last.chapterId, "unread"); setLast(null); setNotice("Отметка снята."); setUndoVersion((v) => v + 1); router.refresh(); }
    catch (e) { setNotice((e as Error).message); }
    finally { setUndoBusy(false); }
  }
  return <>
    <div role="status" aria-live="polite" className={notice ? "mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" : "sr-only"}>
      {notice}{last ? <Button variant="ghost" disabled={undoBusy} onClick={undo} className="ml-2">{undoBusy ? "Снимаем…" : "Снять последнюю отметку"}</Button> : null}
    </div>
    <ul className="mt-4 space-y-3">{titles.map((title) => <UpdatesRow key={`${title.comicId}:${undoVersion}`} item={title} kind={kind}
      onMarked={(chapterId, action) => { setNotice(action === "read-through" ? "Основные главы до выбранной отмечены. Спешиалы не изменены." : "Глава отмечена прочитанной."); setLast(action === "read" ? { comicId: title.comicId, chapterId } : null); router.refresh(); }} />)}</ul>
  </>;
}
function UpdatesRow({ item, kind, onMarked }: { item: UpdatesTitle; kind: UpdatesKind; onMarked: (id: number, action: MarkAction) => void }) {
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState<UpdatesChapter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const [marked, setMarked] = useState<number[]>([]);
  const panelId = `updates-${item.comicId}`;
  async function load(more = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/library/updates?${new URLSearchParams({ comicId: String(item.comicId), kind, offset: String(more ? chapters.length : 0) })}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить главы. Попробуйте снова.");
      const data: { chapters: UpdatesChapter[]; total: number } = await response.json();
      setChapters((previous) => more ? [...previous, ...data.chapters.filter((c) => !previous.some((p) => p.id === c.id))] : data.chapters);
      setTotal(data.total); setLoaded(true); if (!more) setMarked([]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save(id: number, action: MarkAction) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await mark(item.comicId, id, action);
      setMarked((previous) => action === "read-through" ? [...previous, ...chapters.filter((c) => c.kind === "MAIN" && chapters.findIndex((v) => v.id === c.id) <= chapters.findIndex((v) => v.id === id)).map((c) => c.id)] : [...previous, id]);
      setTarget(""); await load(); onMarked(id, action);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const selected = chapters.find((c) => String(c.id) === target);
  return <li className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <Link href={`/comics/${encodeURIComponent(item.slug)}`} aria-label={`Открыть ${item.title}`} className="w-16 shrink-0 sm:w-20"><CoverImage src={item.coverUrl} alt="" className="aspect-[2/3] rounded-lg" /></Link>
      <div className="min-w-0 flex-1"><Link href={`/comics/${encodeURIComponent(item.slug)}`} className="block break-words text-base font-bold sm:text-lg">{item.title}</Link>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Основных: {item.mainCount} · Спешиалов: {item.specialCount}</p>
        {item.updatedCount > 0 ? <p className="mt-1 text-xs text-[var(--text-accent)]">Обновлённых редакций: {item.updatedCount}</p> : null}</div>
      <Button variant="ghost" iconOnly aria-label={open ? `Свернуть главы ${item.title}` : `Раскрыть главы ${item.title}`} aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen(!open); if (!open && !loaded && !busy) void load(); }}><span aria-hidden="true">{open ? "⌃" : "⌄"}</span></Button>
    </div>
    {open ? <div id={panelId} className="border-t border-[var(--border)] p-3 sm:p-4">
      {busy ? <p role="status" className="mb-3 text-sm text-[var(--text-secondary)]">{loaded ? "Сохраняем или загружаем…" : "Загружаем главы…"}</p> : null}
      {error ? <div role="alert" className="mb-3"><p className="text-sm text-[var(--text-primary)]">{error}</p><Button variant="secondary" disabled={busy} onClick={() => load()}>Загрузить заново</Button></div> : null}
      {chapters.some((c) => c.kind === "MAIN" && !marked.includes(c.id)) ? <form className="mb-4 rounded-xl bg-[var(--surface-raised)] p-3" onSubmit={(e) => { e.preventDefault(); if (selected) void save(selected.id, "read-through"); }}>
        <label className="block text-sm font-medium">Прочитано до…<select value={target} required disabled={busy} onChange={(e) => setTarget(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm">
          <option value="">Выберите главу</option>{chapters.filter((c) => c.kind === "MAIN" && !marked.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.displayCode}{c.title ? ` — ${c.title}` : ""}</option>)}</select></label>
        <p className="my-2 text-xs text-[var(--text-secondary)]">{selected ? `Будет добавлено отметок основных глав: ${selected.throughCount}.` : "Выберите из загруженных глав; для дальних глав нажмите «Показать ещё»."} Спешиалы и архивные версии не изменятся.</p>
        <Button type="submit" disabled={busy || !selected}>Отметить до выбранной</Button>
      </form> : null}
      <ul className="divide-y divide-[var(--border)]">{chapters.map((c) => {
        const source = sourceUrl(c.sourceUrl); const done = marked.includes(c.id);
        return <li key={c.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1 break-words"><p className="font-semibold">{c.displayCode}{c.title ? ` — ${c.title}` : ""}</p>
          <div className="mt-1 flex flex-wrap gap-2">{c.kind === "SPECIAL" ? <Badge>Спешиал</Badge> : null}{c.updated ? <Badge>Обновлённая редакция</Badge> : null}</div>
          {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-[var(--text-accent)]">Читать в источнике ↗</a> : null}</div>
          <Button iconOnly variant={done ? "primary" : "secondary"} disabled={busy || done} aria-label={done ? `${c.displayCode}: прочитано` : `Отметить ${c.displayCode} прочитанной`} onClick={() => save(c.id, "read")}><span aria-hidden="true">{done ? "✓" : "○"}</span></Button></li>;
      })}</ul>
      {loaded && chapters.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">Непрочитанных глав в этом разделе уже нет.</p> : null}
      {chapters.length < total ? <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => load(true)}>Показать ещё 30</Button> : null}
      <Link href={`/comics/${encodeURIComponent(item.slug)}`} className="mt-3 flex min-h-11 items-center text-sm text-[var(--text-accent)]">Все главы и мой дневник →</Link>
    </div> : null}
  </li>;
}
