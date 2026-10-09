import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getReadingUpdates, parseUpdatesOptions } from "@/modules/library/queries/get-reading-updates";
import { ReadingUpdatesList } from "@/modules/library/components/ReadingUpdatesList";
import { Button } from "@/shared/components/ui";

export const dynamic = "force-dynamic";
export default async function UpdatesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fupdates");
  const options = parseUpdatesOptions(await searchParams);
  const result = await getReadingUpdates(user.id, options);
  const href = (page: number) => `/updates?${new URLSearchParams({ q: options.q, kind: options.kind, status: options.status, page: String(page) })}`;
  const control = "mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm";
  return <div className="mx-auto max-w-3xl">
    <header><h1 className="text-3xl font-bold">Новое для чтения</h1>
      <p className="mt-3 text-[var(--text-secondary)]">Непрочитанные главы отслеживаемых тайтлов, включая спешиалы и новые редакции. Статус «Прочитано» не отключает обновления.</p></header>
    <form key={`${options.q}:${options.status}:${options.kind}`} action="/updates" className="mt-6 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Поиск по тайтлам<input name="q" type="search" maxLength={160} defaultValue={options.q} placeholder="Название тайтла" className={control} /></label>
      <label className="text-sm">Мой статус<select name="status" defaultValue={options.status} className={control}>
        <option value="READING">Читаю</option><option value="ALL">Все статусы</option><option value="WANT_TO_READ">Планирую</option><option value="ON_HOLD">Отложено</option><option value="COMPLETED">Завершено</option></select></label>
      <label className="text-sm">Главы<select name="kind" defaultValue={options.kind} className={control}>
        <option value="MAIN">Основные</option><option value="SPECIAL">Спешиалы</option><option value="UPDATED">Обновлённые редакции</option><option value="ALL">Все главы</option></select></label>
      <Button type="submit">Применить</Button><Link href="/updates" className="inline-flex min-h-11 items-center justify-center text-sm text-[var(--text-accent)]">Сбросить фильтры</Link>
    </form>
    {result.missingCount > 0 ? <p className="mt-4 text-sm text-[var(--text-secondary)]">У {result.missingCount} тайтлов выбранного статуса список глав ещё не заполнен. Их числовой прогресс доступен в <Link href="/library" className="underline">библиотеке</Link>.</p> : null}
    <p className="mt-6 text-sm text-[var(--text-secondary)]">Тайтлов с непрочитанным: {result.total}{options.page > 1 ? ` · страница ${options.page}` : ""}</p>
    <ReadingUpdatesList key={`${options.kind}:${options.status}:${options.q}:${options.page}`} titles={result.titles} kind={options.kind} />
    {result.titles.length === 0 ? <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-xl font-bold">{options.page > 1 ? "На этой странице нет тайтлов" : options.q ? "По запросу ничего не найдено" : result.libraryCount === 0 ? "Нет отслеживаемых тайтлов выбранного статуса" : "В выбранном разделе нет непрочитанных глав"}</h2>
      <p className="mt-2 text-[var(--text-secondary)]">{result.missingCount ? "Часть реестров ещё не заполнена, поэтому отсутствие записей здесь не означает, что прочитано всё." : "Измените фильтры или включите обновления тайтла в библиотеке."}</p>
      <Link href="/library" className="mt-3 inline-flex min-h-11 items-center text-[var(--text-accent)]">Открыть библиотеку →</Link>
    </section> : null}
    <nav aria-label="Страницы обновлений" className="mt-6 flex justify-between gap-3">
      {options.page > 1 ? <Link href={href(options.page - 1)} className="inline-flex min-h-11 items-center text-[var(--text-accent)]">← Назад</Link> : <span />}
      {options.page * 20 < result.total ? <Link href={href(options.page + 1)} className="inline-flex min-h-11 items-center text-[var(--text-accent)]">Дальше →</Link> : null}
    </nav>
  </div>;
}
