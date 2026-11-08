"use client";

import { expectedReleasePrecision, formatExpectedRelease, formatReleasedAt, isValidExpectedRelease, type ExpectedReleasePrecision } from "@/modules/catalog/chapter-release-dates";
import { AdminComicList } from "@/modules/catalog/components/AdminComicList";
import { useLocationHash } from "@/shared/hooks/useLocationHash";
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
  useEffect,
  useRef,
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
  volumeNumber: number | null;
  status:
    | "SCHEDULED"
    | "RELEASED"
    | "ARCHIVED";
  releasedAt: string | null;
  expectedRelease: string | null;
  createdAt: string;
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
  RELEASED: "Опубликована",
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
      return "Не удалось сохранить главу.";
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
      HTMLSelectElement ||
    control instanceof
      HTMLTextAreaElement
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

type ComicPayload = ReturnType<typeof comicPayload>;

function restoreComicForm(form: HTMLFormElement, payload: ComicPayload) {
  const values: Record<string, string> = {
    slug: payload.slug,
    title: payload.title,
    description: payload.description ?? "",
    authorName: payload.authorName ?? "",
    translatorName: payload.translatorName ?? "",
    translatorNote: payload.translatorNote ?? "",
    coverUrl: payload.coverUrl ?? "",
    sourceUrl: payload.sourceUrl,
    totalChapters: payload.totalChapters === null ? "" : String(payload.totalChapters),
    workType: payload.workType,
    workFormat: payload.workFormat,
    seriesStatus: payload.seriesStatus,
    publicationStatus: payload.publicationStatus,
    categorySlug: payload.categorySlug,
  };

  Object.entries(values).forEach(([name, value]) => {
    setFormControlValue(form, name, value);
  });
}

type StudioTab = "metadata" | "chapters" | "publication";

type UnsavedChangesPrompt =
  | { kind: "navigation"; destination: string }
  | { kind: "comic-switch" };

