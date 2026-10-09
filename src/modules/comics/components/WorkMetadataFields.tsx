import { workTypeLabels, workFormatLabels, type WorkType, type WorkFormat } from "../work-metadata";

export function WorkMetadataFields({ workType = "UNKNOWN", workFormat = "UNKNOWN" }: { workType?: WorkType; workFormat?: WorkFormat }) {
  return <>
    <label className="block">
      <span className="mb-1 block text-sm font-medium">Тип произведения</span>
      <select name="workType" defaultValue={workType} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]">
        {Object.entries(workTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <label className="block">
      <span className="mb-1 block text-sm font-medium">Формат</span>
      <select name="workFormat" defaultValue={workFormat} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]">
        {Object.entries(workFormatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <span className="mt-1 block text-xs text-[var(--text-secondary)]">Вертикальный вебтун может быть мангой, манхвой или другим типом.</span>
    </label>
  </>;
}
