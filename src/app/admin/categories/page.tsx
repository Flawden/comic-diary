import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  getAdminWorkspaceAccess,
} from "@/modules/admin-ui/admin-page-access";

import {
  listAdminCategories,
} from "@/modules/admin-ui/admin-read-model";

import {
  AdminCategoryManager,
} from "./AdminCategoryManager";

export const dynamic =
  "force-dynamic";

export default async function AdminCategoriesPage() {
  const access =
    await getAdminWorkspaceAccess();

  if (!access.currentUser) {
    redirect(
      "/login?next=%2Fadmin%2Fcategories",
    );
  }

  if (!access.canEditCatalog) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-bold">
          Доступ запрещён
        </h1>

        <p className="mt-4 text-sm text-[var(--muted)]">
          Требуется разрешение EDIT_SHARED_CATALOG.
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

  const categories =
    await listAdminCategories();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            R7.4 · Admin
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Управление категориями
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Slug категории — канонический идентификатор и после создания
            не переименовывается. R7.4 изменяет только название и описание
            и не предоставляет destructive delete.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          ← Админка
        </Link>
      </div>

      <AdminCategoryManager
        initialCategories={
          categories.map(
            (category) => ({
              ...category,
              updatedAt:
                category.updatedAt.toISOString(),
            }),
          )
        }
      />
    </main>
  );
}
