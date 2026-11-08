import Link from "next/link";
import type { UserReadingStats } from "@/modules/library/queries/get-user-reading-stats";

export function ReadingStats({ stats }: { stats: UserReadingStats }) {
  const statuses = [
    { label: "В планах", value: stats.planned, status: "WANT_TO_READ" },
    { label: "Читаю", value: stats.reading, status: "READING" },
    { label: "Прочитано", value: stats.completed, status: "COMPLETED" },
    { label: "На паузе", value: stats.onHold, status: "ON_HOLD" },
  ];
  return (
    <section className="reader-stats mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Мой дневник</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        Тайтлов в библиотеке: <strong className="text-[var(--text-primary)]">{stats.titles}</strong>.
        {" "}Отслеживаю: <strong className="text-[var(--text-primary)]">{stats.tracked}</strong>.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statuses.map((item) => (
          <Link key={item.status} href={`/library?status=${item.status}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] hover:border-[var(--primary)]">
            <span className="block text-2xl font-bold">{item.value}</span>
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">{item.label}</span>
          </Link>
        ))}
      </div>
      <h3 className="mt-6 font-semibold">Отмечено прочитанными</h3>
      <dl className="chapter-stat-totals">
        {[
          ["Основные главы", stats.main],
          ["Спецвыпуски", stats.specials],
          ["Архивные главы", stats.archived],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border)] p-4">
            <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
            <dd className="mt-1 text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="stats-explanation"><summary>Как считаются главы</summary>
      <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
        Основные главы и спешалы считаются по отметкам у вышедших глав.
        Архивные главы показаны отдельно: их отметки сохраняются при замене редакции.
        Отключение обновлений или удаление с полки не стирает дневник: отметки, оценки и заметки сохраняются. Общие счётчики прочитанных глав учитывают и сохранённые записи вне полки.
      </p>
      {stats.legacyTitles > 0 ? (
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Тайтлов с числовым прогрессом без списка глав: {stats.legacyTitles}.
          Их прогресс сохранён в библиотеке и не добавляется к числу отмеченных глав.
        </p>
      ) : null}
      </details>
      {stats.titles === 0 ? (
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--primary)] hover:underline">Найти первый тайтл →</Link>
      ) : null}
    </section>
  );
}
