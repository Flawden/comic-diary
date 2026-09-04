"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type UserRole =
  | "USER"
  | "EDITOR"
  | "ADMIN";

type AdminUser = {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiEnvelope = {
  ok?: unknown;
  error?: {
    kind?: unknown;
  };
  sessionsRevoked?: unknown;
};

type Props = {
  currentUserId: number;
  initialUsers: AdminUser[];
};

const roleLabels: Record<
  UserRole,
  string
> = {
  USER: "Пользователь",
  EDITOR: "Редактор",
  ADMIN: "Администратор",
};

function errorKind(
  body: ApiEnvelope,
): string | null {
  return typeof body.error?.kind ===
    "string"
    ? body.error.kind
    : null;
}

function messageForError(
  kind: string | null,
): string {
  switch (kind) {
    case "last-active-admin":
      return "Нельзя лишить прав или отключить последнего активного администратора.";

    case "user-not-found":
      return "Пользователь больше не найден.";

    case "forbidden":
      return "Недостаточно прав для управления пользователями.";

    case "origin-not-allowed":
      return "Запрос отклонён политикой same-origin.";

    case "invalid-role":
    case "invalid-active-state":
    case "invalid-request":
      return "Сервер отклонил новые параметры аккаунта.";

    default:
      return "Не удалось изменить аккаунт.";
  }
}

export function AdminUserManager({
  currentUserId,
  initialUsers,
}: Props) {
  const router =
    useRouter();

  const [
    busyId,
    setBusyId,
  ] = useState<
    number | null
  >(null);

  const [
    message,
    setMessage,
  ] = useState<
    string | null
  >(null);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  async function updateUser(
    event:
      FormEvent<HTMLFormElement>,
    user: AdminUser,
  ) {
    event.preventDefault();

    if (busyId !== null) {
      return;
    }

    const form =
      event.currentTarget;

    const data =
      new FormData(
        form,
      );

    const roleValue =
      data.get(
        "role",
      );

    const role =
      typeof roleValue ===
        "string"
        ? roleValue as UserRole
        : user.role;

    const isActive =
      data.get(
        "isActive",
      ) === "on";

    const authorityReduced =
      (
        user.role ===
          "ADMIN" &&
        role !==
          "ADMIN"
      ) ||
      (
        user.isActive &&
        !isActive
      );

    if (
      authorityReduced &&
      !window.confirm(
        "Это уменьшит полномочия аккаунта и отзовёт его текущие сессии. Продолжить?",
      )
    ) {
      return;
    }

    setBusyId(
      user.id,
    );
    setMessage(null);
    setError(null);

    try {
      const response =
        await fetch(
          `/api/admin/users/${user.id}`,
          {
            method:
              "PATCH",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                role,
                isActive,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () =>
              ({}) as ApiEnvelope,
          ) as ApiEnvelope;

      if (
        response.status ===
        401
      ) {
        router.replace(
          "/login?next=%2Fadmin%2Fusers",
        );
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(
          messageForError(
            errorKind(
              body,
            ),
          ),
        );
        setBusyId(null);
        return;
      }

      const revoked =
        typeof body.sessionsRevoked ===
          "number"
          ? body.sessionsRevoked
          : 0;

      setMessage(
        `Аккаунт ${user.email} обновлён. Отозвано сессий: ${revoked}.`,
      );

      setBusyId(null);

      if (
        user.id ===
          currentUserId &&
        (
          role !==
            user.role ||
          isActive !==
            user.isActive
        )
      ) {
        router.replace(
          "/login?next=%2Fadmin",
        );
        router.refresh();
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером.",
      );
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8">
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="mb-5 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800"
        >
          {message}
        </p>
      ) : null}

      <div className="space-y-4">
        {initialUsers.map(
          (user) => (
            <article
              key={
                user.id
              }
              className="rounded-2xl border border-black/5 bg-[var(--surface)] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      {user.displayName ??
                        user.email}
                    </h2>

                    {user.id ===
                    currentUserId ? (
                      <span className="rounded-full bg-[var(--background)] px-2 py-1 text-xs font-semibold">
                        Вы
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 break-all text-sm text-[var(--muted)]">
                    {user.email}
                  </p>

                  <p className="mt-2 text-xs text-[var(--muted)]">
                    ID {user.id} · создан{" "}
                    {new Date(
                      user.createdAt,
                    ).toLocaleString(
                      "ru-RU",
                    )}
                  </p>
                </div>

                <span
                  className={
                    user.isActive
                      ? "rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800"
                      : "rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs font-semibold text-[var(--muted)]"
                  }
                >
                  {user.isActive
                    ? "Активен"
                    : "Отключён"}
                </span>
              </div>

              <form
                onSubmit={(
                  event,
                ) =>
                  updateUser(
                    event,
                    user,
                  )
                }
                className="mt-5 grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
              >
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    Роль
                  </span>

                  <select
                    name="role"
                    defaultValue={
                      user.role
                    }
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
                  >
                    {(
                      Object.entries(
                        roleLabels,
                      ) as [
                        UserRole,
                        string,
                      ][]
                    ).map(
                      ([
                        value,
                        label,
                      ]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="flex min-h-10 items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={
                      user.isActive
                    }
                  />
                  Активен
                </label>

                <button
                  type="submit"
                  disabled={
                    busyId !==
                    null
                  }
                  className="min-h-10 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                >
                  Сохранить
                </button>
              </form>
            </article>
          ),
        )}
      </div>
    </div>
  );
}
