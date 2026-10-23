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
      <div className="reader-page admin-page">
        <h1 className="reader-title">
          Доступ запрещён
        </h1>

        <p className="mt-4 text-sm text-[var(--muted)]">
          Этот раздел доступен редакторам и администраторам.
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

  const categories =
    await listAdminCategories();

  return (
    <div className="reader-page admin-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            Панель управления
          </p>

          <h1 className="mt-2 reader-title">
            Управление категориями
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Создавайте категории и редактируйте их названия и описания. Адрес категории после создания сохраняется.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          ← Панель управления
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
    </div>
  );
}
