"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Category = {
  id: number;
  slug: string;
  name: string;
};

type PublicationStatus =
  | "PUBLISHED"
  | "HIDDEN"
  | "ARCHIVED";

type ChapterCreateStatus =
  | "SCHEDULED"
  | "RELEASED";

type ChapterEditStatus =
  | "SCHEDULED"
  | "RELEASED"
  | "ARCHIVED";

type AdminChapter = {
  id: number;
  displayCode: string;
  title: string | null;
  sourceUrl: string | null;
  sortOrder: number;
  status:
    | "SCHEDULED"
    | "RELEASED"
    | "ARCHIVED";
  releasedAt: string | null;
  updatedAt: string;
};

type AdminComic = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  authorName: string | null;
  translatorName: string | null;
  translatorNote: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  totalChapters: number | null;
  publicationStatus:
    PublicationStatus;
  categorySlug: string | null;
  categoryName: string | null;
  updatedAt: string;
  chapters: AdminChapter[];
};

type Props = {
  categories: Category[];
  initialComics: AdminComic[];
};

type ApiEnvelope = {
  ok?: unknown;
  error?: {
    kind?: unknown;
  };
};

const publicationStatusLabels: Record<
  PublicationStatus,
  string
> = {
  PUBLISHED: "Опубликован",
  HIDDEN: "Скрыт",
  ARCHIVED: "Архив",
};

const chapterCreateStatusLabels: Record<
  ChapterCreateStatus,
  string
> = {
  SCHEDULED: "Запланирована",
  RELEASED: "Опубликована сейчас",
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
    case "comic-already-exists":
      return "Комикс с таким slug уже существует.";

    case "comic-not-found":
      return "Комикс больше не найден. Обновите страницу.";

    case "category-not-found":
      return "Выбранная категория не найдена.";

    case "invalid-catalog":
    case "invalid-catalog-request":
      return "Проверьте поля комикса: данные не прошли валидацию.";

    case "origin-not-allowed":
      return "Запрос отклонён политикой same-origin.";

    case "forbidden":
      return "Недостаточно прав для изменения каталога.";

    case "unauthorized":
      return "Сессия закончилась. Войдите снова.";

    default:
      return "Не удалось сохранить комикс.";
  }
}

function chapterErrorMessage(
  kind: string | null,
): string {
  switch (kind) {
    case "chapter-display-code-conflict":
      return "Глава с таким кодом уже существует.";

    case "invalid-chapter":
    case "invalid-chapter-request":
      return "Проверьте поля главы: данные не прошли валидацию.";

    case "comic-not-found":
      return "Комикс больше не найден. Обновите страницу.";

    case "origin-not-allowed":
      return "Запрос отклонён политикой same-origin.";

    case "forbidden":
      return "Недостаточно прав для изменения каталога.";

    case "unauthorized":
      return "Сессия закончилась. Войдите снова.";

    default:
      return "Не удалось добавить главу.";
  }
}

function nextChapterSortOrder(
  comic: AdminComic,
): number {
  if (
    comic.chapters.length ===
    0
  ) {
    return 1;
  }

  return (
    Math.max(
      ...comic.chapters.map(
        (chapter) =>
          chapter.sortOrder,
      ),
    ) + 1
  );
}

