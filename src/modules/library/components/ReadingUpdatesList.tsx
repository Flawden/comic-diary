"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { groupChaptersByVolume } from "@/modules/catalog/chapter-volumes";
import { CoverImage } from "@/shared/components/media";
import { ChapterRating } from "./ChapterRating";
import { Button, Badge } from "@/shared/components/ui";
import type { UpdatesChapter, UpdatesKind, UpdatesTitle } from "../queries/get-reading-updates";
import { chapterCountLabel, unreadChapterCount } from "../queries/reading-updates-model";

type MarkAction = "read" | "unread" | "read-through";

async function mark(comicId: number, chapterId: number, action: MarkAction) {
  const body = new FormData();
  body.set("comicId", String(comicId));
  body.set("chapterId", String(chapterId));
  body.set("intent", "chapter-reading");
  body.set("action", action);
  const response = await fetch("/api/library/reading-state", {
    method: "POST", headers: { Accept: "application/json" }, body,
  });
  if (!response.ok) throw new Error("Не удалось сохранить отметку. Проверьте соединение и вход в аккаунт.");
}
function sourceUrl(value: string | null) {
  try { if (value && ["http:", "https:"].includes(new URL(value).protocol)) return value; } catch {}
  return null;
}

export function ReadingUpdatesList({ titles, kind }: { titles: UpdatesTitle[]; kind: UpdatesKind }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [last, setLast] = useState<{
    comicId: number;
    chapter: Pick<UpdatesChapter, "id" | "title" | "displayCode">;
    rating: number | null;
    rated: boolean;
  } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);
  const [ratingSheet, setRatingSheet] = useState<{
    comicId: number;
    chapter: Pick<UpdatesChapter, "id" | "title" | "displayCode">;
    rating: number | null;
  } | null>(null);
  async function undo() {
    if (!last || last.rated || undoBusy) return;
    setUndoBusy(true);
    try {
      await mark(last.comicId, last.chapter.id, "unread");
      setLast(null); setNotice("Отметка снята."); setUndoVersion((v) => v + 1); router.refresh();
    } catch (e) { setNotice((e as Error).message); }
    finally { setUndoBusy(false); }
  }
  return <>
    <div role="status" aria-live="polite" className={notice ? "mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" : "sr-only"}>
      {notice}
      {last ? <Button variant="ghost" disabled={undoBusy} onClick={() => setRatingSheet({
        comicId: last.comicId, chapter: last.chapter, rating: last.rating,
      })} className="ml-2">{last.rated ? "Изменить оценку" : "Оценить главу"}</Button> : null}
      {last && !last.rated ? <Button variant="ghost" disabled={undoBusy} onClick={undo} className="ml-2">{undoBusy ? "Снимаем…" : "Снять последнюю отметку"}</Button> : null}
    </div>
    <ul className="mt-4 space-y-3">{titles.map((title) => <UpdatesRow key={`${title.comicId}:${undoVersion}`} item={title} kind={kind}
      onMarked={(chapter, action) => {
        setNotice(action === "read-through" ? "Основные главы до выбранной отмечены. Спецвыпуски не изменены." : "Глава отмечена прочитанной.");
        setLast(action === "read" ? { comicId: title.comicId, chapter, rating: null, rated: false } : null);
        if (action === "read" && title.promptChapterRating) {
          // Honour the same per-title preference used on the work page.
          // Keep the unread row mounted until the optional rating sheet closes.
          setRatingSheet({ comicId: title.comicId, chapter, rating: null });
        } else {
          if (action === "read") setUndoVersion((v) => v + 1);
          router.refresh();
        }
      }} />)}</ul>
    {ratingSheet ? <ChapterRating
      key={`${ratingSheet.comicId}:${ratingSheet.chapter.id}`}
      comicId={ratingSheet.comicId}
      chapter={ratingSheet.chapter}
      rating={ratingSheet.rating}
      showPreference={false}
      refreshOnSave={false}
      onSaved={(rating) => {
        // Even a successful removal counts as a rating edit: don't offer a
        // misleading one-click undo after the reader has used this control.
        setLast((previous) => previous && previous.comicId === ratingSheet.comicId &&
          previous.chapter.id === ratingSheet.chapter.id ? { ...previous, rating, rated: true } : previous);
        setNotice(rating === null ? "Оценка главы удалена." : "Оценка главы сохранена.");
      }}
      onClose={() => {
        setRatingSheet(null);
        // Unread feed: discard the old loaded list after completing (or skipping) rating.
        setUndoVersion((v) => v + 1);
        router.refresh();
      }}
    /> : null}
  </>;
}

