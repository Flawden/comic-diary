import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  getAdminWorkspaceAccess,
} from "@/modules/admin-ui/admin-page-access";

import {
  getAdminDashboardCounts,
} from "@/modules/admin-ui/admin-read-model";

export const dynamic =
  "force-dynamic";

export default async function AdminPage() {
  const access =
    await getAdminWorkspaceAccess();

  if (!access.currentUser) {
    redirect(
      "/login?next=%2Fadmin",
    );
  }

  if (!access.canAccessWorkspace) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-8">
        <p className="text-sm font-semibold text-[var(--primary)]">
          Comic Diary
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Доступ запрещён
        </h1>

        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          У этой учётной записи нет разрешений
          для панели управления.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex font-semibold text-[var(--primary)]"
        >
          Вернуться в каталог
        </Link>
      </main>
    );
  }

  const counts =
    await getAdminDashboardCounts();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            Comic Diary
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Панель управления
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Каталог, пользователи и технический импорт
            доступны в соответствии с правами текущей роли.
          </p>
        </div>

        <Link
          href="/account"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          Аккаунт
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <p className="text-sm text-[var(--muted)]">
            Комиксов в PostgreSQL
          </p>

          <p className="mt-2 text-3xl font-bold">
            {counts.comics}
          </p>
        </article>

        <article className="rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <p className="text-sm text-[var(--muted)]">
            Категорий
          </p>

          <p className="mt-2 text-3xl font-bold">
            {counts.categories}
          </p>
        </article>

        <article className="rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <p className="text-sm text-[var(--muted)]">
            Пользователей
          </p>

          <p className="mt-2 text-3xl font-bold">
            {counts.users}
          </p>
        </article>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {access.canEditCatalog ? (
          <Link
            href="/admin/comics"
            className="rounded-2xl border border-black/5 bg-[var(--surface)] p-6 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold">
              Комиксы
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Создание и редактирование метаданных,
              категории и статуса публикации.
            </p>
          </Link>
        ) : null}

        {access.canEditCatalog ? (
          <Link
            href="/admin/categories"
            className="rounded-2xl border border-black/5 bg-[var(--surface)] p-6 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold">
              Категории
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Создание категорий и безопасное редактирование
              названия и описания без destructive delete.
            </p>
          </Link>
        ) : null}

        {access.canAdminUsers ? (
          <Link
            href="/admin/users"
            className="rounded-2xl border border-black/5 bg-[var(--surface)] p-6 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold">
              Пользователи
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Роли и активность аккаунтов.
              Изменение полномочий отзывает сессии.
            </p>
          </Link>
        ) : null}

        {access.canRunBulkImport ? (
          <Link
            href="/admin/catalog-import/vk"
            className="rounded-2xl border border-black/5 bg-[var(--surface)] p-6 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold">
              Импорт VK
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Существующий review/discovery/import workspace
              с production kill-switch.
            </p>
          </Link>
        ) : null}

        {access.canViewAudit ? (
          <Link
            href="/admin/audit"
            className="rounded-2xl border border-black/5 bg-[var(--surface)] p-6 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold">
              Журнал аудита
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Неизменяемая история редакторских и административных
              действий с actor, target и временем.
            </p>
          </Link>
        ) : null}

      </section>

      <Link
        href="/"
        className="mt-8 inline-flex text-sm font-semibold text-[var(--primary)]"
      >
        ← В каталог
      </Link>
    </main>
  );
}
