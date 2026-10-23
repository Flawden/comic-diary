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
      <div className="reader-page admin-page">
        <h1 className="reader-title">
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
      </div>
    );
  }

  const users =
    await listAdminUsers();

  return (
    <div className="reader-page admin-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            Панель управления
          </p>

          <h1 className="mt-2 reader-title">
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
          ← Панель управления
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
    </div>
  );
}
