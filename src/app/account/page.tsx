import Link from "next/link";
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

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold text-[var(--primary)]">
        Comic Diary
      </p>

      <h1 className="mt-2 text-3xl font-bold">
        Аккаунт
      </h1>

      <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
        Здесь можно проверить данные аккаунта,
        изменить отображаемое имя и безопасно
        изменить пароль.
      </p>

      <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">
          Данные аккаунта
        </h2>

        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-[var(--muted)]">
              Email
            </dt>
            <dd className="mt-1 break-all">
              {user.email}
            </dd>
          </div>

          <div>
            <dt className="font-medium text-[var(--muted)]">
              Имя
            </dt>
            <dd className="mt-1">
              {user.displayName ??
                "Не указано"}
            </dd>
          </div>

          <div>
            <dt className="font-medium text-[var(--muted)]">
              Роль
            </dt>
            <dd className="mt-1">
              {roleLabel(
                user.role,
              )}
            </dd>
          </div>
        </dl>
      </section>

      {hasPermission(user.role, "EDIT_SHARED_CATALOG") ? (
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Панель управления</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {user.role === "ADMIN"
              ? "Управление каталогом, главами, пользователями и журналом изменений."
              : "Редактирование каталога и глав в пределах прав редактора."}
          </p>
          <Link href="/admin" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
            Открыть панель управления →
          </Link>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">
          Профиль
        </h2>

        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Это имя показывается как часть вашего
          профиля. Email, роль и права аккаунта
          здесь не изменяются.
        </p>

        <AccountProfileForm
          initialDisplayName={
            user.displayName
          }
        />
      </section>

      <section className="mt-6 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">
          Смена пароля
        </h2>

        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Потребуется текущий пароль. После
          успешной смены все старые сессии
          будут завершены, а эта сессия
          будет обновлена.
        </p>

        <AccountPasswordForm />
      </section>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link
          href="/library"
          className="font-medium text-[var(--primary)] hover:underline"
        >
          В библиотеку
        </Link>

        <Link
          href="/"
          className="font-medium text-[var(--primary)] hover:underline"
        >
          В каталог
        </Link>
      </div>
    </div>
  );
}
