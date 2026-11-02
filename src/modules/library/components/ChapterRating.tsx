"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ChapterRating({ comicId, chapterId, code, rating }: {
  comicId: number; chapterId: number; code: string; rating: number | null;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(rating);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  function close() { setOpen(false); trigger.current?.focus(); }
  async function save(value: number | null) {
    if (saving.current) return;
    if (saved === value) { close(); return; }
    saving.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch("/api/library/reading-state", {method:"POST", headers:{Accept:"application/json"},
        body:new URLSearchParams({intent:"chapter-rating",comicId:String(comicId),chapterId:String(chapterId),rating:String(value ?? "")})});
      if (!response.ok || !(await response.json()).ok) throw new Error();
      setSaved(value); close(); setMessage("Сохранено."); router.refresh();
    } catch { setMessage("Не удалось сохранить. Попробуйте ещё раз."); }
    finally { saving.current = false; setPending(false); }
  }
  return <div onKeyDown={e => { if (open && e.key === "Escape") close(); }}>
    <button type="button" ref={trigger} aria-expanded={open} aria-label={`Оценка главы «${code}»: ${saved ?? "не выставлена"}`}
      className="min-h-11 min-w-11 text-start text-[var(--primary)]" onClick={() => {setOpen(!open); setMessage("");}}>
      {saved ? `★ ${saved}` : "☆"}
    </button>
    {open && <div role="group" aria-label="Выберите оценку" className="flex flex-wrap items-center">
      {[1,2,3,4,5].map(n => <button key={n} type="button" aria-label={`${n} из 5`} aria-pressed={saved === n}
        className="min-h-11 min-w-11 text-xl text-[var(--primary)]" disabled={pending} onClick={() => void save(n)}>{n <= (saved ?? 0) ? "★" : "☆"}</button>)}
      {saved !== null && <button type="button" className="min-h-11 text-sm" disabled={pending} onClick={() => void save(null)}>Убрать оценку</button>}
    </div>}
    <span role="status" className="text-xs">{pending ? "Сохраняю…" : message}</span>
  </div>;
}
