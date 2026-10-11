"use client";
import { ChapterRevisionSelector } from "@/modules/catalog/components/ChapterRevisionSelector";
import { AdminChapterList } from "@/modules/catalog/components/AdminChapterList";
import { ChapterBatchEditor } from "@/modules/catalog/components/ChapterBatchEditor";
import type { WorkType, WorkFormat } from "@/modules/comics/work-metadata";
import { WorkMetadataFields } from "@/modules/comics/components/WorkMetadataFields";

import { seriesStatusLabels, type SeriesStatus } from "@/modules/comics/series-status";

import {
  CoverUploadField,
} from "@/shared/components/media/CoverUploadField";

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
  kind: string;
  supersedesChapterId: number | null;
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
  seriesStatus: SeriesStatus;
  workType: WorkType;
  workFormat: WorkFormat;
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

    workType: textValue(form, "workType"),
    workFormat: textValue(form, "workFormat"),
    seriesStatus: textValue(form, "seriesStatus"),
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 read-only:bg-[var(--surface)]"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
          />
        </label>

        <WorkMetadataFields workType={comic?.workType} workFormat={comic?.workFormat} />
<label className="block">
          <span className="mb-1 block text-sm font-medium">Статус выпуска</span>
          <select name="seriesStatus" defaultValue={comic?.seriesStatus ?? "UNKNOWN"} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
            {Object.entries(seriesStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-[var(--text-secondary)]">Выпуск произведения. Видимость в каталоге задаётся отдельно.</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Заявлено глав (справочно)
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
          />
        </label>

        <CoverUploadField
          key={
            comic?.id ??
            "new-comic"
          }
          defaultValue={
            comic?.coverUrl ??
            ""
          }
        />
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
          className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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
          className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2"
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

  const [chapterFeedback, setChapterFeedback] = useState<{ comicId: number; kind: "error" | "success"; message: string } | null>(null);
  const [creationVersions, setCreationVersions] = useState<Record<number, number>>({});
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
    kind: "MAIN" | "SPECIAL";
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

    const active = comic.chapters.filter(c => c.status !== "ARCHIVED").sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const index = active.findIndex(c => c.id === chapter.id);
    const neighbor = active[index + (direction === "up" ? -1 : 1)];
    if (!neighbor) return;

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
                  "move",

                chapterId:
                  chapter.id,

                sortOrder: chapter.sortOrder,
                direction,
                neighborId: neighbor.id,
                neighborSortOrder: neighbor.sortOrder,
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
          response.status === 409 ? "Список глав изменился. Обновите страницу и повторите перемещение." : "Не удалось изменить порядок главы.",
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

                kind: chapterEditValues.kind,
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
    setChapterFeedback(null);
    function fail(message: string) {
      setError(message);
      setChapterFeedback({ comicId: comic.id, kind: "error", message });
    }

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
      fail(
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
      fail(
        "Порядок главы должен быть целым неотрицательным числом.",
      );
      setBusyKey(null);
      return;
    }

    if (!status) {
      fail(
        "Выберите корректный статус главы.",
      );
      setBusyKey(null);
      return;
    }

    if (textValue(data, "chapterRevisionInvalid") === "yes") {
      fail("Выбранная редакция больше недоступна. Выберите актуальную главу или отмените замену.");
      setBusyKey(null);
      return;
    }
    const rawReplacement = textValue(data, "chapterSupersedesId");
    if (rawReplacement && textValue(data, "chapterRevisionConfirmed") !== "yes") {
      fail("Подтвердите замену старой редакции или отмените её выбор.");
      setBusyKey(null);
      return;
    }
    const previous = rawReplacement ? comic.chapters.find(c => c.id === Number(rawReplacement)) : null;
    if (rawReplacement && (!previous || previous.status !== "RELEASED" || status !== "RELEASED" || textValue(data, "chapterKind") !== previous.kind)) {
      fail("Новая редакция должна быть опубликована и иметь тот же тип, что и заменяемая глава.");
      setBusyKey(null);
      return;
    }

    const payload = {
      kind: textValue(data, "chapterKind") || "MAIN",
      supersedesChapterId: rawReplacement ? Number(rawReplacement) : null,
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
        fail(
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

      setCreationVersions(versions => ({ ...versions, [comic.id]: (versions[comic.id] ?? 0) + 1 }));
      setFormControlValue(form, "chapterKind", "MAIN");

      const successMessage = previous
        ? `Новая редакция ${displayCode} опубликована. Предыдущая редакция ${previous.displayCode} (ID ${previous.id}) перемещена в архив; её история чтения сохранена.`
        : `Глава ${displayCode} добавлена в ${comic.title}.`;
      setMessage(successMessage);
      setChapterFeedback({ comicId: comic.id, kind: "success", message: successMessage });

      setBusyKey(null);
      router.refresh();
    } catch {
      fail(
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

      <details
        className={[
          "group rounded-2xl",
          "border border-[var(--border)]",
          "bg-[var(--surface)]",
          "shadow-[var(--cd-shadow-card)]",
        ].join(" ")}
      >
        <summary
          className={[
            "flex min-h-14 cursor-pointer list-none",
            "items-center justify-between gap-3",
            "px-5 py-4",
            "text-sm font-semibold",
            "text-[var(--text-primary)]",
          ].join(" ")}
        >
          <span>
            + Добавить комикс
          </span>

          <span
            aria-hidden="true"
            className={[
              "text-lg text-[var(--text-muted)]",
              "transition-transform",
              "group-open:rotate-45",
            ].join(" ")}
          >
            +
          </span>
        </summary>

        <div
          className={[
            "border-t border-[var(--border)]",
            "px-5 pb-5 pt-5",
          ].join(" ")}
        >
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Новый комикс
          </h2>

          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Заполни только нужные данные. Обложку можно выбрать с устройства.
          </p>

          {categories.length ===
          0 ? (
            <p className="mt-4 rounded-xl border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">
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

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={
                    busyKey !==
                    null
                  }
                  className={[
                    "min-h-11 rounded-[var(--cd-radius-button)]",
                    "bg-[var(--primary)] px-5 py-3",
                    "text-sm font-semibold",
                    "text-[var(--primary-foreground)]",
                    "disabled:cursor-wait disabled:opacity-60",
                  ].join(" ")}
                >
                  Создать комикс
                </button>
              </div>
            </form>
          )}
        </div>
      </details>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              Комиксы
            </h2>

            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Открой комикс, чтобы изменить данные или управлять главами.
            </p>
          </div>

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
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--cd-shadow-card)]"
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
                    className="mt-6 border-t border-[var(--border)] pt-6"
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

                    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <h4 className="font-semibold">
                        Главы
                      </h4>

                      {comic.chapters.length > 0 ? (
                        <AdminChapterList chapters={comic.chapters} locked={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null}>
                          {(visibleChapters, canMove) => <ul className="space-y-2">
                          {visibleChapters.map(
                            (chapter) => (
                              <li
                                key={chapter.id}
                                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                              >
                                {editingChapterId ===
                                chapter.id &&
                                chapterEditValues ? (
                                  <div className="space-y-3">
                                    <label className="block text-sm">Тип главы
                                      <select value={chapterEditValues.kind} onChange={(event) => setChapterEditValues({ ...chapterEditValues, kind: event.target.value as "MAIN" | "SPECIAL" })} className="ml-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
                                        <option value="MAIN">Основная</option><option value="SPECIAL">Спешиал / бонус</option>
                                      </select>
                                    </label>
                                    <input
                                      aria-label="Код главы"
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
                                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-2 text-sm"
                                    />

                                    <input
                                      aria-label="Название главы"
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
                                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-2 text-sm"
                                    />

                                    <input
                                      aria-label="Ссылка на главу"
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
                                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-2 text-sm"
                                    />

                                    <select
                                      aria-label="Статус главы"
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
                                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-2 text-sm"
                                    >
                                      <option value="SCHEDULED">
                                        Запланирована
                                      </option>

                                      <option value="RELEASED">
                                        Опубликована
                                      </option>

                                      <option value="ARCHIVED">
                                        В архиве
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
                                      {chapter.displayCode}{chapter.kind === "SPECIAL" ? " · Спешиал" : ""}{chapter.supersedesChapterId ? " · Новая редакция" : ""}
                                      {chapter.title
                                        ? ` — ${chapter.title}`
                                        : ""}
                                    </div>

                                    <div className="mt-1 text-sm text-[var(--muted)]">
                                      {chapter.status === "RELEASED" ? "Опубликована" : chapter.status === "SCHEDULED" ? "Запланирована" : "В архиве"} · Порядок: {chapter.sortOrder}
                                    </div>

                                    {chapter.supersedesChapterId ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Новая редакция · заменяет: {comic.chapters.find(c => c.id === chapter.supersedesChapterId)?.displayCode ?? `ID ${chapter.supersedesChapterId}`}</p> : null}
                                    {comic.chapters.filter(c => c.supersedesChapterId === chapter.id).map(c => <p key={c.id} className="mt-1 text-xs text-[var(--text-secondary)]">Старая редакция · заменена на: {c.displayCode}{c.title ? ` — ${c.title}` : ""}. История чтения этой редакции сохранена.</p>)}
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        disabled={
                                          busyKey !== null || !canMove || editingChapterId !== null || archiveConfirmChapterId !== null || chapter.id === comic.chapters.filter(c => c.status !== "ARCHIVED").sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)[0]?.id
                                        }
                                        onClick={() =>
                                          void moveChapter(
                                            comic,
                                            chapter,
                                            "up",
                                          )
                                        }
                                        className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                                      >
                                        Вверх
                                      </button>

                                      <button
                                        type="button"
                                        disabled={
                                          busyKey !== null || !canMove || editingChapterId !== null || archiveConfirmChapterId !== null || chapter.id === comic.chapters.filter(c => c.status !== "ARCHIVED").sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id)[0]?.id
                                        }
                                        onClick={() =>
                                          void moveChapter(
                                            comic,
                                            chapter,
                                            "down",
                                          )
                                        }
                                        className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                                      >
                                        Вниз
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingChapterId(
                                            chapter.id,
                                          );

                                          setChapterEditValues({
                                            kind: chapter.kind === "SPECIAL" ? "SPECIAL" : "MAIN",
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
                                        Исправить данные
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
                        </ul>}
                        </AdminChapterList>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          Главы пока не добавлены.
                        </p>
                      )}

                      <ChapterBatchEditor comicId={comic.id} disabled={busyKey !== null}
                        onBusyChange={busy => setBusyKey(busy ? `chapter-batch:${comic.id}` : null)} />

                      <div className="mt-5 border-t border-black/10 pt-4">
                        <h5 className="text-sm font-semibold">
                          Добавить главу или выпустить новую редакцию
                        </h5>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">Тип главы</span>
                            <select name="chapterKind" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
                              <option value="MAIN">Основная</option>
                              <option value="SPECIAL">Спешиал / бонус</option>
                            </select>
                          </label>
                          <ChapterRevisionSelector key={creationVersions[comic.id] ?? 0} chapters={comic.chapters} disabled={busyKey !== null} />

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Код главы
                            </span>

                            <input
                              name="chapterDisplayCode"
                              placeholder="1, 1.01а, Extra…"
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Название
                            </span>

                            <input
                              name="chapterTitle"
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
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
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
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
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Статус
                            </span>

                            <select
                              name="chapterStatus"
                              defaultValue="SCHEDULED"
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 text-sm"
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
                            : "Создать главу / редакцию"}
                        </button>
                        {chapterFeedback?.comicId === comic.id ? <p
                          data-chapter-feedback
                          role={chapterFeedback.kind === "error" ? "alert" : "status"}
                          className={`mt-3 rounded-xl border p-3 text-sm ${chapterFeedback.kind === "error" ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--border)] text-[var(--text-primary)]"}`}
                        >{chapterFeedback.message}</p> : null}
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
