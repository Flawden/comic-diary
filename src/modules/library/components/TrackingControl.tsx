"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrackingControl({ comicId, enabled }: { comicId: number; enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function toggle() {
    setPending(true); setError(false);
    const body = new FormData();
    body.set("comicId", String(comicId)); body.set("intent", "set-tracking"); body.set("enabled", String(!enabled));
    try {
      const response = await fetch("/api/library/reading-state", { method: "POST", body, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Tracking update failed");
      router.refresh();
    } catch { setError(true); }
    finally { setPending(false); }
  }
  return <section className="mt-4 border-t border-[var(--border)] pt-4" aria-label="Отслеживание тайтла">
    <p className="text-sm font-semibold">{enabled ? "Обновления включены" : "Обновления отключены"}</p>
    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{enabled
      ? "Непрочитанные главы, спешиалы и новые редакции появятся в «Обновлениях» при любом статусе чтения."
      : "Тайтл остаётся в библиотеке. Прочитанные главы, оценка и заметки сохранены."}</p>
    <button type="button" disabled={pending} onClick={toggle} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-60">
      {pending ? "Сохраняем…" : enabled ? "Отключить обновления" : "Включить обновления"}
    </button>
    {error ? <p role="alert" className="mt-2 text-sm">Не удалось сохранить. Попробуйте ещё раз.</p> : null}
  </section>;
}
