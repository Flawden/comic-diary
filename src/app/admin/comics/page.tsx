import Link from "next/link";

import "./admin-studio.css";

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

  const [
    comics,
    categories,
  ] =
    await Promise.all([
      listAdminComics(),
      listAdminCategories(),
    ]);

  return (
    <div className="reader-page admin-page admin-studio-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            Панель управления
          </p>

          <h1 className="mt-2 reader-title">
            Управление комиксами
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Компактная рабочая область для произведений, глав и публикации.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          ← Панель управления
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
              chapters: comic.chapters.map(chapter => ({
                ...chapter,
                releasedAt: chapter.releasedAt?.toISOString() ?? null,
                createdAt: chapter.createdAt.toISOString(),
                updatedAt: chapter.updatedAt.toISOString(),
              })),
            }),
          )
        }
      />
    </div>
  );
}
