"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChapterRating({ comicId, chapterId, code, rating }: {
  comicId: number; chapterId: number; code: string; rating: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(rating ?? ""));
  const [saved, setSaved] = useState(String(rating ?? ""));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <details className="mt-1">
    <summary className="min-h-11 cursor-pointer content-center text-sm text-[var(--primary)]">
      {saved ? `★ ${saved} / 5 · Изменить` : "☆ Оценить главу"}
    </summary>
    <form className="flex flex-wrap items-center gap-2" onSubmit={async event => {
      event.preventDefault();
      if (pending || value === saved) return;
      setPending(true); setMessage("");
      try {
        const response = await fetch("/api/library/reading-state", { method:"POST", headers:{Accept:"application/json"},
          body:new URLSearchParams({intent:"chapter-rating", comicId:String(comicId), chapterId:String(chapterId), rating:value}) });
        if (!response.ok || !(await response.json()).ok) throw new Error();
        setSaved(value); setMessage("Сохранено."); router.refresh();
      } catch { setMessage("Не удалось сохранить оценку. Проверьте отметку чтения и попробуйте ещё раз."); }
      finally { setPending(false); }
    }}>
      <select className="min-h-11 max-w-full rounded-lg border px-2" aria-label={`Моя оценка главы ${code}`} value={value} disabled={pending}
        onChange={e => { setValue(e.target.value); setMessage(""); }}>
        <option value="">Без оценки</option>
        {[1,2,3,4,5].map(star => <option key={star} value={star}>{star} / 5</option>)}
      </select>
      <button className="tea-text-action" disabled={pending || value === saved}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      <span className="text-xs" role="status">{message}</span>
    </form>
  </details>;
}