function ComicFields({
  categories,
  comic,
  create,
  disabled,
  onUploadingChange,
  activeTab,
  coverUrl,
  onCoverUrlChange,
}: {
  categories: Category[];
  comic?: AdminComic;
  create: boolean;
  disabled: boolean;
  onUploadingChange: (uploading: boolean) => void;
  activeTab?: StudioTab;
  coverUrl?: string;
  onCoverUrlChange?: (value: string) => void;
}) {
  const inputClass = "admin-studio-input";
  return (
    <>
      <div hidden={activeTab === "chapters" || activeTab === "publication"}>
        <div className="admin-studio-section-heading">
          <h3>Основная информация</h3>
          <p>Данные, которые читатель увидит в каталоге.</p>
        </div>
        <div className="admin-studio-metadata-grid">
          <div className="admin-studio-cover-field">
            <CoverUploadField
              disabled={disabled}
              onUploadingChange={onUploadingChange}
              value={coverUrl}
              onValueChange={onCoverUrlChange}
              key={comic?.id ?? "new-comic"}
              defaultValue={comic?.coverUrl ?? ""}
            />
          </div>
          <div className="admin-studio-core-fields">
            <div className="admin-studio-field-grid">
              <label>Название *
                <input name="title" required defaultValue={comic?.title ?? ""} className={inputClass} />
              </label>
              <label>Slug *
                <input name="slug" required readOnly={!create}
                  defaultValue={comic?.slug ?? ""} className={inputClass}
                  aria-describedby={create ? undefined : `comic-slug-note-${comic?.id}`} />
                {!create && <span id={`comic-slug-note-${comic?.id}`} className="admin-studio-field-hint">Не изменяется после создания.</span>}
              </label>
              <label>Категория *
                <select name="categorySlug" required defaultValue={comic?.categorySlug ?? ""} className={inputClass}>
                  <option value="" disabled>Выберите категорию</option>
                  {categories.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <label>Автор
                <input name="authorName" defaultValue={comic?.authorName ?? ""} className={inputClass} />
              </label>
              <label>Переводчик / команда
                <input name="translatorName" defaultValue={comic?.translatorName ?? ""} className={inputClass} />
              </label>
              <WorkMetadataFields workType={comic?.workType} workFormat={comic?.workFormat} />
              <label>Source URL *
                <input name="sourceUrl" type="url" required defaultValue={comic?.sourceUrl ?? ""}
                  placeholder="https://..." className={inputClass} />
              </label>
            </div>
            <label className="admin-studio-description-label">Описание
              <textarea name="description" rows={5} defaultValue={comic?.description ?? ""} className={inputClass} />
            </label>
          </div>
        </div>
        <details className="admin-studio-advanced">
          <summary>Дополнительные сведения <span>Количество глав и примечание переводчика</span></summary>
          <div className="admin-studio-field-grid">
            <label>Заявлено глав (справочно)
              <input name="totalChapters" type="number" min={0} step={1}
                defaultValue={comic?.totalChapters ?? ""} className={inputClass} />
            </label>
            <label className="admin-studio-full">Примечание переводчика
              <textarea name="translatorNote" rows={3}
                defaultValue={comic?.translatorNote ?? ""} className={inputClass} />
            </label>
          </div>
        </details>
      </div>
      <section hidden={activeTab !== undefined && activeTab !== "publication"}
        className="admin-studio-publication-section">
        <div className="admin-studio-section-heading">
          <h3>Публикация и видимость</h3>
          <p>Видимость в каталоге не связана со статусом выхода самого произведения.</p>
        </div>
        <div className="admin-studio-field-grid">
          <label>Статус в каталоге
            <select name="publicationStatus" defaultValue={comic?.publicationStatus ?? "PUBLISHED"} className={inputClass}>
              {(Object.entries(publicationStatusLabels) as [PublicationStatus, string][]).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Статус выхода
            <select name="seriesStatus" defaultValue={comic?.seriesStatus ?? "UNKNOWN"} className={inputClass}>
              {Object.entries(seriesStatusLabels).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <p className="admin-studio-section-note">Настройки вступят в силу только после сохранения изменений.</p>
      </section>
    </>
  );
}

/** Keep month/year input independent of locale-specific native <input type="month">. */
function ExpectedMonthYearPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [year = "", month = ""] = value.split("-");
  const months = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  function update(nextYear: string, nextMonth: string) {
    onChange(nextYear || nextMonth ? `${nextYear}-${nextMonth}` : "");
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">
        <span className="block">Месяц ожидаемого выхода</span>
        <select
          value={month}
          onChange={event => update(year, event.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Выберите месяц</option>
          {months.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        <span className="block">Год ожидаемого выхода</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="Например, 2026"
          value={year}
          onChange={event => update(event.target.value.replace(/\D/g, "").slice(0, 4), month)}
          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </label>
      <p aria-live="polite" className="text-xs text-[var(--text-secondary)] sm:col-span-2">
        {isValidExpectedRelease(value)
          ? `Будет показано читателям: ${formatExpectedRelease(value)}.`
          : "Выберите месяц и укажите год четырьмя цифрами, например Ноябрь + 2026."}
      </p>
    </div>
  );
}

export function AdminComicManager({
  categories,
  initialComics,
}: Props) {
  const router =
    useRouter();

  const locationHash = useLocationHash();
  const studioTab: StudioTab = locationHash === "#chapters"
    ? "chapters"
    : locationHash === "#publication" ? "publication" : "metadata";

  function selectStudioTab(tab: StudioTab) {
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(window.history.state, "", `#${tab}`);
      lastKnownLocationRef.current = {
        url: window.location.href,
        state: window.history.state,
      };
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  const [chapterFeedback, setChapterFeedback] = useState<{ comicId: number; kind: "error" | "success"; message: string } | null>(null);
  const [chapterEditFeedback, setChapterEditFeedback] = useState<{ chapterId: number; kind: "error" | "success"; message: string } | null>(null);
  const [coverUploads, setCoverUploads] = useState<Record<string, boolean>>({});
  const comicFormsRef = useRef(new Map<number, HTMLFormElement>());
  const comicBaselinesRef = useRef(new Map<number, ComicPayload>());
  const saveInFlightRef = useRef(false);
  const lastKnownLocationRef = useRef<{ url: string; state: unknown } | null>(null);
  const pendingComicDirtyCheckRef = useRef<{
    comic: AdminComic;
    form: HTMLFormElement;
  } | null>(null);
  const [comicDirty, setComicDirty] = useState<Record<number, boolean>>({});
  const [comicCoverUrls, setComicCoverUrls] = useState<Record<number, string>>({});
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedChangesPrompt | null>(null);
  const unsavedPromptRef = useRef<UnsavedChangesPrompt | null>(null);
  const pendingComicSwitchResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const promptReturnFocusRef = useRef<HTMLElement | null>(null);
  const stayButtonRef = useRef<HTMLButtonElement | null>(null);
  const leaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [creationVersions, setCreationVersions] = useState<Record<number, number>>({});
  const [creationStatus, setCreationStatus] = useState<Record<number, ChapterCreateStatus>>({});
  const [creationPrecision, setCreationPrecision] = useState<Record<number, ExpectedReleasePrecision>>({});
  const [creationExpectedRelease, setCreationExpectedRelease] = useState<Record<number, string>>({});
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
    volumeNumber: string;
    displayCode: string;
    title: string;
    sourceUrl: string;
    status: ChapterEditStatus;
    releasedDate: string;
    expectedRelease: string;
    expectedPrecision: ExpectedReleasePrecision;
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

  function updateComicDirty(comic: AdminComic, form: HTMLFormElement) {
    const baseline = comicBaselinesRef.current.get(comic.id);
    if (!baseline) return;

    const current = comicPayload(new FormData(form), comic.slug);
    const dirty = JSON.stringify(current) !== JSON.stringify(baseline);
    setComicDirty(previous => {
      if ((previous[comic.id] ?? false) === dirty) return previous;
      return { ...previous, [comic.id]: dirty };
    });
  }

  useEffect(() => {
    if (busyKey !== null) return;

    const pending = pendingComicDirtyCheckRef.current;
    if (!pending) return;
    pendingComicDirtyCheckRef.current = null;

    const baseline = comicBaselinesRef.current.get(pending.comic.id);
    if (!baseline) return;

    // Re-read only after busyKey is cleared and disabled controls are enabled again.
    const current = comicPayload(new FormData(pending.form), pending.comic.slug);
    const dirty = JSON.stringify(current) !== JSON.stringify(baseline);
    setComicDirty(previous => {
      if ((previous[pending.comic.id] ?? false) === dirty) return previous;
      return { ...previous, [pending.comic.id]: dirty };
    });
  }, [busyKey]);

  function discardComicChanges(comicId: number) {
    const comic = initialComics.find(item => item.id === comicId);
    const baseline = comicBaselinesRef.current.get(comicId);
    const form = comicFormsRef.current.get(comicId);
    if (!comic || !baseline || !form) return;

    restoreComicForm(form, baseline);
    setComicCoverUrls(previous => ({
      ...previous,
      [comicId]: baseline.coverUrl ?? "",
    }));
    setComicDirty(previous => ({ ...previous, [comicId]: false }));
    setError(null);
    setMessage(null);
  }

  function handleComicCoverChange(comic: AdminComic, value: string) {
    setComicCoverUrls(previous => ({ ...previous, [comic.id]: value }));
    const form = comicFormsRef.current.get(comic.id);
    if (!form) return;
    setFormControlValue(form, "coverUrl", value);
    updateComicDirty(comic, form);
  }

  const hasUnsavedComicChanges =
    Object.values(comicDirty).some(Boolean) ||
    Object.values(coverUploads).some(Boolean);

  function requestComicSwitchConfirmation(): Promise<boolean> {
    return new Promise(resolve => {
      if (unsavedPromptRef.current) {
        resolve(false);
        return;
      }

      const prompt = { kind: "comic-switch" } as const;
      promptReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      pendingComicSwitchResolveRef.current = resolve;
      unsavedPromptRef.current = prompt;
      setUnsavedPrompt(prompt);
    });
  }

  function resolveUnsavedPrompt(confirmed: boolean) {
    const prompt = unsavedPromptRef.current;
    if (!prompt) return;

    unsavedPromptRef.current = null;
    setUnsavedPrompt(null);

    if (prompt.kind === "comic-switch") {
      const resolve = pendingComicSwitchResolveRef.current;
      pendingComicSwitchResolveRef.current = null;
      resolve?.(confirmed);
      return;
    }

    if (!confirmed) return;

    router.push(prompt.destination);
  }

  useEffect(() => {
    if (!unsavedPrompt) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stayButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const prompt = unsavedPromptRef.current;
        if (!prompt) return;

        unsavedPromptRef.current = null;
        setUnsavedPrompt(null);

        if (prompt.kind === "comic-switch") {
          const resolve = pendingComicSwitchResolveRef.current;
          pendingComicSwitchResolveRef.current = null;
          resolve?.(false);
        }
        return;
      }

      if (event.key === "Tab") {
        const first = stayButtonRef.current;
        const last = leaveButtonRef.current;

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);

      if (!unsavedPromptRef.current) {
        const target = promptReturnFocusRef.current;
        promptReturnFocusRef.current = null;
        if (target?.isConnected) target.focus();
      }
    };
  }, [unsavedPrompt]);

  useEffect(() => {
    lastKnownLocationRef.current = {
      url: window.location.href,
      state: window.history.state,
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedComicChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search
      ) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (unsavedPromptRef.current) return;

      const prompt = {
        kind: "navigation",
        destination: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      } as const;
      promptReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      unsavedPromptRef.current = prompt;
      setUnsavedPrompt(prompt);
    };

    const handlePopState = (event: PopStateEvent) => {
      const previous = lastKnownLocationRef.current;
      const nextUrl = window.location.href;
      if (!previous || nextUrl === previous.url) return;

      const previousUrl = new URL(previous.url);
      const destinationUrl = new URL(nextUrl);
      if (
        destinationUrl.origin === previousUrl.origin &&
        destinationUrl.pathname === previousUrl.pathname &&
        destinationUrl.search === previousUrl.search
      ) {
        lastKnownLocationRef.current = {
          url: nextUrl,
          state: window.history.state,
        };
        return;
      }

      // Stop Next.js from processing this traversal while the dialog is open.
      // Restore the current URL; the dialog will navigate to the destination
      // through the App Router if the user confirms.
      event.stopImmediatePropagation();
      window.history.pushState(previous.state, "", previous.url);

      if (unsavedPromptRef.current) return;

      const prompt = {
        kind: "navigation",
        destination: `${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`,
      } as const;
      promptReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      unsavedPromptRef.current = prompt;
      setUnsavedPrompt(prompt);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState, true);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, true);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedComicChanges]);

  async function saveComic(
    event:
      FormEvent<HTMLFormElement>,
    mode:
      | "create"
      | "update",
    immutableSlug?: string,
  ) {
    event.preventDefault();

    // The chapter editor shares the DOM form with the comic metadata for now.
    // Pressing Enter in chapter fields must never submit comic metadata.
    if (mode === "update" && studioTab === "chapters") {
      setError("Для изменения глав используйте действия во вкладке «Главы».");
      setMessage(null);
      return;
    }

    // Required metadata inputs remain mounted but are visually hidden on the
    // publication tab. Disable native focus-on-invalid there, then guide the
    // editor back to the fields that need attention instead of silently failing.
    if (mode === "update" && studioTab === "publication" && !event.currentTarget.checkValidity()) {
      selectStudioTab("metadata");
      setError("Заполните обязательные поля и проверьте ссылку на вкладке «Метаданные».");
      setMessage(null);
      return;
    }

    const key =
      mode === "create"
        ? "create"
        : `update:${immutableSlug}`;

    if (busyKey || saveInFlightRef.current) {
      return;
    }

    saveInFlightRef.current = true;
    setBusyKey(key);
    setMessage(null);
    setError(null);

    const form =
      event.currentTarget;

    const data =
      new FormData(
        form,
      );

    if (data.get("coverUploading") === "yes") {
      setError("Дождитесь завершения загрузки обложки перед сохранением.");
      saveInFlightRef.current = false;
      setBusyKey(null);
      return;
    }

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
      saveInFlightRef.current = false;
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
      saveInFlightRef.current = false;
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
        saveInFlightRef.current = false;
        setBusyKey(null);
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
        saveInFlightRef.current = false;
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
        const savedComic = initialComics.find(
          (item) => item.slug === immutableSlug,
        );
        if (savedComic) {
          comicBaselinesRef.current.set(savedComic.id, payload);
          pendingComicDirtyCheckRef.current = {
            comic: savedComic,
            form: comicFormsRef.current.get(savedComic.id) ?? form,
          };
        }
        setMessage(
          `Комикс ${payload.slug} обновлён.`,
        );
      }

      saveInFlightRef.current = false;

      setBusyKey(null);
      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером.",
      );
      saveInFlightRef.current = false;
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
    chapter: AdminChapter,
  ) {
    if (!chapterEditValues || chapter.status === "ARCHIVED") {
      return;
    }

    const chapterId = chapter.id;
    if (!chapterEditValues.displayCode.trim() && !chapterEditValues.title.trim()) {
      setChapterEditFeedback({ chapterId, kind: "error", message: "Укажите код или название главы." });
      return;
    }

    const sourceUrl = chapterEditValues.sourceUrl.trim();
    if (sourceUrl) {
      let validUrl = false;
      try {
        const parsedUrl = new URL(sourceUrl);
        validUrl = parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
      } catch {
        // Keep the editor open with its current values.
      }
      if (!validUrl) {
        setChapterEditFeedback({ chapterId, kind: "error", message: "Укажите ссылку с https:// или http:// либо оставьте поле пустым." });
        return;
      }
    }

    if (chapterEditValues.status === "SCHEDULED" && chapterEditValues.expectedPrecision !== "NONE" &&
        (!isValidExpectedRelease(chapterEditValues.expectedRelease) ||
         expectedReleasePrecision(chapterEditValues.expectedRelease) !== chapterEditValues.expectedPrecision)) {
      setChapterEditFeedback({ chapterId, kind: "error", message: "Укажите ожидаемую дату полностью. Для месяца и года выберите месяц и введите четыре цифры года." });
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
    setChapterEditFeedback(null);

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
                volumeNumber: chapterEditValues.volumeNumber.trim() ? Number(chapterEditValues.volumeNumber) : null,
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

                // Exact published date is optional; no guessing on status transition.
                releasedAt: chapterEditValues.status === "RELEASED" && chapterEditValues.releasedDate
                  ? (chapter.status === "RELEASED" && chapter.releasedAt?.slice(0, 10) === chapterEditValues.releasedDate
                    ? chapter.releasedAt // Metadata-only edit preserves the original release timestamp.
                    : `${chapterEditValues.releasedDate}T12:00:00.000Z`)
                  : null,
                expectedRelease: chapterEditValues.status === "SCHEDULED"
                  ? chapterEditValues.expectedRelease.trim() || null : null,
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
        setChapterEditFeedback({
          chapterId,
          kind: "error",
          message: chapterErrorMessage(apiErrorKind(body)),
        });
        setBusyKey(null);
        return;
      }

      setEditingChapterId(null);
      setChapterEditValues(null);
      setChapterEditFeedback({ chapterId, kind: "success", message: "Изменения главы сохранены." });
      setBusyKey(null);
      router.refresh();
    } catch {
      setChapterEditFeedback({ chapterId, kind: "error", message: "Не удалось связаться с сервером. Изменения остались в форме — попробуйте ещё раз." });
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

    if (!displayCode && !title) {
      fail(
        "Укажите название или код главы.",
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

    const expectedRelease = status === "SCHEDULED" ? textValue(data, "chapterExpectedValue") || null : null;
    const releasedDate = status === "RELEASED" ? textValue(data, "chapterReleasedDate") : "";
    const precision = creationPrecision[comic.id] ?? "NONE";
    if (status === "SCHEDULED" && precision !== "NONE" &&
        (!expectedRelease || !isValidExpectedRelease(expectedRelease) ||
         expectedReleasePrecision(expectedRelease) !== precision)) {
      fail("Укажите ожидаемую дату полностью. Для месяца и года выберите месяц и введите четыре цифры года.");
      setBusyKey(null);
      return;
    }

    const payload = {
      kind: textValue(data, "chapterKind") || "MAIN",
      volumeNumber: textValue(data, "chapterVolumeNumber") ? Number(textValue(data, "chapterVolumeNumber")) : previous?.volumeNumber ?? null,
      supersedesChapterId: rawReplacement ? Number(rawReplacement) : null,
      displayCode,
      title,
      sourceUrl,
      sortOrder,
      status,

      releasedAt: releasedDate ? `${releasedDate}T12:00:00.000Z` : null,
      expectedRelease,
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
      setCreationStatus(statuses => ({ ...statuses, [comic.id]: "SCHEDULED" }));
      setCreationPrecision(precisions => ({ ...precisions, [comic.id]: "NONE" }));
      setCreationExpectedRelease(values => ({ ...values, [comic.id]: "" }));
      setFormControlValue(form, "chapterKind", "MAIN");
      setFormControlValue(form, "chapterVolumeNumber", "");

      const successMessage = previous
        ? `Новая редакция ${displayCode} опубликована. Предыдущая редакция ${previous.displayCode} (ID ${previous.id}) перемещена в архив; её история чтения сохранена.`
        : `Глава ${displayCode || title} добавлена в ${comic.title}.`;
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
    <div className="admin-studio-root">
      {error ? <p role="alert" className="admin-studio-feedback is-error">{error}</p> : null}
      {message ? <p role="status" className="admin-studio-feedback is-success">{message}</p> : null}
      <AdminComicList comics={initialComics} categories={categories}
        onSelectionChange={async currentId => {
          if (currentId !== null && comicDirty[currentId]) {
            const confirmed = await requestComicSwitchConfirmation();
            if (!confirmed) return false;
            discardComicChanges(currentId);
          }
          selectStudioTab("metadata");
          return true;
        }}
        locked={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null || Object.values(coverUploads).some(Boolean)}>
        {selectedId => <div className="admin-studio-panels">
          <section hidden={selectedId !== null}
        className={[
          "admin-studio-create-panel group rounded-2xl",
          "border border-[var(--border)]",
          "bg-[var(--surface)]",
          "shadow-[var(--cd-shadow-card)]",
        ].join(" ")}
      >
        <header
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
        </header>

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
                disabled={busyKey !== null}
                onUploadingChange={uploading => setCoverUploads(previous => ({ ...previous, create: uploading }))}
                categories={
                  categories
                }
                create
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={
                    coverUploads.create ||
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
      </section>
                      {initialComics.map(
              (comic) => (
                <article
                  hidden={selectedId !== comic.id}
                  key={
                    comic.id
                  }
                  className="admin-studio-comic-panel rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--cd-shadow-card)]"
                >
                  <header className="admin-studio-comic-header">
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
                  </header>

                  <nav className="admin-studio-tabs" aria-label="Разделы произведения">
                    {([ ["metadata", "Метаданные"], ["chapters", "Главы"], ["publication", "Публикация"] ] as const).map(([tab, label]) => (
                      <button key={tab} type="button" disabled={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null}
                        aria-current={studioTab === tab ? "page" : undefined}
                        className={studioTab === tab ? "is-active" : ""}
                        onClick={() => selectStudioTab(tab)}>{label}</button>
                    ))}
                  </nav>

                  <form
                    ref={form => {
                      if (!form) {
                        comicFormsRef.current.delete(comic.id);
                        return;
                      }
                      comicFormsRef.current.set(comic.id, form);
                      if (!comicBaselinesRef.current.has(comic.id)) {
                        comicBaselinesRef.current.set(
                          comic.id,
                          comicPayload(new FormData(form), comic.slug),
                        );
                      }
                    }}
                    onInput={event => updateComicDirty(comic, event.currentTarget)}
                    onChange={event => updateComicDirty(comic, event.currentTarget)}
                    noValidate={studioTab !== "metadata"}
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
                      activeTab={studioTab}
                      disabled={busyKey !== null}
                      onUploadingChange={uploading => setCoverUploads(previous => ({ ...previous, [comic.slug]: uploading }))}
                      coverUrl={comicCoverUrls[comic.id] ?? comic.coverUrl ?? ""}
                      onCoverUrlChange={value => handleComicCoverChange(comic, value)}
                      categories={
                        categories
                      }
                      comic={comic}
                      create={
                        false
                      }
                    />
                    {comicDirty[comic.id] ? (
                      <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Есть несохранённые изменения.
                      </p>
                    ) : null}
                    {comic.categorySlug ===
                    null ? (
                      <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        У старой записи нет категории.
                        Выберите существующую категорию перед сохранением.
                      </p>
                    ) : null}

                    <section hidden={studioTab !== "chapters"} className="admin-studio-chapters-panel mt-6 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
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
                                  <section
                                    aria-labelledby={`chapter-editor-title-${chapter.id}`}
                                    className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                                        // Prevent Enter in the chapter editor from submitting the outer comic form.
                                        event.preventDefault();
                                        if (busyKey === null) void updateChapter(comic, chapter);
                                      }
                                      if (event.key === "Escape" && busyKey === null) {
                                        event.preventDefault();
                                        setEditingChapterId(null);
                                        setChapterEditValues(null);
                                        setChapterEditFeedback(null);
                                      }
                                    }}
                                  >
                                    <div className="space-y-1 border-b border-[var(--border)] pb-3">
                                      <h5 id={`chapter-editor-title-${chapter.id}`} className="text-base font-semibold">
                                        Редактирование главы: {chapter.displayCode || chapter.title || `#${chapter.id}`}{chapter.displayCode && chapter.title ? ` — ${chapter.title}` : ""}
                                      </h5>
                                      <p className="text-sm text-[var(--text-secondary)]">
                                        {comic.title} · {chapter.kind === "SPECIAL" ? "Спешиал / бонус" : "Основная глава"} · ID {chapter.id}
                                      </p>
                                      <p className="text-xs text-[var(--text-secondary)]">
                                        Здесь исправляются данные текущей главы. Если изменилось содержание, создайте новую редакцию ниже — история чтения старой сохранится.
                                      </p>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                      <label className="block text-sm font-medium">
                                        <span className="block">Тип главы</span>
                                        <select
                                          value={chapterEditValues.kind}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, kind: event.target.value as "MAIN" | "SPECIAL" })}
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        >
                                          <option value="MAIN">Основная</option>
                                          <option value="SPECIAL">Спешиал / бонус</option>
                                        </select>
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Основная глава или дополнительный выпуск.</span>
                                      </label>

                                      <label className="block text-sm font-medium">
                                        <span className="block">Код главы (необязательно при наличии названия)</span>
                                        <input
                                          value={chapterEditValues.displayCode}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, displayCode: event.target.value })}
                                          placeholder="Например, 2 или Extra"
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Номер или обозначение из первоисточника.</span>
                                      </label>

                                      <label className="block text-sm font-medium">
                                        <span className="block">Название главы</span>
                                        <input
                                          value={chapterEditValues.title}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, title: event.target.value })}
                                          placeholder="Например, УРГА"
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Можно оставить пустым, если указан код главы.</span>
                                      </label>

                                      <label className="block text-sm font-medium">
                                        <span className="block">Ссылка на источник (необязательно)</span>
                                        <input
                                          type="url"
                                          value={chapterEditValues.sourceUrl}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, sourceUrl: event.target.value })}
                                          placeholder="https://..."
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Адрес, куда читатель перейдёт для чтения.</span>
                                      </label>

                                      <label className="block text-sm font-medium md:col-span-2">
                                        <span className="block">Том (необязательно)</span>
                                        <input type="number" min={1} max={99} step={1} value={chapterEditValues.volumeNumber}
                                          onChange={event => setChapterEditValues({ ...chapterEditValues, volumeNumber: event.target.value })}
                                          placeholder="Без тома" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm" />
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Главы с одинаковым номером попадут в один раскрывающийся том. Пустое поле — без группировки.</span>
                                      </label>
                                      <label className="block text-sm font-medium md:col-span-2">
                                        <span className="block">Статус главы</span>
                                        <select
                                          value={chapterEditValues.status}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, status: event.target.value as ChapterEditStatus })}
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        >
                                          <option value="SCHEDULED">Запланирована</option>
                                          <option value="RELEASED">Опубликована</option>
                                        </select>
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Для переноса в архив используйте отдельное действие с подтверждением. Запланированная дата не публикует главу автоматически.</span>
                                      </label>
                                      {chapterEditValues.status === "RELEASED" ? (
                                        <label className="block text-sm font-medium md:col-span-2">
                                          <span className="block">Фактическая дата выхода у первоисточника (необязательно)</span>
                                          <input type="date" value={chapterEditValues.releasedDate}
                                            onChange={event => setChapterEditValues({ ...chapterEditValues, releasedDate: event.target.value })}
                                            className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" />
                                          <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Если неизвестна — оставьте пустой. Дата добавления в Чайную хранится отдельно.</span>
                                        </label>
                                      ) : (
                                        <div className="space-y-2 md:col-span-2">
                                          <label className="block text-sm font-medium">Точность ожидаемой даты
                                            <select value={chapterEditValues.expectedPrecision}
                                              onChange={event => setChapterEditValues({ ...chapterEditValues, expectedPrecision: event.target.value as ExpectedReleasePrecision, expectedRelease: "" })}
                                              className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
                                              <option value="NONE">Дата пока неизвестна</option>
                                              <option value="YEAR">Известен только год</option>
                                              <option value="MONTH">Месяц и год</option>
                                              <option value="DAY">Точный день</option>
                                            </select>
                                          </label>
                                          {chapterEditValues.expectedPrecision === "MONTH" ? (
                                            <ExpectedMonthYearPicker
                                              value={chapterEditValues.expectedRelease}
                                              onChange={value => setChapterEditValues({ ...chapterEditValues, expectedRelease: value })}
                                            />
                                          ) : chapterEditValues.expectedPrecision !== "NONE" ? (
                                            <label className="block text-sm font-medium">Ожидаемый выход
                                              <input type={chapterEditValues.expectedPrecision === "YEAR" ? "text" : "date"}
                                                inputMode={chapterEditValues.expectedPrecision === "YEAR" ? "numeric" : undefined}
                                                maxLength={chapterEditValues.expectedPrecision === "YEAR" ? 4 : undefined}
                                                placeholder={chapterEditValues.expectedPrecision === "YEAR" ? "Например, 2027" : undefined}
                                                value={chapterEditValues.expectedRelease}
                                                onChange={event => setChapterEditValues({ ...chapterEditValues, expectedRelease: event.target.value })}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" />
                                            </label>
                                          ) : null}
                                          <p className="text-xs text-[var(--text-secondary)]">Не подставляем первое число месяца и не выпускаем главу автоматически.</p>
                                        </div>
                                      )}
                                      <p className="text-xs text-[var(--text-secondary)] md:col-span-2">Добавлена в Чайную: {formatReleasedAt(chapter.createdAt)} · дата записи неизменяема</p>
                                    </div>

                                    {chapterEditFeedback?.chapterId === chapter.id && chapterEditFeedback.kind === "error" ? (
                                      <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">{chapterEditFeedback.message}</p>
                                    ) : null}

                                    <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-3">
                                      <button
                                        type="button"
                                        onClick={() => void updateChapter(comic, chapter)}
                                        disabled={busyKey !== null}
                                        className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
                                      >
                                        {busyKey === `chapter-update:${chapter.id}` ? "Сохраняем…" : "Сохранить главу"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingChapterId(null);
                                          setChapterEditValues(null);
                                          setChapterEditFeedback(null);
                                        }}
                                        disabled={busyKey !== null}
                                        className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
                                      >
                                        Отмена
                                      </button>
                                    </div>
                                  </section>
                                ) : (
                                  <>
                                    <div className="font-medium">
                                      {chapter.displayCode}{chapter.kind === "SPECIAL" ? " · Спешиал" : ""}{chapter.supersedesChapterId ? " · Новая редакция" : ""}
                                      {chapter.title
                                        ? `${chapter.displayCode ? " — " : ""}${chapter.title}`
                                        : ""}
                                    </div>

                                    <div className="mt-1 text-sm text-[var(--muted)]">
                                      {chapter.volumeNumber !== null ? `Том ${chapter.volumeNumber} · ` : ""}{chapter.status === "RELEASED" ? `Опубликована${chapter.releasedAt ? ` · Вышла ${formatReleasedAt(chapter.releasedAt)}` : " · Дата выхода не указана"}`
                                        : chapter.status === "SCHEDULED" ? `Запланирована${chapter.expectedRelease ? ` · Ожидается ${formatExpectedRelease(chapter.expectedRelease)}` : ""}`
                                        : "В архиве"} · Порядок: {chapter.sortOrder}
                                    </div>
                                    {chapterEditFeedback?.chapterId === chapter.id && chapterEditFeedback.kind === "success" ? (
                                      <p role="status" className="mt-2 text-sm text-[var(--primary)]">{chapterEditFeedback.message}</p>
                                    ) : null}

                                    {chapter.supersedesChapterId ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Новая редакция · заменяет: {comic.chapters.find(c => c.id === chapter.supersedesChapterId)?.displayCode ?? `ID ${chapter.supersedesChapterId}`}</p> : null}
                                    {comic.chapters.filter(c => c.supersedesChapterId === chapter.id).map(c => <p key={c.id} className="mt-1 text-xs text-[var(--text-secondary)]">Старая редакция · заменена на: {c.displayCode}{c.title ? `${c.displayCode ? " — " : ""}${c.title}` : ""}. История чтения этой редакции сохранена.</p>)}
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
                                        disabled={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null || chapter.status === "ARCHIVED"}
                                        onClick={() => {
                                          setChapterEditFeedback(null);
                                          setEditingChapterId(
                                            chapter.id,
                                          );

                                          setChapterEditValues({
                                            kind: chapter.kind === "SPECIAL" ? "SPECIAL" : "MAIN",
                                            volumeNumber: chapter.volumeNumber === null ? "" : String(chapter.volumeNumber),
                                            displayCode:
                                              chapter.displayCode,

                                            title:
                                              chapter.title ??
                                              "",

                                            sourceUrl:
                                              chapter.sourceUrl ??
                                              "",

                                            status: chapter.status,
                                            releasedDate: chapter.releasedAt?.slice(0, 10) ?? "",
                                            expectedRelease: chapter.expectedRelease ?? "",
                                            expectedPrecision: expectedReleasePrecision(chapter.expectedRelease),
                                          });
                                        }}
                                        className="min-h-11 rounded-lg border border-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
                                      >
                                        Редактировать
                                      </button>

                                      {chapter.status === "ARCHIVED" ? (
                                        <span className="self-center text-xs text-[var(--text-secondary)]">Архивная глава хранится для истории чтения.</span>
                                      ) : archiveConfirmChapterId === chapter.id ? (
                                        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-[var(--danger)] p-3">
                                          <p className="w-full text-sm text-[var(--danger)]">
                                            Архивировать «{chapter.displayCode || chapter.title}»? История чтения сохранится.
                                          </p>
                                          <button
                                            type="button"
                                            disabled={busyKey !== null}
                                            onClick={() => void archiveChapter(comic, chapter.id)}
                                            className="min-h-11 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-60"
                                          >
                                            Да, архивировать
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busyKey !== null}
                                            onClick={() => setArchiveConfirmChapterId(null)}
                                            className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                                          >
                                            Отмена
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={busyKey !== null || editingChapterId !== null}
                                          onClick={() => setArchiveConfirmChapterId(chapter.id)}
                                          className="min-h-11 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-60"
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
                          <ChapterRevisionSelector key={creationVersions[comic.id] ?? 0} chapters={comic.chapters} disabled={busyKey !== null}
                            onChapterStatusChange={status => setCreationStatus(previous => ({ ...previous, [comic.id]: status }))} />

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Код главы (необязательно)
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
                            <span className="mb-1 block text-xs font-medium">Том (необязательно)</span>
                            <input type="number" name="chapterVolumeNumber" min={1} max={99} step={1}
                              placeholder="Без тома" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm" />
                            <span className="mt-1 block text-xs text-[var(--text-secondary)]">Например, 1 или 2. Пустое поле оставляет главу без тома.</span>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium">
                              Статус
                            </span>

                            <select
                              name="chapterStatus"
                              value={creationStatus[comic.id] ?? "SCHEDULED"}
                              onChange={event => setCreationStatus(previous => ({ ...previous, [comic.id]: event.target.value as ChapterCreateStatus }))}
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
                          {(creationStatus[comic.id] ?? "SCHEDULED") === "RELEASED" ? (
                            <label className="block text-sm font-medium md:col-span-2">Фактическая дата выхода у первоисточника
                              <input type="date" name="chapterReleasedDate"
                                className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" />
                              <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Необязательно. Пустая дата не заменяется сегодняшней.</span>
                            </label>
                          ) : (
                            <div className="space-y-2 md:col-span-2">
                              <label className="block text-sm font-medium">Точность ожидаемой даты
                                <select name="chapterExpectedPrecision" value={creationPrecision[comic.id] ?? "NONE"}
                                  onChange={event => {
                                    setCreationPrecision(previous => ({ ...previous, [comic.id]: event.target.value as ExpectedReleasePrecision }));
                                    setCreationExpectedRelease(previous => ({ ...previous, [comic.id]: "" }));
                                  }}
                                  className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
                                  <option value="NONE">Дата пока неизвестна</option>
                                  <option value="YEAR">Только год</option>
                                  <option value="MONTH">Месяц и год</option>
                                  <option value="DAY">Точный день</option>
                                </select>
                              </label>
                              {(creationPrecision[comic.id] ?? "NONE") === "MONTH" ? (
                                <>
                                  <ExpectedMonthYearPicker
                                    value={creationExpectedRelease[comic.id] ?? ""}
                                    onChange={value => setCreationExpectedRelease(previous => ({ ...previous, [comic.id]: value }))}
                                  />
                                  <input type="hidden" name="chapterExpectedValue" value={creationExpectedRelease[comic.id] ?? ""} />
                                </>
                              ) : (creationPrecision[comic.id] ?? "NONE") !== "NONE" ? (
                                <label className="block text-sm font-medium">Ожидаемый выход
                                  <input key={`${comic.id}-${creationPrecision[comic.id]}`} name="chapterExpectedValue"
                                    type={creationPrecision[comic.id] === "YEAR" ? "text" : "date"}
                                    inputMode={creationPrecision[comic.id] === "YEAR" ? "numeric" : undefined}
                                    maxLength={creationPrecision[comic.id] === "YEAR" ? 4 : undefined}
                                    placeholder={creationPrecision[comic.id] === "YEAR" ? "Например, 2027" : undefined}
                                    className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2" />
                                </label>
                              ) : null}
                              <p className="text-xs text-[var(--text-secondary)]">Это ориентир, а не автоматическая публикация.</p>
                            </div>
                          )}
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

                    <div hidden={studioTab === "chapters"} className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={
                          coverUploads[comic.slug] ||
                          busyKey !==
                          null ||
                          categories.length ===
                            0
                        }
                        className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:cursor-wait disabled:opacity-60"
                      >
                        Сохранить изменения
                      </button>
                      <button
                        type="button"
                        onClick={() => discardComicChanges(comic.id)}
                        disabled={!comicDirty[comic.id] || busyKey !== null || coverUploads[comic.slug]}
                        className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Отменить
                      </button>
                      <a
                        href={`/comics/${comic.slug}`}
                        className="text-sm font-semibold text-[var(--primary)]"
                      >
                        Открыть публичную страницу
                      </a>
                    </div>
                  </form>
                </article>
              ),
            )}
        </div>}
      </AdminComicList>
      {unsavedPrompt ? (
        <div
          className="admin-unsaved-dialog-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              resolveUnsavedPrompt(false);
            }
          }}
        >
          <section
            className="admin-unsaved-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-unsaved-dialog-title"
            aria-describedby="admin-unsaved-dialog-copy"
          >
            <div className="admin-unsaved-dialog-content">
              <div className="admin-unsaved-dialog-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                  <path d="M12 3.5 21 19H3l9-15.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M12 9v4.5M12 16.5v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="admin-unsaved-dialog-copy-wrap">
                <p className="admin-unsaved-dialog-kicker">Белый Дракон · Comic Diary</p>
                <h2 id="admin-unsaved-dialog-title" className="admin-unsaved-dialog-title">
                  {unsavedPrompt.kind === "comic-switch"
                    ? "Продолжить без сохранения?"
                    : "Покинуть страницу?"}
                </h2>
                <p id="admin-unsaved-dialog-copy" className="admin-unsaved-dialog-copy">
                  {unsavedPrompt.kind === "comic-switch"
                    ? "У текущего произведения есть несохранённые изменения. Если продолжить, они будут отменены."
                    : "У этого произведения есть несохранённые изменения. Если покинуть страницу, они будут потеряны."}
                </p>
              </div>
            </div>
            <div className="admin-unsaved-dialog-actions">
              <button
                ref={stayButtonRef}
                type="button"
                className="admin-unsaved-dialog-stay"
                onClick={() => resolveUnsavedPrompt(false)}
              >
                Остаться
              </button>
              <button
                ref={leaveButtonRef}
                type="button"
                className="admin-unsaved-dialog-leave"
                onClick={() => resolveUnsavedPrompt(true)}
              >
                {unsavedPrompt.kind === "comic-switch"
                  ? "Отменить и продолжить"
                  : "Покинуть страницу"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
