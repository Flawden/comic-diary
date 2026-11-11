import Link from "next/link";
import { DiaryExport } from "./DiaryExport";
import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE } from "@/shared/theme/themes";
import { getUserReadingStats } from "@/modules/library/queries/get-user-reading-stats";
import { ReadingStats } from "./ReadingStats";
import { ThemeSelector } from "./ThemeSelector";
import { LogoutButton } from "./LogoutButton";
import { hasPermission } from "@/modules/auth/permissions";

import {
  redirect,
} from "next/navigation";

import {
  getCurrentUser,
} from "@/modules/auth/request-identity";

import {
  AccountPasswordForm,
} from "./AccountPasswordForm";

import {
  AccountProfileForm,
} from "./AccountProfileForm";

export const dynamic =
  "force-dynamic";

function roleLabel(
  role:
    | "USER"
    | "EDITOR"
    | "ADMIN",
): string {
  switch (role) {
    case "ADMIN":
      return "Администратор";

    case "EDITOR":
      return "Редактор";

    default:
      return "Пользователь";
  }
}

export default async function AccountPage() {
  const user =
    await getCurrentUser();

  if (!user) {
    redirect(
      "/login?next=%2Faccount",
    );
  }

  const stats = await getUserReadingStats(user.id);
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="reader-page account-page fantasy-account">
      <header className="reader-heading">
        <div><p className="reader-eyebrow">Ваш уголок</p><h1>Профиль</h1>
        <p>Дневник, оформление и настройки аккаунта.</p></div>
        <Link href="/library" className="tea-outline">К моей полке →</Link>
      </header>
      <nav className="reader-section-nav" aria-label="Разделы профиля">
        <a href="#account-diary">Мой дневник</a><a href="#appearance">Оформление</a><a href="#account-settings">Настройки</a>
      </nav>
      <div className="account-layout">
        <aside className="account-identity reader-panel">
          <span className="account-monogram" aria-hidden="true">{(user.displayName || user.email).slice(0,1).toLocaleUpperCase("ru")}</span>
          <h2>{user.displayName || "Читатель"}</h2>
          <p className="account-email">{user.email}</p>
          <p className="reader-eyebrow">{roleLabel(user.role)}</p>
          <details className="account-edit-name"><summary>Изменить имя</summary><AccountProfileForm initialDisplayName={user.displayName} /></details>
          {(["EDIT_SHARED_CATALOG", "ADMIN_USERS", "RUN_BULK_IMPORT", "ADMIN_SECURITY"] as const).some(permission => hasPermission(user.role, permission)) ? <Link href="/admin" className="tea-outline">Панель управления →</Link> : null}
          <LogoutButton />
        </aside>
        <div className="account-content">
          <div id="account-diary"><ReadingStats stats={stats} /></div>
          <div id="appearance"><ThemeSelector initialTheme={theme} /></div>
          <section id="account-settings" className="reader-panel account-settings">
            <h2>Настройки и данные</h2>
            <details><summary>Скачать дневник <span>Статусы, оценки и заметки</span></summary><DiaryExport /></details>
            <details><summary>Изменить пароль</summary>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">Потребуется текущий пароль. После смены пароля вход на других устройствах завершится.</p>
              <AccountPasswordForm />
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
