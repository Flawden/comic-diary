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
      <div className="reader-page admin-page">
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
      </div>
    );
  }

  const counts =
    await getAdminDashboardCounts();

  return (
    <div className="reader-page admin-page admin-dashboard">
      <header className="admin-dashboard-hero">
        <div className="admin-dashboard-hero-copy">
          <p className="admin-dashboard-kicker">
            Административная панель чайной
          </p>
          <span className="admin-dashboard-ornament" aria-hidden="true">
            ✦ ───── ✦ ───── ✦
          </span>
          <h1>Добро пожаловать, хозяин!</h1>
          <p className="admin-dashboard-intro">
            Здесь ты управляешь библиотекой, историями
            и жизнью нашей чайной.
          </p>
          <div className="admin-dashboard-hero-actions">
            {access.canEditCatalog ? (
              <Link href="/admin/comics" className="admin-dashboard-hero-button">
                К произведениям <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
            <Link href="/" className="admin-dashboard-hero-ghost">
              Открыть сайт <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="admin-dashboard-section" aria-labelledby="admin-dashboard-stats-heading">
        <div className="admin-dashboard-section-heading">
          <div>
            <p className="admin-dashboard-eyebrow">Сейчас в чайной</p>
            <h2 id="admin-dashboard-stats-heading">Библиотека в цифрах</h2>
          </div>
          <p className="admin-dashboard-section-note">Данные из рабочей базы</p>
        </div>
        <div className="admin-dashboard-stats">
          <article className="admin-dashboard-stat">
            <DashboardIcon name="books" />
            <div><strong>{counts.comics}</strong><span>В общем каталоге</span></div>
          </article>
          <article className="admin-dashboard-stat">
            <DashboardIcon name="chapters" />
            <div><strong>{counts.chapters}</strong><span>Глав в базе</span></div>
          </article>
          <article className="admin-dashboard-stat">
            <DashboardIcon name="categories" />
            <div><strong>{counts.categories}</strong><span>Категорий</span></div>
          </article>
          <article className="admin-dashboard-stat">
            <DashboardIcon name="users" />
            <div><strong>{counts.users}</strong><span>Аккаунтов</span></div>
          </article>
        </div>
      </section>

      <div className="admin-dashboard-columns">
        <section className="admin-dashboard-panel" aria-labelledby="admin-dashboard-actions-heading">
          <div className="admin-dashboard-section-heading">
            <div>
              <p className="admin-dashboard-eyebrow">Рабочее место</p>
              <h2 id="admin-dashboard-actions-heading">Быстрые действия</h2>
            </div>
          </div>
          <div className="admin-dashboard-action-grid">
            {access.canEditCatalog ? (
              <>
                <DashboardAction href="/admin/comics" name="books"
                  title="Произведения" description="Обложки, описания и публикации" />
                <DashboardAction href="/admin/comics#chapters" name="chapters"
                  title="Главы" description="Порядок, статус и редактирование" />
                <DashboardAction href="/admin/categories" name="categories"
                  title="Категории" description="Разделы и организация каталога" />
              </>
            ) : null}
            {access.canRunBulkImport ? (
              <DashboardAction href="/admin/catalog-import/vk" name="import"
                title="Импорт из VK" description="Перенос и проверка материалов" />
            ) : null}
            {access.canAdminUsers ? (
              <DashboardAction href="/admin/users" name="users"
                title="Пользователи" description="Аккаунты и права доступа" />
            ) : null}
            {access.canViewAudit ? (
              <DashboardAction href="/admin/audit" name="audit"
                title="Журнал аудита" description="Записи административных действий" />
            ) : null}
          </div>
        </section>

        <aside className="admin-dashboard-panel admin-dashboard-guidance" aria-labelledby="admin-dashboard-guidance-heading">
          <div className="admin-dashboard-section-heading">
            <div>
              <p className="admin-dashboard-eyebrow">Записка на столике</p>
              <h2 id="admin-dashboard-guidance-heading">Перед публикацией</h2>
            </div>
          </div>
          <p>
            Проверь обложку, порядок глав и статус произведения.
            Всё готово? Тогда читатели смогут продолжить свою историю.
          </p>
          {access.canEditCatalog ? (
            <Link href="/admin/comics#chapters" className="admin-dashboard-guidance-link">
              Проверить главы <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <p className="admin-dashboard-guidance-muted">
              Действия в панели зависят от прав твоей роли.
            </p>
          )}
          <div className="admin-dashboard-guidance-ornament" aria-hidden="true">✦ ─── ✦</div>
        </aside>
      </div>
    </div>
  );
}

type DashboardIconName =
  | "books"
  | "chapters"
  | "categories"
  | "users"
  | "import"
  | "audit";

const dashboardIconPaths: Record<DashboardIconName, string> = {
  books: "M4 4h6v16H4z M10 4h6v16h-6z M17 5l3-1 2 15-3 1z",
  chapters: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5 M3 16l9 5 9-5",
  categories: "M20 13 11 22 2 13V3h10l8 10ZM7.5 8h.01",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  import: "M12 3v12m0 0-5-5m5 5 5-5 M4 17v4h16v-4",
  audit: "M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5h-3 M8 12h8 M8 16h8",
};

function DashboardAction({
  href,
  name,
  title,
  description,
}: {
  href: string;
  name: DashboardIconName;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="admin-dashboard-action">
      <DashboardIcon name={name} />
      <span className="admin-dashboard-action-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="admin-dashboard-action-arrow" aria-hidden="true">↗</span>
    </Link>
  );
}

function DashboardIcon({ name }: { name: DashboardIconName }) {
  return (
    <span className="admin-dashboard-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="23" height="23" fill="none"
        stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        <path d={dashboardIconPaths[name]} />
      </svg>
    </span>
  );
}
