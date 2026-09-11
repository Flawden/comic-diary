"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({
  nextPath,
}: LoginFormProps) {
  const router =
    useRouter();

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const form =
      event.currentTarget;

    const data =
      new FormData(form);

    const email =
      data.get("email");

    const password =
      data.get("password");

    if (
      typeof email !==
        "string" ||
      typeof password !==
        "string"
    ) {
      setError(
        "Не удалось отправить форму. Попробуйте ещё раз.",
      );

      setSubmitting(false);
      return;
    }

    try {
      const response =
        await fetch(
          "/api/auth/login",
          {
            method: "POST",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email,
                password,
              }),
          },
        );

      if (
        response.status === 401
      ) {
        setError(
          "Неверный логин или пароль.",
        );

        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError(
          "Не удалось выполнить вход. Попробуйте ещё раз.",
        );

        setSubmitting(false);
        return;
      }

      router.replace(
        nextPath,
      );

      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером. Попробуйте ещё раз.",
      );

      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-5"
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Email
        </span>

        <input
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={320}
          disabled={submitting}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Пароль
        </span>

        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={submitting}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-wait disabled:opacity-60"
      >
        {submitting
          ? "Входим…"
          : "Войти"}
      </button>
    </form>
  );
}
