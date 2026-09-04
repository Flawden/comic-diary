"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type AdminCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

type Props = {
  initialCategories: AdminCategory[];
};

type ApiEnvelope = {
  ok?: unknown;
  error?: {
    kind?: unknown;
  };
};

function nullableText(
  value: FormDataEntryValue | null,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed === ""
    ? null
    : trimmed;
}

function textValue(
  form: FormData,
  name: string,
): string {
  const value =
    form.get(
      name,
    );

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function apiErrorKind(
  body: ApiEnvelope,
): string | null {
  return typeof body.error?.kind ===
    "string"
    ? body.error.kind
    : null;
}

function errorMessage(
  kind: string | null,
): string {
  switch (kind) {
    case "category-already-exists":
      return "Категория с таким slug уже существует.";

    case "category-not-found":
      return "Категория больше не найдена. Обновите страницу.";

    case "invalid-catalog":
    case "invalid-category-request":
      return "Проверьте slug, название и описание категории.";

    case "origin-not-allowed":
      return "Запрос отклонён политикой same-origin.";

    case "forbidden":
      return "Недостаточно прав для изменения общего каталога.";

    case "unauthorized":
      return "Сессия закончилась. Войдите снова.";

    default:
      return "Не удалось сохранить категорию.";
  }
}

function categoryPayload(
  form: FormData,
  immutableSlug?: string,
) {
  return {
    slug:
      immutableSlug ??
      textValue(
        form,
        "slug",
      ),

    name:
      textValue(
        form,
        "name",
      ),

    description:
      nullableText(
        form.get(
          "description",
        ),
      ),
  };
}

function CategoryFields({
  category,
  create,
}: {
  category?: AdminCategory;
  create: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Slug
          </span>

          <input
            name="slug"
            required
            readOnly={!create}
            defaultValue={
              category?.slug ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 read-only:bg-black/5"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Название
          </span>

          <input
            name="name"
            required
            defaultValue={
              category?.name ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">
          Описание
        </span>

        <textarea
          name="description"
          rows={4}
          defaultValue={
            category?.description ??
            ""
          }
          className="w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2"
        />
      </label>
    </>
  );
}

export function AdminCategoryManager({
  initialCategories,
}: Props) {
  const router =
    useRouter();

  const [
    busyKey,
    setBusyKey,
  ] = useState<
    string | null
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

  async function saveCategory(
    event:
      FormEvent<HTMLFormElement>,
    mode:
      | "create"
      | "update",
    immutableSlug?: string,
  ) {
    event.preventDefault();

    const key =
      mode === "create"
        ? "create"
        : `update:${immutableSlug}`;

    if (busyKey) {
      return;
    }

    setBusyKey(
      key,
    );
    setMessage(null);
    setError(null);

    const form =
      event.currentTarget;

    const payload =
      categoryPayload(
        new FormData(
          form,
        ),
        immutableSlug,
      );

    if (
      !payload.slug ||
      !payload.name
    ) {
      setError(
        "Slug и название обязательны.",
      );
      setBusyKey(null);
      return;
    }

    try {
      const response =
        await fetch(
          "/api/admin/catalog/categories",
          {
            method:
              mode ===
                "create"
                ? "POST"
                : "PATCH",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload,
              ),
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
          "/login?next=%2Fadmin%2Fcategories",
        );
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(
          errorMessage(
            apiErrorKind(
              body,
            ),
          ),
        );
        setBusyKey(null);
        return;
      }

      if (
        mode ===
        "create"
      ) {
        form.reset();
        setMessage(
          `Категория ${payload.slug} создана.`,
        );
      } else {
        setMessage(
          `Категория ${payload.slug} обновлена.`,
        );
      }

      setBusyKey(null);
      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером.",
      );
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800"
        >
          {message}
        </p>
      ) : null}

      <section className="rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          Новая категория
        </h2>

        <form
          onSubmit={(
            event,
          ) =>
            saveCategory(
              event,
              "create",
            )
          }
          className="mt-6"
        >
          <CategoryFields
            create
          />

          <button
            type="submit"
            disabled={
              busyKey !==
                null
            }
            className="mt-5 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            Создать категорию
          </button>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Категории
          </h2>

          <p className="text-sm text-[var(--muted)]">
            Всего: {initialCategories.length}
          </p>
        </div>

        {initialCategories.length ===
        0 ? (
          <p className="mt-4 text-[var(--muted)]">
            Категорий пока нет.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {initialCategories.map(
              (category) => (
                <details
                  key={
                    category.id
                  }
                  className="rounded-2xl border border-black/5 bg-[var(--surface)] p-5 shadow-sm"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {category.name}
                        </h3>

                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {category.slug}
                        </p>
                      </div>

                      <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold">
                        slug неизменяемый
                      </span>
                    </div>
                  </summary>

                  <form
                    onSubmit={(
                      event,
                    ) =>
                      saveCategory(
                        event,
                        "update",
                        category.slug,
                      )
                    }
                    className="mt-6 border-t border-black/10 pt-6"
                  >
                    <CategoryFields
                      category={
                        category
                      }
                      create={
                        false
                      }
                    />

                    <div className="mt-5 flex flex-wrap items-center gap-4">
                      <button
                        type="submit"
                        disabled={
                          busyKey !==
                            null
                        }
                        className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                      >
                        Сохранить изменения
                      </button>

                      <span className="text-xs text-[var(--muted)]">
                        Удаление категорий в R7.4 не реализуется.
                      </span>
                    </div>
                  </form>
                </details>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
