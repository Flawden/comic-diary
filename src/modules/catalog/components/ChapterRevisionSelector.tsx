"use client";

import { useId, useRef, useState } from "react";

type Chapter = {
  id: number; displayCode: string; title: string | null; sourceUrl: string | null;
  kind: string; sortOrder: number; status: string;
};
const fields = ["chapterDisplayCode", "chapterTitle", "chapterKind", "chapterSourceUrl", "chapterSortOrder", "chapterStatus"] as const;

function control(form: HTMLFormElement, name: string) {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element : null;
}

export function ChapterRevisionSelector({ chapters, disabled }: { chapters: Chapter[]; disabled: boolean }) {
  const id = useId();
  const [selectedId, setSelectedId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const draft = useRef<Record<string, string> | null>(null);
  const candidates = chapters.filter(c => c.status === "RELEASED").sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const selected = candidates.find(c => String(c.id) === selectedId);

  function choose(value: string, form: HTMLFormElement | null) {
    if (!form) return;
    setConfirmed(false);
    setSelectedId(value);
    const chapter = candidates.find(c => String(c.id) === value);
    if (chapter) {
      if (!draft.current) draft.current = Object.fromEntries(fields.map(name => [name, control(form, name)?.value ?? ""]));
      const values = [chapter.displayCode, chapter.title ?? "", chapter.kind, chapter.sourceUrl ?? "", String(chapter.sortOrder), "RELEASED"];
      fields.forEach((name, index) => { const element = control(form, name); if (element) element.value = values[index]; });
    } else if (draft.current) {
      fields.forEach(name => { const element = control(form, name); if (element) element.value = draft.current![name]; });
      draft.current = null;
    }
  }

  return <fieldset disabled={disabled} className="rounded-xl border border-[var(--border)] p-3 md:col-span-2">
    <legend className="px-1 text-sm font-semibold">Новая глава или новая редакция?</legend>
    <p className="mb-3 text-sm text-[var(--text-secondary)]">Название, код или ссылку существующей главы изменяйте через «Редактировать». Если изменилось содержание, создайте новую редакцию: история чтения старой сохранится.</p>
    <label htmlFor={`${id}-previous`} className="block text-sm font-medium">Что добавляем</label>
    <select id={`${id}-previous`} value={selected ? selectedId : ""}
      onChange={event => choose(event.target.value, event.currentTarget.form)}
      className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
      <option value="">Новую главу без замены</option>
      {candidates.map(c => <option key={c.id} value={c.id}>Новую редакцию: {c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""}</option>)}
    </select>
    {selectedId ? <button type="button" onClick={event => choose("", event.currentTarget.form)}
      className="mt-3 min-h-11 rounded-lg border-2 border-[var(--primary)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--primary)]">Отменить замену — вернуться к новой главе</button> : null}
    <input type="hidden" name="chapterRevisionInvalid" value={selectedId && !selected ? "yes" : ""} />
    <input type="hidden" name="chapterSupersedesId" value={selected?.id ?? ""} />
    {selected ? <div className="mt-3 space-y-3">
      <p className="text-sm">Старая редакция для замены: <strong>{selected.displayCode}{selected.title ? `${selected.displayCode ? " — " : ""}${selected.title}` : ""}</strong> (ID {selected.id}). Код, тип и позиция подставлены; проверьте название и ссылку новой редакции.</p>
      <p className="text-sm text-[var(--text-secondary)]">При сохранении новая редакция публикуется, старая уходит в архив. Её отметки и даты чтения сохраняются. Новая редакция будет непрочитанной, в том числе у читателей старой версии.</p>
      <label htmlFor={`${id}-confirm`} className="flex min-h-11 items-start gap-3 text-sm">
        <input id={`${id}-confirm`} name="chapterRevisionConfirmed" type="checkbox" value="yes" checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />
        <span>Подтверждаю публикацию новой редакции и архивирование «{selected.displayCode || selected.title}» с сохранением истории чтения.</span>
      </label>
      {!confirmed ? <p className="text-sm text-[var(--text-secondary)]">Чтобы сохранить новую редакцию, поставьте галочку подтверждения выше. Для обычной новой главы нажмите «Отменить замену».</p> : null}
    </div> : candidates.length === 0 ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Опубликованных глав для замены пока нет.</p> : null}
    {selectedId && !selected ? <div className="mt-2">
      <p role="alert" className="text-sm">Выбранная глава больше недоступна для замены. Выберите актуальную редакцию.</p>
    </div> : null}
  </fieldset>;
}
