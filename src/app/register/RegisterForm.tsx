"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type RegisterFormProps = {
  nextPath: string;
};

type ErrorResponse = {
  error?: unknown;
};

export function RegisterForm({
  nextPath,
}: RegisterFormProps) {
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
      new FormData(
        form,
      );

    const email =
      data.get(
        "email",
      );

    const password =
      data.get(
        "password",
      );

    const passwordConfirm =
      data.get(
        "passwordConfirm",
      );

    if (
      typeof email !==
        "string" ||
      typeof password !==
        "string" ||
      typeof passwordConfirm !==
        "string"
    ) {
      setError(
        "Не удалось отправить форму. Попробуйте ещё раз.",
      );

      setSubmitting(false);
      return;
    }

    if (
      password !==
        passwordConfirm
    ) {
      setError(
        "Пароли не совпадают.",
      );

      setSubmitting(false);
      return;
    }

    try {
      const response =
        await fetch(
          "/api/auth/register",
          {
            method:
              "POST",

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
                passwordConfirm,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () =>
              ({}) as ErrorResponse,
          ) as ErrorResponse;

      if (
        response.status ===
          409 &&
        body.error ===
          "email_unavailable"
      ) {
        setError(
          "Аккаунт с этим email уже существует. Попробуйте войти.",
        );

        setSubmitting(false);
        return;
      }

      if (
        response.status ===
          400 &&
        body.error ===
          "password_mismatch"
      ) {
        setError(
          "Пароли не совпадают.",
        );

        setSubmitting(false);
        return;
      }

      if (
        response.status ===
          400 &&
        body.error ===
          "weak_password"
      ) {
        setError(
          "Пароль должен содержать не менее 10 символов.",
        );

        setSubmitting(false);
        return;
      }

      if (
        response.status ===
          400 &&
        body.error ===
          "invalid_email"
      ) {
        setError(
          "Введите корректный email.",
        );

        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError(
          "Не удалось создать аккаунт. Попробуйте ещё раз.",
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
      onSubmit={
        handleSubmit
      }
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
          className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Пароль
        </span>

        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={256}
          disabled={submitting}
          className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">
          Не менее 10 символов.
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Повторите пароль
        </span>

        <input
          type="password"
          name="passwordConfirm"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={256}
          disabled={submitting}
          className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
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
          ? "Создаём аккаунт…"
          : "Создать аккаунт"}
      </button>
    </form>
  );
}
