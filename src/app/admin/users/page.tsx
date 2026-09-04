import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  getAdminWorkspaceAccess,
} from "@/modules/admin-ui/admin-page-access";

import {
  listAdminUsers,
} from "@/modules/admin-ui/admin-read-model";

import {
  AdminUserManager,
} from "./AdminUserManager";

export const dynamic =
  "force-dynamic";

export default async function AdminUsersPage() {
  const access =
    await getAdminWorkspaceAccess();

  if (!access.currentUser) {
    redirect(
      "/login?next=%2Fadmin%2Fusers",
    );
  }

  if (!access.canAdminUsers) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-bold">
          Доступ запрещён
        </h1>

        <p className="mt-4 text-sm text-[var(--muted)]">
          Требуется разрешение ADMIN_USERS.
        </p>

        <Link
          href="/admin"
          className="mt-6 inline-flex font-semibold text-[var(--primary)]"
        >
          ← В панель управления
        </Link>
      </main>
    );
  }

  const users =
    await listAdminUsers();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            R7.3 · Admin
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Пользователи
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Изменение роли или активности отзывает
            все сессии выбранного пользователя.
            Последнего активного администратора отключить нельзя.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          ← Админка
        </Link>
      </div>

      <AdminUserManager
        currentUserId={
          access.currentUser.id
        }
        initialUsers={
          users.map(
            (user) => ({
              ...user,
              createdAt:
                user.createdAt.toISOString(),
              updatedAt:
                user.updatedAt.toISOString(),
            }),
          )
        }
      />
    </main>
  );
}
