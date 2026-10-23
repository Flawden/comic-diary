"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type ErrorResponse = {
  error?: unknown;
};

export function AccountPasswordForm() {
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

  const [
    success,
    setSuccess,
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
    setSuccess(null);

    const form =
      event.currentTarget;

    const data =
      new FormData(
        form,
      );

    const currentPassword =
      data.get(
        "currentPassword",
      );

    const newPassword =
      data.get(
        "newPassword",
      );

    const newPasswordConfirm =
      data.get(
        "newPasswordConfirm",
      );

    if (
      typeof currentPassword !==
        "string" ||
      typeof newPassword !==
        "string" ||
      typeof newPasswordConfirm !==
        "string"
    ) {
      setError(
        "Не удалось отправить форму. Попробуйте ещё раз.",
      );
      setSubmitting(false);
      return;
    }

    if (
      newPassword !==
        newPasswordConfirm
    ) {
      setError(
        "Новые пароли не совпадают.",
      );
      setSubmitting(false);
      return;
    }

    try {
      const response =
        await fetch(
          "/api/account/password",
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
                currentPassword,
                newPassword,
                newPasswordConfirm,
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
          401 &&
        body.error ===
          "unauthorized"
      ) {
        router.replace(
          "/login?next=%2Faccount",
        );
        router.refresh();
        return;
      }

      if (
        response.status ===
          401 &&
        body.error ===
          "invalid_current_password"
      ) {
        setError(
          "Текущий пароль указан неверно.",
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
          "Новые пароли не совпадают.",
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
          "Новый пароль должен содержать не менее 10 символов.",
        );
        setSubmitting(false);
        return;
      }

      if (
        response.status ===
          400 &&
        body.error ===
          "password_unchanged"
      ) {
        setError(
          "Новый пароль должен отличаться от текущего.",
        );
        setSubmitting(false);
        return;
      }

      if (
        response.status ===
          429 &&
        body.error ===
          "rate_limited"
      ) {
        setError(
          "Слишком много попыток смены пароля. Попробуйте позже.",
        );
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError(
          "Не удалось изменить пароль. Попробуйте ещё раз.",
        );
        setSubmitting(false);
        return;
      }

      form.reset();

      setSuccess(
        "Пароль изменён. Все старые сессии завершены, текущая сессия обновлена.",
      );

      setSubmitting(false);
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
          Текущий пароль
        </span>

        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          disabled={submitting}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Новый пароль
        </span>

        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={256}
          disabled={submitting}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">
          Не менее 10 символов.
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Повторите новый пароль
        </span>

        <input
          type="password"
          name="newPasswordConfirm"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={256}
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

      {success ? (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800"
        >
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--primary-foreground)] transition disabled:cursor-wait disabled:opacity-60"
      >
        {submitting
          ? "Меняем пароль…"
          : "Изменить пароль"}
      </button>
    </form>
  );
}
