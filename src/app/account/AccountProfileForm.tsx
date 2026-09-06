"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type AccountProfileFormProps = {
  initialDisplayName:
    string | null;
};

type ErrorResponse = {
  error?: unknown;
};

export function AccountProfileForm({
  initialDisplayName,
}: AccountProfileFormProps) {
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

    const displayName =
      data.get(
        "displayName",
      );

    if (
      typeof displayName !==
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
          "/api/account/profile",
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
                displayName,
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
        (
          body.error ===
            "unauthorized" ||
          body.error ===
            "account_unavailable"
        )
      ) {
        router.replace(
          "/login?next=%2Faccount",
        );
        router.refresh();
        return;
      }

      if (
        response.status ===
          400 &&
        body.error ===
          "invalid_display_name"
      ) {
        setError(
          "Имя должно быть одной строкой длиной не более 120 символов.",
        );
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError(
          "Не удалось изменить имя. Попробуйте ещё раз.",
        );
        setSubmitting(false);
        return;
      }

      setSuccess(
        displayName.trim().length > 0
          ? "Отображаемое имя обновлено."
          : "Отображаемое имя удалено.",
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
          Отображаемое имя
        </span>

        <input
          type="text"
          name="displayName"
          defaultValue={
            initialDisplayName ??
            ""
          }
          autoComplete="name"
          maxLength={120}
          disabled={submitting}
          className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">
          До 120 символов. Оставьте поле пустым, чтобы удалить имя.
        </span>
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
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-wait disabled:opacity-60"
      >
        {submitting
          ? "Сохраняем…"
          : "Сохранить имя"}
      </button>
    </form>
  );
}
