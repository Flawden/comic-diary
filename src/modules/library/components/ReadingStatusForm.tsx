"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { seriesStatusLabels, type SeriesStatus } from "@/modules/comics/series-status";
import type { ReadingStatus } from "../mutations/update-user-comic-state";
import type { CompletionScope } from "../completion-model";

const labels = { WANT_TO_READ: "Хочу прочитать", READING: "Читаю", COMPLETED: "Прочитано", ON_HOLD: "Отложено" };
const button = "min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]";

type Props = { comicId: number; status: ReadingStatus; registered: boolean; seriesStatus: SeriesStatus;
  completionBlocked: boolean; unreadMain: number; unreadSpecial: number; snapshot: string };

export function ReadingStatusForm(props: Props) {
  const router = useRouter();
  const finished = props.seriesStatus === "FINISHED" && !props.completionBlocked;
  const [mode, setMode] = useState<"COMPLETE" | "AVAILABLE">("COMPLETE");
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState(props.status);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(scope?: CompletionScope) {
    setPending(true); setError("");
    const data = new FormData();
    data.set("comicId", String(props.comicId));
    data.set("intent", scope ? "complete-reading" : "set-status");
    data.set("status", status);
    if (scope) { data.set("mode", mode); data.set("scope", scope); data.set("snapshot", props.snapshot); }
    try {
      const response = await fetch("/api/library/reading-state", { method: "POST", body: data, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Не удалось сохранить. Возможно, список глав изменился. Обновите страницу и повторите подтверждение.");
      dialog.current?.close(); setConfirming(false);
      if (scope) setStatus(mode === "COMPLETE" ? "COMPLETED" : "READING");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить статус."); }
    finally { setPending(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (status === "COMPLETED") { if (!finished) { setError("Выпуск не подтверждён как завершённый. Можно отметить все вышедшие главы и продолжить отслеживание."); return; } setMode("COMPLETE"); setConfirming(true); dialog.current?.showModal(); }
    else void save();
  }
  function cancel() { if (pending) return; dialog.current?.close(); setConfirming(false); setStatus(props.status); setError(""); }

  return <>
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="reading-status" className="block text-sm font-medium">Статус</label>
      <div className="flex flex-wrap gap-2">
        <select id="reading-status" value={status} disabled={pending} onChange={(e) => setStatus(e.target.value as ReadingStatus)} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value} disabled={value === "COMPLETED" && !finished && props.status !== "COMPLETED"}>{label}</option>)}
        </select>
        <button type="submit" disabled={pending} className={`${button} text-[var(--primary)]`}>{pending ? "Сохраняю…" : "Сохранить статус"}</button>
      </div>
      <p className="text-xs leading-5 text-[var(--text-secondary)]">{seriesStatusLabels[props.seriesStatus]}. {props.completionBlocked ? "В списке основных глав есть невышедшие главы или пока нет опубликованных основных глав." : null} {finished ? "Завершение чтения подтверждается отдельно." : "Прочитав всё вышедшее, оставайтесь в статусе «Читаю»."}</p>
      {props.registered ? <button type="button" disabled={pending} onClick={() => { setError(""); setMode("AVAILABLE"); setConfirming(true); dialog.current?.showModal(); }} className={button}>Отметить всё вышедшее</button> : null}
      {error && !confirming ? <p role="alert" className="text-sm text-[var(--text-secondary)]">{error}</p> : null}
    </form>
    <dialog ref={dialog} aria-labelledby="completion-title" aria-describedby="completion-description" onCancel={(event) => { event.preventDefault(); cancel(); }} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-xl backdrop:bg-black/70">
      <h2 id="completion-title" className="text-xl font-bold">Что вы прочитали?</h2>
      <p id="completion-description" className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{mode === "COMPLETE" ? "Подтвердите завершение чтения." : "Будут отмечены выбранные вышедшие главы, статус станет «Читаю»."} Будущие главы и архивные редакции не будут отмечены. Отслеживание сохранится.</p>
      <div className="mt-5 grid gap-3">
        {props.registered ? <>
          <button type="button" disabled={pending} onClick={() => void save("MAIN")} className={`${button} text-left`}>
            Все основные главы
            <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Будут отмечены ещё {props.unreadMain} основных глав. Отметки спешиалов сохранятся.</span>
          </button>
          <button type="button" disabled={pending} onClick={() => void save("ALL")} className={`${button} text-left`}>
            Всё, включая спешиалы
            <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Будут отмечены ещё {props.unreadMain} основных глав и {props.unreadSpecial} спешиалов.</span>
          </button>
        </> : <>
          <p className="text-sm text-[var(--text-secondary)]">Список глав ещё не заполнен. Конкретные главы и спешиалы определить нельзя.</p>
          <button type="button" disabled={pending} onClick={() => void save("STATUS_ONLY")} className={`${button} text-left`}>
            Завершить без изменения общего счётчика
          </button>
        </>}
        <button type="button" autoFocus disabled={pending} onClick={cancel} className={button}>Отмена, выбрал по ошибке</button>
      </div>
      {pending ? <p role="status" className="mt-3 text-sm">Сохраняю статус и отметки…</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--text-secondary)]">{error}</p> : null}
    </dialog>
  </>;
}
