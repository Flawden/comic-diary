"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { volumeHeading } from "@/modules/catalog/chapter-volumes";

type NamedVolume = { number: number; title: string };

export function AdminVolumeTitles({ comicId, volumeNumbers, initialTitles, disabled, onDirtyChange }: {
  comicId: number;
  volumeNumbers: Array<number | null>;
  initialTitles: NamedVolume[];
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const initial = Object.fromEntries(initialTitles.map(row => [row.number, row.title])) as Record<number, string>;
  const numbers = [...new Set([...volumeNumbers, ...initialTitles.map(row => row.number)])]
    .filter((number): number is number => number !== null && number >= 1 && number <= 99)
    .sort((a, b) => a - b);
  const dirty = numbers.some(number =>
    (edits[number] ?? saved[number] ?? initial[number] ?? "").trim() !== (saved[number] ?? initial[number] ?? ""));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function saveTitle(number: number) {
    if (busy !== null || disabled) return;
    const title = (edits[number] ?? saved[number] ?? initial[number] ?? "").trim();
    setBusy(number);
    setFeedback(current => ({ ...current, [number]: "" }));
    try {
      const response = await fetch(`/api/admin/catalog/comics/${comicId}/volumes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ volumeNumber: number, title }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить название тома.");
      setSaved(current => ({ ...current, [number]: title }));
      setEdits(current => { const next = { ...current }; delete next[number]; return next; });
      setFeedback(current => ({ ...current, [number]: title ? "Название сохранено." : "Название очищено." }));
      router.refresh();
    } catch {
      setFeedback(current => ({ ...current, [number]: "Ошибка сохранения. Проверьте соединение." }));
    } finally {
      setBusy(null);
    }
  }

  return <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4" aria-label="Названия томов">
    <h5 className="font-semibold">Названия томов</h5>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">
      Номер тома задаётся в карточке главы. Название необязательно и сохраняется отдельно от метаданных произведения.
    </p>
    {numbers.length === 0 ? <p className="mt-3 text-sm text-[var(--text-secondary)]">
      Сначала укажите номер тома хотя бы у одной главы — здесь появится поле для его названия.
    </p> : <div className="mt-3 space-y-3">
      {numbers.map(number => {
        const baseline = saved[number] ?? initial[number] ?? "";
        const value = edits[number] ?? baseline;
        return <div key={number} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-sm font-medium">
            <span className="block">{volumeHeading(number)}</span>
            <input type="text" maxLength={160} value={value} placeholder="Например, Начало пути"
              disabled={disabled || busy !== null}
              onChange={event => {
                setEdits(current => ({ ...current, [number]: event.target.value }));
                setFeedback(current => ({ ...current, [number]: "" }));
              }}
              onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
              className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm" />
          </label>
          <button type="button" onClick={() => void saveTitle(number)}
            disabled={disabled || busy !== null || value.trim() === baseline}
            className="min-h-11 rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-50">
            {busy === number ? "Сохраняем…" : "Сохранить название"}
          </button>
          {feedback[number] ? <p role="status" className="text-xs text-[var(--text-secondary)] sm:col-span-2">{feedback[number]}</p> : null}
        </div>;
      })}
    </div>}
  </section>;
}
