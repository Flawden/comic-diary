import Link from "next/link";

import {
  LoginForm,
} from "./LoginForm";

import {
  getSafeLoginRedirect,
} from "@/modules/auth/login-redirect";

export const dynamic =
  "force-dynamic";

type SearchParams = {
  next?:
    | string
    | string[];
};

function firstValue(
  value:
    | string
    | string[]
    | undefined,
): string | undefined {
  if (
    Array.isArray(value)
  ) {
    return value[0];
  }

  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  const params =
    await searchParams;

  const nextPath =
    getSafeLoginRedirect(
      firstValue(
        params.next,
      ),
    );

  const registerHref =
    `/register?next=${encodeURIComponent(
      nextPath,
    )}`;

  return (
    <main className="fantasy-auth-page mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-8">
      <div className="fantasy-auth-inner w-full">
        <p className="text-sm font-semibold text-[var(--primary)]">
          Comic Diary
        </p>

        <h1 className="mt-2 reader-title">
          Вход
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Войдите, чтобы продолжить вести
          библиотеку, прогресс чтения,
          оценки и заметки.
        </p>

        <section className="fantasy-auth-card mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">
            Ваш аккаунт
          </h2>

          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Используйте email и пароль
            Comic Diary.
          </p>

          <LoginForm
            nextPath={
              nextPath
            }
          />
        </section>

        <div className="fantasy-auth-links mt-6 text-center text-sm text-[var(--muted)]">
          Нет аккаунта?{" "}
          <Link
            href={
              registerHref
            }
            className="font-medium text-[var(--primary)] hover:underline"
          >
            Зарегистрироваться
          </Link>
        </div>

        <div className="fantasy-auth-links mt-3 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Вернуться в каталог
          </Link>
        </div>
      </div>
    </main>
  );
}
