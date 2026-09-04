import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  getAdminWorkspaceAccess,
} from "@/modules/admin-ui/admin-page-access";

import {
  listAdminCategories,
  listAdminComics,
} from "@/modules/admin-ui/admin-read-model";

import {
  AdminComicManager,
} from "./AdminComicManager";

export const dynamic =
  "force-dynamic";

export default async function AdminComicsPage() {
  const access =
    await getAdminWorkspaceAccess();

  if (!access.currentUser) {
    redirect(
      "/login?next=%2Fadmin%2Fcomics",
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

  const [
    comics,
    categories,
  ] =
    await Promise.all([
      listAdminComics(),
      listAdminCategories(),
    ]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            R7.3 · Admin
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Управление комиксами
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Slug — канонический идентификатор:
            после создания он не переименовывается.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          ← Админка
        </Link>
      </div>

      <AdminComicManager
        categories={
          categories
        }
        initialComics={
          comics.map(
            (comic) => ({
              ...comic,
              updatedAt:
                comic.updatedAt.toISOString(),
            }),
          )
        }
      />
    </main>
  );
}