function setFormControlValue(
  form: HTMLFormElement,
  name: string,
  value: string,
) {
  const control =
    form.elements.namedItem(
      name,
    );

  if (
    control instanceof
      HTMLInputElement ||
    control instanceof
      HTMLSelectElement
  ) {
    control.value =
      value;
  }
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

function comicPayload(
  form: FormData,
  immutableSlug?: string,
) {
  const rawTotal =
    textValue(
      form,
      "totalChapters",
    );

  return {
    slug:
      immutableSlug ??
      textValue(
        form,
        "slug",
      ),

    title:
      textValue(
        form,
        "title",
      ),

    description:
      nullableText(
        form.get(
          "description",
        ),
      ),

    authorName:
      nullableText(
        form.get(
          "authorName",
        ),
      ),

    translatorName:
      nullableText(
        form.get(
          "translatorName",
        ),
      ),

    translatorNote:
      nullableText(
        form.get(
          "translatorNote",
        ),
      ),

    coverUrl:
      nullableText(
        form.get(
          "coverUrl",
        ),
      ),

    sourceUrl:
      textValue(
        form,
        "sourceUrl",
      ),

    totalChapters:
      rawTotal === ""
        ? null
        : Number(
            rawTotal,
          ),

    publicationStatus:
      textValue(
        form,
        "publicationStatus",
      ),

    categorySlug:
      textValue(
        form,
        "categorySlug",
      ),
  };
}

function ComicFields({
  categories,
  comic,
  create,
}: {
  categories: Category[];
  comic?: AdminComic;
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
              comic?.slug ??
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
            name="title"
            required
            defaultValue={
              comic?.title ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Категория
          </span>

          <select
            name="categorySlug"
            required
            defaultValue={
              comic?.categorySlug ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          >
            <option
              value=""
              disabled
            >
              Выберите категорию
            </option>

            {categories.map(
              (category) => (
                <option
                  key={
                    category.id
                  }
                  value={
                    category.slug
                  }
                >
                  {category.name}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Статус публикации
          </span>

          <select
            name="publicationStatus"
            defaultValue={
              comic?.publicationStatus ??
              "PUBLISHED"
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          >
            {(
              Object.entries(
                publicationStatusLabels,
              ) as [
                PublicationStatus,
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

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Автор
          </span>

          <input
            name="authorName"
            defaultValue={
              comic?.authorName ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Переводчик
          </span>

          <input
            name="translatorName"
            defaultValue={
              comic?.translatorName ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Глав
          </span>

          <input
            type="number"
            name="totalChapters"
            min={0}
            step={1}
            defaultValue={
              comic?.totalChapters ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Source URL
          </span>

          <input
            type="url"
            name="sourceUrl"
            required
            defaultValue={
              comic?.sourceUrl ??
              ""
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">
            Cover URL
          </span>

          <input
            type="url"
            name="coverUrl"
            defaultValue={
              comic?.coverUrl ??
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
            comic?.description ??
            ""
          }
          className="w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2"
        />
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">
          Примечание переводчика
        </span>

        <textarea
          name="translatorNote"
          rows={3}
          defaultValue={
            comic?.translatorNote ??
            ""
          }
          className="w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2"
        />
      </label>
    </>
  );
}

export function AdminComicManager({
  categories,
  initialComics,
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
    editingChapterId,
    setEditingChapterId,
  ] = useState<
    number | null
  >(null);

  const [
    chapterEditValues,
    setChapterEditValues,
  ] = useState<{
    displayCode: string;
    title: string;
    sourceUrl: string;
    status: ChapterEditStatus;
  } | null>(null);

  const [
    archiveConfirmChapterId,
    setArchiveConfirmChapterId,
  ] = useState<number | null>(null);

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

  async function saveComic(
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

    const data =
      new FormData(
        form,
      );

    const payload =
      comicPayload(
        data,
        immutableSlug,
      );

    if (
      !payload.slug ||
      !payload.title ||
      !payload.sourceUrl ||
      !payload.categorySlug
    ) {
      setError(
        "Slug, название, source URL и категория обязательны.",
      );
      setBusyKey(null);
      return;
    }

    if (
      payload.totalChapters !==
        null &&
      (
        !Number.isInteger(
          payload.totalChapters,
        ) ||
        payload.totalChapters <
          0
      )
    ) {
      setError(
        "Количество глав должно быть целым неотрицательным числом.",
      );
      setBusyKey(null);
      return;
    }

    try {
      const response =
        await fetch(
          "/api/admin/catalog/comics",
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
          "/login?next=%2Fadmin%2Fcomics",
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
          `Комикс ${payload.slug} создан.`,
        );
      } else {
        setMessage(
          `Комикс ${payload.slug} обновлён.`,
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

  async function archiveChapter(
    comic: AdminComic,
    chapterId: number,
  ) {
    if (busyKey) {
      return;
    }

    const key =
      `chapter-archive:${chapterId}`;

    setBusyKey(key);
    setMessage(null);
    setError(null);

    try {
      const response =
        await fetch(
          `/api/admin/catalog/comics/${comic.id}/chapters`,
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
                intent:
                  "archive",

                chapterId,
              }),
          },
        );

      await response
        .json()
        .catch(
          () => null,
        );

      if (!response.ok) {
        setError(
          "Не удалось архивировать главу.",
        );

        setBusyKey(null);
        return;
      }

      setArchiveConfirmChapterId(null);

      setMessage(
        "Глава отправлена в архив.",
      );

      setBusyKey(null);
      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером.",
      );

      setBusyKey(null);
    }
  }

  async function moveChapter(
    comic: AdminComic,
    chapter: AdminChapter,
    direction: "up" | "down",
  ) {
    if (busyKey) {
      return;
    }

    const nextSortOrder =
      direction === "up"
        ? chapter.sortOrder - 1
        : chapter.sortOrder + 1;

    if (
      nextSortOrder < 0
    ) {
      return;
    }

    const key =
      `chapter-reorder:${chapter.id}`;

    setBusyKey(key);
    setMessage(null);
    setError(null);

    try {
      const response =
        await fetch(
          `/api/admin/catalog/comics/${comic.id}/chapters`,
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
                intent:
                  "reorder",

                chapterId:
                  chapter.id,

                sortOrder:
                  nextSortOrder,
              }),
          },
        );

      await response
        .json()
        .catch(
          () => null,
        );

      if (!response.ok) {
        setError(
          "Не удалось изменить порядок главы.",
        );

        setBusyKey(null);
        return;
      }

      setMessage(
        "Порядок главы изменён.",
      );

      setBusyKey(null);
      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером.",
      );

      setBusyKey(null);
    }
  }

  async function updateChapter(
    comic: AdminComic,
    chapterId: number,
  ) {
    if (!chapterEditValues) {
      return;
    }

    const key =
      `chapter-update:${chapterId}`;

    if (busyKey) {
      return;
    }

    setBusyKey(key);
    setMessage(null);
    setError(null);

    try {
      const response =
        await fetch(
          `/api/admin/catalog/comics/${comic.id}/chapters`,
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
                intent:
                  "update",

                chapterId,

                displayCode:
                  chapterEditValues.displayCode,

                title:
                  chapterEditValues.title ||
                  null,

                sourceUrl:
                  chapterEditValues.sourceUrl ||
                  null,

                status:
                  chapterEditValues.status,

                releasedAt:
                  chapterEditValues.status ===
                  "RELEASED"
                    ? new Date()
                        .toISOString()
                    : null,
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
          "/login?next=%2Fadmin%2Fcomics",
        );
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(
          chapterErrorMessage(
            apiErrorKind(
              body,
            ),
          ),
        );

        setBusyKey(null);
        return;
      }

      setEditingChapterId(null);
      setChapterEditValues(null);

      setMessage(
        "Глава обновлена.",
      );

      setBusyKey(null);
      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером.",
      );

      setBusyKey(null);
    }
  }

  async function createChapter(
    comic: AdminComic,
    form: HTMLFormElement,
  ) {
    const key =
      `chapter-create:${comic.id}`;

    if (busyKey) {
      return;
    }

    setBusyKey(
      key,
    );
    setMessage(null);
    setError(null);

    const data =
      new FormData(
        form,
      );

    const displayCode =
      textValue(
        data,
        "chapterDisplayCode",
      );

    const title =
      nullableText(
        data.get(
          "chapterTitle",
        ),
      );

    const sourceUrl =
      nullableText(
        data.get(
          "chapterSourceUrl",
        ),
      );

    const rawSortOrder =
      textValue(
        data,
        "chapterSortOrder",
      );

    const statusRaw =
      textValue(
        data,
        "chapterStatus",
      );

    const sortOrder =
      Number(
        rawSortOrder,
      );

    const status:
      ChapterCreateStatus | null =
      statusRaw ===
        "SCHEDULED" ||
      statusRaw ===
        "RELEASED"
        ? statusRaw
        : null;

    if (!displayCode) {
      setError(
        "Код главы обязателен.",
      );
      setBusyKey(null);
      return;
    }

    if (
      !Number.isSafeInteger(
        sortOrder,
      ) ||
      sortOrder < 0
    ) {
      setError(
        "Порядок главы должен быть целым неотрицательным числом.",
      );
      setBusyKey(null);
      return;
    }

    if (!status) {
      setError(
        "Выберите корректный статус главы.",
      );
      setBusyKey(null);
      return;
    }

    const payload = {
      displayCode,
      title,
      sourceUrl,
      sortOrder,
      status,

      releasedAt:
        status ===
        "RELEASED"
          ? new Date()
              .toISOString()
          : null,
    };

    try {
      const response =
        await fetch(
          `/api/admin/catalog/comics/${comic.id}/chapters`,
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
          "/login?next=%2Fadmin%2Fcomics",
        );
        router.refresh();
        return;
      }

      if (!response.ok) {
        setError(
          chapterErrorMessage(
            apiErrorKind(
              body,
            ),
          ),
        );
        setBusyKey(null);
        return;
      }

      setFormControlValue(
        form,
        "chapterDisplayCode",
        "",
      );

      setFormControlValue(
        form,
        "chapterTitle",
        "",
      );

      setFormControlValue(
        form,
        "chapterSourceUrl",
        "",
      );

      setFormControlValue(
        form,
        "chapterSortOrder",
        String(
          Math.max(
            nextChapterSortOrder(
              comic,
            ),
            sortOrder + 1,
          ),
        ),
      );

      setFormControlValue(
        form,
        "chapterStatus",
        "SCHEDULED",
      );

      setMessage(
        `Глава ${displayCode} добавлена в ${comic.title}.`,
      );

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
          Новый комикс
        </h2>

        {categories.length ===
        0 ? (
          <p className="mt-3 text-sm text-red-700">
            Создание недоступно: в PostgreSQL нет категорий.
          </p>
        ) : (
          <form
            onSubmit={(
              event,
            ) =>
              saveComic(
                event,
                "create",
              )
            }
            className="mt-6"
          >
            <ComicFields
              categories={
                categories
              }
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
              Создать комикс
            </button>
          </form>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Каталог
          </h2>

          <p className="text-sm text-[var(--muted)]">
            Всего: {initialComics.length}
          </p>
        </div>

        {initialComics.length ===
        0 ? (
          <p className="mt-4 text-[var(--muted)]">
            Комиксов пока нет.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {initialComics.map(
              (comic) => (
                <details
                  key={
                    comic.id
                  }
                  className="rounded-2xl border border-black/5 bg-[var(--surface)] p-5 shadow-sm"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {comic.title}
                        </h3>

                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {comic.slug} ·{" "}
                          {
                            publicationStatusLabels[
                              comic.publicationStatus
                            ]
                          }
                        </p>
                      </div>

                      <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold">
                        {comic.categoryName ??
                          "Без категории"}
                      </span>
                    </div>
                  </summary>

                  <form
                    onSubmit={(
                      event,
                    ) =>
                      saveComic(
                        event,
                        "update",
                        comic.slug,
                      )
                    }
                    className="mt-6 border-t border-black/10 pt-6"
                  >
                    <ComicFields
                      categories={
                        categories
                      }
                      comic={comic}
                      create={
                        false
                      }
                    />

                    {comic.categorySlug ===
                    null ? (
                      <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        У старой записи нет категории.
                        Выберите существующую категорию перед сохранением.
                      </p>
                    ) : null}

                    <section className="mt-6 rounded-xl border border-black/5 bg-[var(--background)] p-4">
                      <h4 className="font-semibold">
                        Главы
                      </h4>

                      {comic.chapters.length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {comic.chapters.map(
                            (chapter) => (
                              <li
                                key={chapter.id}
                                className="rounded-lg border border-black/5 bg-[var(--surface)] p-3"
                              >
                                {editingChapterId ===
                                chapter.id &&
                                chapterEditValues ? (
                                  <div className="space-y-3">
                                    <input
                                      value={
                                        chapterEditValues.displayCode
                                      }
                                      onChange={(event) =>
                                        setChapterEditValues({
                                          ...chapterEditValues,
                                          displayCode:
                                            event.target.value,
                                        })
                                      }
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={
                                        chapterEditValues.title
                                      }
                                      onChange={(event) =>
                                        setChapterEditValues({
                                          ...chapterEditValues,
                                          title:
                                            event.target.value,
                                        })
                                      }
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={
                                        chapterEditValues.sourceUrl
                                      }
                                      onChange={(event) =>
                                        setChapterEditValues({
                                          ...chapterEditValues,
                                          sourceUrl:
                                            event.target.value,
                                        })
                                      }
                                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                    />

                                    <select
                                      value={
                                        chapterEditValues.status
                                      }
                                      onChange={(event) =>
                                        setChapterEditValues({
                                          ...chapterEditValues,
                                          status:
                                            event.target.value as ChapterEditStatus,
                                        })
                                      }
                                      className="rounded-xl border border-black/10 px-3 py-2 text-sm"
                                    >
                                      <option value="SCHEDULED">
                                        SCHEDULED
                                      </option>

                                      <option value="RELEASED">
                                        RELEASED
                                      </option>

                                      <option value="ARCHIVED">
                                        ARCHIVED
                                      </option>
                                    </select>

                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void updateChapter(
                                            comic,
                                            chapter.id,
                                          )
                                        }
                                        disabled={
                                          busyKey !==
                                          null
                                        }
                                        className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
                                      >
                                        Сохранить
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingChapterId(null);
                                          setChapterEditValues(null);
                                        }}
                                        className="rounded-xl border px-4 py-2 text-sm"
                                      >
                                        Отмена
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-medium">
                                      {chapter.displayCode}
                                      {chapter.title
                                        ? ` — ${chapter.title}`
                                        : ""}
                                    </div>

                                    <div className="mt-1 text-sm text-[var(--muted)]">
                                      {chapter.status}
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        disabled={
                                          busyKey !== null
                                        }
                                        onClick={() =>
                                          void moveChapter(
                                            comic,
                                            chapter,
                                            "up",
                                          )
                                        }
                                        className="rounded-lg border px-3 py-1 text-sm"
                                      >
                                        ↑
                                      </button>

                                      <button
                                        type="button"
                                        disabled={
                                          busyKey !== null
                                        }
                                        onClick={() =>
                                          void moveChapter(
                                            comic,
                                            chapter,
                                            "down",
                                          )
                                        }
                                        className="rounded-lg border px-3 py-1 text-sm"
                                      >
                                        ↓
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingChapterId(
                                            chapter.id,
                                          );

                                          setChapterEditValues({
                                            displayCode:
                                              chapter.displayCode,

                                            title:
                                              chapter.title ??
                                              "",

                                            sourceUrl:
                                              chapter.sourceUrl ??
                                              "",

                                            status:
                                              chapter.status,
                                          });
                                        }}
                                        className="text-sm font-semibold text-[var(--primary)]"
                                      >
                                        Редактировать
                                      </button>

                                      {archiveConfirmChapterId ===
                                      chapter.id ? (
                                        <>
                                          <button
                                            type="button"
                                            disabled={
                                              busyKey !== null
                                            }
                                            onClick={() =>
                                              void archiveChapter(
                                                comic,
                                                chapter.id,
                                              )
                                            }
                                            className="text-sm font-semibold text-red-700"
                                          >
                                            Да, архивировать
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              setArchiveConfirmChapterId(
                                                null,
                                              )
                                            }
                                            className="text-sm"
                                          >
                                            Отмена
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setArchiveConfirmChapterId(
                                              chapter.id,
                                            )
                                          }
                                          className="text-sm font-semibold text-red-700"
                                        >
                                          Архивировать
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          Главы пока не добавлены.
                        </p>
                      )}

                      <div className="mt-5 border-t border-black/10 pt-4">
                        <h5 className="text-sm font-semibold">
                          Добавить главу
                        </h5>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Код главы
                            </span>

                            <input
                              name="chapterDisplayCode"
                              placeholder="1, 1.01а, Extra…"
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Название
                            </span>

                            <input
                              name="chapterTitle"
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Source URL
                            </span>

                            <input
                              type="url"
                              name="chapterSourceUrl"
                              placeholder="Необязательно"
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Порядок
                            </span>

                            <input
                              type="number"
                              name="chapterSortOrder"
                              min={0}
                              step={1}
                              defaultValue={
                                nextChapterSortOrder(
                                  comic,
                                )
                              }
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Статус
                            </span>

                            <select
                              name="chapterStatus"
                              defaultValue="SCHEDULED"
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            >
                              {(
                                Object.entries(
                                  chapterCreateStatusLabels,
                                ) as [
                                  ChapterCreateStatus,
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
                        </div>

                        <button
                          type="button"
                          disabled={
                            busyKey !==
                            null
                          }
                          onClick={(
                            event,
                          ) => {
                            const form =
                              event
                                .currentTarget
                                .form;

                            if (!form) {
                              setError(
                                "Не удалось определить форму комикса.",
                              );
                              return;
                            }

                            void createChapter(
                              comic,
                              form,
                            );
                          }}
                          className="mt-4 rounded-xl border border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)] disabled:cursor-wait disabled:opacity-60"
                        >
                          {busyKey ===
                          `chapter-create:${comic.id}`
                            ? "Добавляем…"
                            : "+ Добавить главу"}
                        </button>
                      </div>
                    </section>

                    <div className="mt-5 flex flex-wrap items-center gap-4">
                      <button
                        type="submit"
                        disabled={
                          busyKey !==
                          null ||
                          categories.length ===
                            0
                        }
                        className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                      >
                        Сохранить изменения
                      </button>

                      <a
                        href={`/comics/${comic.slug}`}
                        className="text-sm font-semibold text-[var(--primary)]"
                      >
                        Открыть публичную страницу
                      </a>
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