// Keep each native details group expandable/collapsible, including its initial open state.
function UpdatesVolume({ group, initiallyOpen, renderChapter }: {
  group: { number: number | null; chapters: UpdatesChapter[] };
  initiallyOpen: boolean;
  renderChapter: (chapter: UpdatesChapter) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  return <details className="updates-volume" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>
      <span>{group.number === null ? "Главы без тома" : `Том ${group.number}`}</span>
      <small>Загружено: {chapterCountLabel(group.chapters.length)}</small>
    </summary>
    <ul className="divide-y divide-[var(--border)]">{group.chapters.map(renderChapter)}</ul>
  </details>;
}

function UpdatesRow({ item, kind, onMarked }: { item: UpdatesTitle; kind: UpdatesKind; onMarked: (chapter: UpdatesChapter, action: MarkAction) => void }) {
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState<UpdatesChapter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const [marked, setMarked] = useState<number[]>([]);
  const panelId = `updates-${item.comicId}`;
  const unreadCount = unreadChapterCount(item, kind);

  async function load(more = false) {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ comicId: String(item.comicId), kind, offset: String(more ? chapters.length : 0) });
      const response = await fetch(`/api/library/updates?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить главы. Попробуйте снова.");
      const data: { chapters: UpdatesChapter[]; total: number } = await response.json();
      setChapters((previous) => more ? [...previous, ...data.chapters.filter((c) => !previous.some((p) => p.id === c.id))] : data.chapters);
      setTotal(data.total); setLoaded(true);
      if (!more) setMarked([]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save(id: number, action: MarkAction) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const chapter = chapters.find((c) => c.id === id);
      if (!chapter) throw new Error("Глава не найдена в загруженном списке.");
      await mark(item.comicId, id, action);
      setMarked((previous) => action === "read-through"
        ? [...previous, ...chapters.filter((c) => c.kind === "MAIN" && chapters.findIndex((v) => v.id === c.id) <= chapters.findIndex((v) => v.id === id)).map((c) => c.id)]
        : [...previous, id]);
      setTarget("");
      if (action === "read") {
        // Keep the row mounted until the optional rating sheet closes.
        onMarked(chapter, action);
      } else {
        await load(); onMarked(chapter, action);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const selected = chapters.find((c) => String(c.id) === target);
  const groups = groupChaptersByVolume(chapters);
  const hasVolumes = groups.some((group) => group.number !== null);

  function renderChapter(c: UpdatesChapter) {
    const source = sourceUrl(c.sourceUrl);
    const done = marked.includes(c.id);
    const label = [c.displayCode, c.title].filter(Boolean).join(" — ") || "Глава";
    return <li key={c.id} className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 break-words">
        <p className="font-semibold">{label}</p>
        <div className="mt-1 flex flex-wrap gap-2">{c.kind === "SPECIAL" ? <Badge>Спецвыпуск</Badge> : null}{c.updated ? <Badge>Обновлённая редакция</Badge> : null}</div>
        {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-[var(--text-accent)]">Читать в источнике ↗</a> : null}
      </div>
      <Button iconOnly className="updates-mark" variant={done ? "primary" : "secondary"} disabled={busy || done}
        aria-label={done ? `${label}: прочитано` : `Отметить ${label} прочитанной`} onClick={() => save(c.id, "read")}>
        <span aria-hidden="true">{done ? "✓" : "○"}</span>
      </Button>
    </li>;
  }

  return <li className="updates-item">
    <div className="updates-head">
      <Link href={`/comics/${encodeURIComponent(item.slug)}`} aria-label={`Открыть ${item.title}`} className="w-16 shrink-0 sm:w-20">
        <CoverImage src={item.coverUrl} alt="" className="aspect-[3/4] rounded-lg" imageClassName="object-contain" fallback={item.title} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/comics/${encodeURIComponent(item.slug)}`} className="block break-words text-base font-bold sm:text-lg">{item.title}</Link>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Основных: {item.mainCount} · Спецвыпусков: {item.specialCount}</p>
        {item.updatedCount > 0 ? <p className="mt-1 text-xs text-[var(--text-accent)]">Обновлённых редакций: {item.updatedCount}</p> : null}
      </div>
    </div>
    <button type="button" className="updates-reveal" aria-expanded={open} aria-controls={panelId}
      onClick={() => { setOpen(!open); if (!open && !loaded && !busy) void load(); }}>
      <span>{open ? "Свернуть главы" : `Показать непрочитанные главы · ${unreadCount}`}</span>
      <span className="updates-reveal-icon" aria-hidden="true">⌄</span>
    </button>
    {open ? <div id={panelId} className="updates-panel">
      <div className="updates-panel-heading">
        <h3>Непрочитанные главы</h3>
        {loaded ? <p>Показано {chapters.length} из {total}</p> : null}
      </div>
      {busy ? <p role="status" className="mb-3 text-sm text-[var(--text-secondary)]">{loaded ? "Сохраняем или загружаем…" : "Загружаем главы…"}</p> : null}
      {error ? <div role="alert" className="mb-3"><p className="text-sm text-[var(--text-primary)]">{error}</p><Button variant="secondary" disabled={busy} onClick={() => load()}>Загрузить заново</Button></div> : null}
      {chapters.some((c) => c.kind === "MAIN" && !marked.includes(c.id)) ? <details className="updates-bulk mb-4 rounded-xl bg-[var(--surface-raised)] p-3">
        <summary className="min-h-9 cursor-pointer text-sm font-semibold text-[var(--text-accent)]">Отметить несколько глав прочитанными</summary>
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (selected) void save(selected.id, "read-through"); }}>
        <label className="block text-sm font-medium">Прочитано до…
          <select value={target} required disabled={busy} onChange={(e) => setTarget(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm">
            <option value="">Выберите главу</option>
            {chapters.filter((c) => c.kind === "MAIN" && !marked.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""}</option>)}
          </select>
        </label>
        <p className="my-2 text-xs text-[var(--text-secondary)]">{selected ? `Будет добавлено отметок основных глав: ${selected.throughCount}.` : "Выберите из загруженных глав; для дальних глав нажмите «Показать ещё»."} Отметятся все предыдущие основные главы произведения, даже из других томов. Спецвыпуски не изменятся.</p>
        <Button type="submit" disabled={busy || !selected}>Отметить до выбранной</Button>
        </form>
      </details> : null}
      {hasVolumes ? <div className="updates-volumes" aria-label="Тома с непрочитанными главами">
        {groups.map((group, index) => <UpdatesVolume key={group.number ?? "ungrouped"} group={group} initiallyOpen={index === 0} renderChapter={renderChapter} />)}
      </div> : <ul className="divide-y divide-[var(--border)]">{chapters.map(renderChapter)}</ul>}
      {loaded && chapters.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">Непрочитанных глав в этом разделе уже нет.</p> : null}
      {chapters.length < total ? <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => load(true)}>Показать ещё 30</Button> : null}
      <Link href={`/comics/${encodeURIComponent(item.slug)}`} className="mt-3 flex min-h-11 items-center text-sm text-[var(--text-accent)]">Все главы и мой дневник →</Link>
    </div> : null}
  </li>;
}
