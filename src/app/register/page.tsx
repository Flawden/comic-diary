import Link from "next/link";

import {
  RegisterForm,
} from "./RegisterForm";

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
    Array.isArray(
      value,
    )
  ) {
    return value[0];
  }

  return value;
}

export default async function RegisterPage({
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
      ) ??
        "/library",
    );

  const loginHref =
    `/login?next=${encodeURIComponent(
      nextPath,
    )}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-8">
      <div className="w-full">
        <p className="text-sm font-semibold text-[var(--primary)]">
          Comic Diary
        </p>

        <h1 className="mt-2 reader-title">
          Регистрация
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Создайте аккаунт, чтобы сохранять
          личную библиотеку, прогресс чтения,
          оценки и заметки.
        </p>

        <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">
            Новый аккаунт
          </h2>

          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            После регистрации вы сразу войдёте
            в аккаунт.
          </p>

          <RegisterForm
            nextPath={
              nextPath
            }
          />
        </section>

        <div className="mt-6 text-center text-sm text-[var(--muted)]">
          Уже есть аккаунт?{" "}
          <Link
            href={
              loginHref
            }
            className="font-medium text-[var(--primary)] hover:underline"
          >
            Войти
          </Link>
        </div>

        <div className="mt-3 text-center">
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
