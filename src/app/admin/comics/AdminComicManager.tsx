"use client";

import { expectedReleasePrecision, formatExpectedRelease, formatReleasedAt, isValidExpectedRelease, type ExpectedReleasePrecision } from "@/modules/catalog/chapter-release-dates";
import { AdminComicList } from "@/modules/catalog/components/AdminComicList";
import { AdminVolumeTitles } from "./AdminVolumeTitles";
import { AdminChapterList } from "@/modules/catalog/components/AdminChapterList";
import { ChapterBatchEditor } from "@/modules/catalog/components/ChapterBatchEditor";
import type { WorkType, WorkFormat } from "@/modules/comics/work-metadata";
import { WorkMetadataFields } from "@/modules/comics/components/WorkMetadataFields";

import { seriesStatusLabels, type SeriesStatus } from "@/modules/comics/series-status";

import {
  CoverUploadField,
} from "@/shared/components/media/CoverUploadField";
import { CoverImage } from "@/shared/components/media/CoverImage";

import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useId,
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
  bannerUrl: string | null;
  sourceUrl: string | null;
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
  volumeTitles: Array<{ number: number; title: string }>;
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
      return "Комикс отклонён серверной проверкой. Проверьте Slug (строчные a–z, 0–9 и дефисы), Source URL (http/https), категорию и положительное количество глав, если оно указано.";

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

    bannerUrl: nullableText(form.get("bannerUrl")),

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
    bannerUrl: payload.bannerUrl ?? "",
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
type CreateWizardStep = "information" | "artwork" | "finish";

type UnsavedChangesPrompt =
  | { kind: "navigation"; destination: string }
  | { kind: "comic-switch" };

function ComicFields({
  categories,
  comic,
  create,
  disabled,
  onUploadingChange,
  onBannerUploadingChange,
  activeTab,
  createStep,
  coverUrl,
  onCoverUrlChange,
  bannerUrl,
  onBannerUrlChange,
}: {
  categories: Category[];
  comic?: AdminComic;
  create: boolean;
  disabled: boolean;
  onUploadingChange: (uploading: boolean) => void;
  onBannerUploadingChange: (uploading: boolean) => void;
  activeTab?: StudioTab;
  createStep?: CreateWizardStep;
  coverUrl?: string;
  onCoverUrlChange?: (value: string) => void;
  bannerUrl?: string;
  onBannerUrlChange?: (value: string) => void;
}) {
  const inputClass = "admin-studio-input";
  const coverDialogRef = useRef<HTMLDialogElement>(null);
  const coverDialogTitleId = useId();
  const coverDialogId = useId();
  const backgroundDialogRef = useRef<HTMLDialogElement>(null);
  const backgroundDialogTitleId = useId();
  const backgroundDialogId = useId();
  // Both uploaders stay mounted in their dialogs so FormData always retains
  // coverUrl, bannerUrl and the in-progress upload indicators.
  const [localCoverUrl, setLocalCoverUrl] = useState(comic?.coverUrl ?? "");
  const currentCoverUrl = coverUrl ?? localCoverUrl;

  function updateCover(next: string) {
    setLocalCoverUrl(next);
    onCoverUrlChange?.(next);
  }
  // In the create form there is no parent-controlled banner. Keep its preview
  // synchronized with the mounted upload field; the form contract stays intact.
  const [localBannerUrl, setLocalBannerUrl] = useState(comic?.bannerUrl ?? "");
  const currentBannerUrl = bannerUrl ?? localBannerUrl;

  function updateBackground(next: string) {
    setLocalBannerUrl(next);
    onBannerUrlChange?.(next);
  }

  return (
    <>
      <div data-create-step={create ? createStep : undefined}
        hidden={activeTab === "chapters" || activeTab === "publication"}>
        <section className="admin-studio-work-card" aria-label="Основная информация о произведении">
          <div className="admin-studio-section-heading">
            <p className="admin-studio-overline">01 · ИСТОРИЯ</p>
            <h3>Основная информация</h3>
            <p>Название, авторы и данные для каталога.</p>
          </div>
          <div className="admin-studio-field-grid">
            <label className="admin-studio-full">Название *
              <input name="title" required defaultValue={comic?.title ?? ""}
                placeholder="Название произведения" className={inputClass} />
            </label>
            <label>Slug *
              <input name="slug" required readOnly={!create}
                pattern={create ? "[a-z0-9]+(?:-[a-z0-9]+)*" : undefined}
                defaultValue={comic?.slug ?? ""} placeholder="latinskoe-nazvanie" className={inputClass}
                onInput={create ? event => {
                  const field = event.currentTarget;
                  const lowerCaseSlug = field.value.toLowerCase();
                  if (field.value !== lowerCaseSlug) field.value = lowerCaseSlug;
                } : undefined}
                aria-describedby={create ? "comic-create-slug-note" : `comic-slug-note-${comic?.id}`} />
              {create ? (
                <span id="comic-create-slug-note" className="mt-1 block text-xs text-[var(--text-secondary)]">
                  Строчные a–z, цифры и дефисы.
                </span>
              ) : (
                <span id={`comic-slug-note-${comic?.id}`} className="mt-1 block text-xs text-[var(--text-secondary)]">
                  Не изменяется после создания.
                </span>
              )}
            </label>
            <label>Категория *
              <select name="categorySlug" required defaultValue={comic?.categorySlug ?? ""} className={inputClass}>
                <option value="" disabled>Выберите категорию</option>
                {categories.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}
              </select>
            </label>
            <label>Автор
              <input name="authorName" defaultValue={comic?.authorName ?? ""}
                placeholder="Имя автора" className={inputClass} />
            </label>
            <label>Переводчик / команда
              <input name="translatorName" defaultValue={comic?.translatorName ?? ""}
                placeholder="Если есть перевод" className={inputClass} />
            </label>
            <label className="admin-studio-full">Ссылка на источник (необязательно)
              <input name="sourceUrl" type="url" defaultValue={comic?.sourceUrl ?? ""}
                placeholder="https://..." className={inputClass} />
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">Можно оставить пустой. Произведение и главы будут доступны в каталоге без внешней ссылки.</span>
            </label>
            <label className="admin-studio-full admin-studio-description-label">Описание
              <textarea name="description" rows={3} defaultValue={comic?.description ?? ""}
                placeholder="О чём эта история?" className={inputClass} />
            </label>
          </div>
        </section>

        <section className="admin-studio-work-card" aria-label="Оформление произведения">
          <div className="admin-studio-section-heading">
            <p className="admin-studio-overline">02 · ОФОРМЛЕНИЕ</p>
            <h3>Обложка и фон</h3>
            <p>Две иллюстрации рядом — без длинной формы для фона.</p>
          </div>
          <div className="admin-studio-artwork-grid">
            <div className="admin-studio-background-card admin-studio-cover-summary-card">
              <span className="admin-studio-background-label">Обложка</span>
              <div className="admin-studio-background-summary">
                <CoverImage src={currentCoverUrl} alt="Предпросмотр обложки произведения"
                  fallback="Без обложки"
                  className="admin-studio-background-thumbnail admin-studio-cover-thumbnail" />
                <p>{currentCoverUrl ? "Обложка выбрана" : "Вертикальное изображение"}</p>
              </div>
              <button type="button" disabled={disabled} aria-haspopup="dialog"
                aria-controls={coverDialogId} className="admin-studio-background-button"
                onClick={() => coverDialogRef.current?.showModal()}>
                {currentCoverUrl ? "Изменить обложку" : "Выбрать обложку"} <span aria-hidden="true">↗</span>
              </button>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">JPG, PNG или WebP · до 6 МБ</span>
            </div>
            <div className="admin-studio-background-card">
              <span className="admin-studio-background-label">Фон страницы комикса</span>
              <div className="admin-studio-background-summary">
                <CoverImage src={currentBannerUrl} alt="Предпросмотр фона комикса"
                  fallback="Стандартный фон"
                  className="admin-studio-background-thumbnail" />
                <p>{currentBannerUrl ? "Фон выбран · 16:9" : "По умолчанию — фон с горами"}</p>
              </div>
              <button type="button" disabled={disabled} aria-haspopup="dialog"
                aria-controls={backgroundDialogId} className="admin-studio-background-button"
                onClick={() => backgroundDialogRef.current?.showModal()}>
                {currentBannerUrl ? "Изменить фон" : "Выбрать фон"} <span aria-hidden="true">↗</span>
              </button>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">Широкая иллюстрация · рекомендовано 16:9</span>
            </div>
          </div>
        </section>

        {/* Modal is visual only: do not unmount uploader inputs when closed. */}
        <dialog id={coverDialogId} ref={coverDialogRef} className="admin-studio-background-dialog"
          aria-labelledby={coverDialogTitleId}>
          <div className="admin-studio-background-dialog-inner">
            <div className="admin-studio-background-dialog-header">
              <div>
                <p className="admin-studio-overline">COMIC STUDIO · ОФОРМЛЕНИЕ</p>
                <h3 id={coverDialogTitleId}>Обложка произведения</h3>
              </div>
              <button type="button" className="admin-studio-dialog-close"
                onClick={() => coverDialogRef.current?.close()}
                aria-label="Закрыть окно выбора обложки">✕</button>
            </div>
            <p className="admin-studio-background-dialog-intro">
              Загрузи вертикальную обложку. Она появится в каталоге после сохранения произведения.
            </p>
            <CoverUploadField
              disabled={disabled}
              onUploadingChange={onUploadingChange}
              value={currentCoverUrl}
              onValueChange={updateCover}
              key={`cover-${comic?.id ?? "new-comic"}`}
              defaultValue={comic?.coverUrl ?? ""}
            />
            <div className="admin-studio-background-dialog-footer">
              <button type="button" className="admin-studio-background-button"
                onClick={() => coverDialogRef.current?.close()}>
                Готово
              </button>
              <span>Обложка закрепится за произведением только после сохранения.</span>
            </div>
          </div>
        </dialog>

        {/* Keep the uploader mounted even while the dialog is closed:
            bannerUrl and bannerUploading remain part of FormData. */}
        <dialog id={backgroundDialogId} ref={backgroundDialogRef} className="admin-studio-background-dialog"
          aria-labelledby={backgroundDialogTitleId}>
          <div className="admin-studio-background-dialog-inner">
            <div className="admin-studio-background-dialog-header">
              <div>
                <p className="admin-studio-overline">COMIC STUDIO · ОФОРМЛЕНИЕ</p>
                <h3 id={backgroundDialogTitleId}>Фон комикса</h3>
              </div>
              <button type="button" className="admin-studio-dialog-close"
                onClick={() => backgroundDialogRef.current?.close()}
                aria-label="Закрыть окно выбора фона">✕</button>
            </div>
            <p className="admin-studio-background-dialog-intro">
              Добавь широкую иллюстрацию (16:9). Без неё останется стандартный фон с горами.
            </p>
            <CoverUploadField
              fieldName="bannerUrl"
              uploadingFieldName="bannerUploading"
              label="Широкий фон"
              widePreview
              allowExternalUrl={false}
              canClear
              uploadSuccessMessage="Фон загружен. Сохрани произведение, чтобы применить его."
              disabled={disabled}
              onUploadingChange={onBannerUploadingChange}
              value={currentBannerUrl}
              onValueChange={updateBackground}
              key={`banner-${comic?.id ?? "new-comic"}`}
              defaultValue={comic?.bannerUrl ?? ""}
            />
            <div className="admin-studio-background-dialog-footer">
              <button type="button" className="admin-studio-background-button"
                onClick={() => backgroundDialogRef.current?.close()}>
                Готово
              </button>
              <span>Изменения применятся к произведению только после его сохранения.</span>
            </div>
          </div>
        </dialog>

        <details className="admin-studio-advanced">
          <summary>Дополнительные параметры
            <span>Тип, формат, количество глав и примечание переводчика</span>
          </summary>
          <div className="admin-studio-field-grid">
            <WorkMetadataFields workType={comic?.workType} workFormat={comic?.workFormat} />
            <label>Заявлено глав (справочно)
              <input name="totalChapters" type="number" min={1} step={1}
                defaultValue={comic?.totalChapters ?? ""} className={inputClass} />
            </label>
            <label className="admin-studio-full">Примечание переводчика
              <textarea name="translatorNote" rows={3}
                defaultValue={comic?.translatorNote ?? ""} className={inputClass} />
            </label>
          </div>
        </details>
      </div>
      <section hidden={create ? createStep !== "finish" : activeTab !== undefined && activeTab !== "publication"}
        className="admin-studio-publication-section">
        <div className="admin-studio-section-heading">
          <p className="admin-studio-overline">03 · ВИДИМОСТЬ</p>
          <h3>Публикация и видимость</h3>
          <p>Статус выхода произведения не определяет его видимость в каталоге.</p>
        </div>
        <div className="admin-studio-field-grid">
          {create ? (
            <div className="admin-studio-create-hidden-status">
              <input type="hidden" name="publicationStatus" value="HIDDEN" />
              <strong>Видимость после сохранения</strong>
              <span>Выбирается кнопкой завершения ниже</span>
            </div>
          ) : (
            <label>Статус в каталоге
              <select name="publicationStatus" defaultValue={comic?.publicationStatus ?? "HIDDEN"} className={inputClass}>
                {(Object.entries(publicationStatusLabels) as [PublicationStatus, string][]).map(([value, label]) =>
                  <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          )}
          <label>Статус выхода
            <select name="seriesStatus" defaultValue={comic?.seriesStatus ?? "UNKNOWN"} className={inputClass}>
              {Object.entries(seriesStatusLabels).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {create ? (
          <p className="admin-studio-section-note">
            Главы можно добавить позднее. Если опубликовать сейчас без глав, читатели увидят произведение в каталоге, но читать пока будет нечего.
          </p>
        ) : (
          <p className="admin-studio-section-note">
            Настройки вступят в силу после сохранения изменений.
          </p>
        )}
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

/** The chapter editor lives in the browser top layer instead of stretching a list row. */
function ChapterEditDialog({ children, titleId, busy, onClose }: {
  children: ReactNode;
  titleId: string;
  busy: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={dialogRef} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto w-[min(760px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/70 sm:max-h-[90dvh] sm:p-6">
    {children}
  </dialog>;
}

export function AdminComicManager({
  categories,
  initialComics,
}: Props) {
  const router =
    useRouter();

  // The editor keeps its own tab state while Next.js refreshes the RSC data.
  // A URL hash is useful for direct links and sidebar navigation, but is not
  // reliable as the only source of UI state across consecutive chapter saves.
  const [studioTab, setStudioTab] = useState<StudioTab>("metadata");

  useEffect(() => {
    function followExplicitHashNavigation() {
      switch (window.location.hash) {
        case "#chapters":
          setStudioTab("chapters");
          break;
        case "#publication":
          setStudioTab("publication");
          break;
        case "#metadata":
          setStudioTab("metadata");
          break;
        // Do not reset the workspace for unrelated hashes or a transient
        // hashless URL during router.refresh().
      }
    }

    followExplicitHashNavigation();
    window.addEventListener("hashchange", followExplicitHashNavigation);
    return () => window.removeEventListener("hashchange", followExplicitHashNavigation);
  }, []);

  function selectStudioTab(tab: StudioTab) {
    setStudioTab(tab);
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(window.history.state, "", `#${tab}`);
      lastKnownLocationRef.current = {
        url: window.location.href,
        state: window.history.state,
      };
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  const [chapterEditFeedback, setChapterEditFeedback] = useState<{ chapterId: number; kind: "error" | "success"; message: string } | null>(null);
  const [coverUploads, setCoverUploads] = useState<Record<string, boolean>>({});
  const [createFormRevision, setCreateFormRevision] = useState(0);
  const [createStep, setCreateStep] = useState<CreateWizardStep>("information");
  const [createDirty, setCreateDirty] = useState(false);
  const [createSummary, setCreateSummary] = useState<ComicPayload | null>(null);
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const comicFormsRef = useRef(new Map<number, HTMLFormElement>());
  const comicBaselinesRef = useRef(new Map<number, ComicPayload>());
  const saveInFlightRef = useRef(false);
  const lastKnownLocationRef = useRef<{ url: string; state: unknown } | null>(null);
  const pendingComicDirtyCheckRef = useRef<{
    comic: AdminComic;
    form: HTMLFormElement;
  } | null>(null);
  const [comicDirty, setComicDirty] = useState<Record<number, boolean>>({});
  const [volumeTitleDirty, setVolumeTitleDirty] = useState<Record<number, boolean>>({});
  const [volumeTitleRevision, setVolumeTitleRevision] = useState<Record<number, number>>({});
  const [comicCoverUrls, setComicCoverUrls] = useState<Record<number, string>>({});
  const [comicBannerUrls, setComicBannerUrls] = useState<Record<number, string>>({});
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedChangesPrompt | null>(null);
  const unsavedPromptRef = useRef<UnsavedChangesPrompt | null>(null);
  const pendingComicSwitchResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const promptReturnFocusRef = useRef<HTMLElement | null>(null);
  const stayButtonRef = useRef<HTMLButtonElement | null>(null);
  const leaveButtonRef = useRef<HTMLButtonElement | null>(null);
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
    setComicBannerUrls(previous => ({ ...previous, [comicId]: baseline.bannerUrl ?? "" }));
    setComicDirty(previous => ({ ...previous, [comicId]: false }));
    setVolumeTitleDirty(previous => ({ ...previous, [comicId]: false }));
    setVolumeTitleRevision(previous => ({ ...previous, [comicId]: (previous[comicId] ?? 0) + 1 }));
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

  function handleComicBannerChange(comic: AdminComic, value: string) {
    setComicBannerUrls(previous => ({ ...previous, [comic.id]: value }));
    const form = comicFormsRef.current.get(comic.id);
    if (!form) return;
    setFormControlValue(form, "bannerUrl", value);
    updateComicDirty(comic, form);
  }

  const hasUnsavedComicChanges =
    Object.values(comicDirty).some(Boolean) ||
    Object.values(coverUploads).some(Boolean) ||
    Object.values(volumeTitleDirty).some(Boolean) ||
    createDirty;

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

      // A creation dialog is in the browser top layer: the normal unsaved
      // overlay would appear behind it. Confirm here instead.
      if (createDialogRef.current?.open && createDirty) {
        if (!window.confirm("Покинуть страницу? Несохранённое произведение будет потеряно.")) return;
        createDialogRef.current.close();
        setCreateDirty(false);
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        return;
      }
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

      if (createDialogRef.current?.open && createDirty) {
        if (!window.confirm("Покинуть страницу? Несохранённое произведение будет потеряно.")) return;
        createDialogRef.current.close();
        setCreateDirty(false);
        router.push(`${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`);
        return;
      }
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
  }, [hasUnsavedComicChanges, createDirty, router]);

  function openCreateWizard() {
    if (busyKey !== null || createDialogRef.current?.open) return;
    setError(null);
    setMessage(null);
    setCreateStep("information");
    setCreateSummary(null);
    createDialogRef.current?.showModal();
  }

  function closeCreateWizard() {
    if (busyKey !== null || coverUploads.create || coverUploads["create-banner"]) return;
    if (createDirty && !window.confirm("Закрыть создание произведения? Несохранённые данные будут потеряны.")) {
      return;
    }
    createDialogRef.current?.close();
    createFormRef.current?.reset();
    setCreateFormRevision(previous => previous + 1);
    setCreateDirty(false);
    setCreateStep("information");
    setCreateSummary(null);
    setError(null);
  }

  function advanceCreateWizard() {
    const form = createFormRef.current;
    if (!form || busyKey !== null) return;
    if (createStep === "information") {
      // Only advance after checking required fields. Hidden steps remain
      // mounted so uploaded media and FormData do not get lost.
      if (!form.checkValidity()) {
        const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(":invalid");
        invalid?.closest("details")?.setAttribute("open", "");
        invalid?.reportValidity();
        setError("Заполните обязательные поля первого этапа.");
        return;
      }
      setError(null);
      setCreateStep("artwork");
      return;
    }
    if (createStep === "artwork") {
      if (coverUploads.create || coverUploads["create-banner"]) {
        setError("Дождитесь окончания загрузки изображения.");
        return;
      }
      setCreateSummary(comicPayload(new FormData(form)));
      setError(null);
      setCreateStep("finish");
    }
  }

  async function saveComic(
    event:
      FormEvent<HTMLFormElement>,
    mode:
      | "create"
      | "update",
    immutableSlug?: string,
  ) {
    event.preventDefault();

    if (mode === "create") {
      if (createStep !== "finish") {
        advanceCreateWizard();
        return;
      }
      if (!event.currentTarget.checkValidity()) {
        const form = event.currentTarget;
        setCreateStep("information");
        setError("Проверьте обязательные поля перед созданием произведения.");
        window.requestAnimationFrame(() => {
          const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(":invalid");
          invalid?.closest("details")?.setAttribute("open", "");
          invalid?.reportValidity();
        });
        return;
      }
    }

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

    if (data.get("coverUploading") === "yes" || data.get("bannerUploading") === "yes") {
      setError("Дождитесь завершения загрузки изображения перед сохранением.");
      saveInFlightRef.current = false;
      setBusyKey(null);
      return;
    }

    const payload =
      comicPayload(
        data,
        immutableSlug,
      );

    // Only a deliberate click on the publish button makes a new work public.
    // Implicit Enter/unknown submitters safely create a hidden draft.
    if (mode === "create") {
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      payload.publicationStatus = submitter instanceof HTMLButtonElement &&
        submitter.value === "PUBLISHED" ? "PUBLISHED" : "HIDDEN";
    }

    if (
      !payload.slug ||
      !payload.title ||
      !payload.categorySlug
    ) {
      setError(
        "Slug, название и категория обязательны.",
      );
      saveInFlightRef.current = false;
      setBusyKey(null);
      return;
    }

    // Mirror the canonical server rules so users know the offending field.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
      setError("Неверный Slug: используйте только строчные латинские буквы, цифры и дефисы (например, test-comic). Без пробелов, заглавных букв и дефиса на краях.");
      saveInFlightRef.current = false;
      setBusyKey(null);
      form.querySelector<HTMLInputElement>('input[name="slug"]')?.focus();
      return;
    }

    if (payload.sourceUrl.trim()) {
      let validSourceUrl = false;
      try {
        const parsed = new URL(payload.sourceUrl);
        validSourceUrl = parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        // The server rejects malformed and non-HTTP(S) source URLs.
      }
      if (!validSourceUrl) {
        setError("Поле Source URL: оставьте пустым или укажите полный адрес с https:// или http://.");
        saveInFlightRef.current = false;
        setBusyKey(null);
        form.querySelector<HTMLInputElement>('input[name="sourceUrl"]')?.focus();
        return;
      }
    }

    if (
      payload.totalChapters !== null &&
      (!Number.isInteger(payload.totalChapters) || payload.totalChapters <= 0)
    ) {
      setError("Поле «Заявлено глав»: оставьте пустым или укажите целое число больше нуля.");
      saveInFlightRef.current = false;
      setBusyKey(null);
      // Optional metadata may be inside a collapsed disclosure; do not hide
      // the actionable error by trying to focus an invisible control.
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
        // Close and reset the wizard only after the server confirms creation.
        setCreateDirty(false);
        createDialogRef.current?.close();
        setCreateStep("information");
        setCreateSummary(null);
        setCreateFormRevision(previous => previous + 1);
        setMessage(
          `Произведение ${payload.slug} создано (${payload.publicationStatus === "PUBLISHED" ? "опубликовано" : "черновик"}). Главы можно добавить в редакторе.`,
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

    const active = comic.chapters.filter(c => c.status !== "ARCHIVED" && c.volumeNumber === chapter.volumeNumber)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
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
      // Keep the editor in the chapter workspace after saving a chapter.
      selectStudioTab("chapters");
      router.refresh();
    } catch {
      setChapterEditFeedback({ chapterId, kind: "error", message: "Не удалось связаться с сервером. Изменения остались в форме — попробуйте ещё раз." });
      setBusyKey(null);
    }
  }


  return (
    <div className="admin-studio-root">
      {error ? <p role="alert" className="admin-studio-feedback is-error">{error}</p> : null}
      {message ? <p role="status" className="admin-studio-feedback is-success">{message}</p> : null}
      <AdminComicList comics={initialComics} categories={categories}
        onCreate={openCreateWizard}
        onSelectionChange={async currentId => {
          if (currentId !== null && (comicDirty[currentId] || volumeTitleDirty[currentId])) {
            const confirmed = await requestComicSwitchConfirmation();
            if (!confirmed) return false;
            discardComicChanges(currentId);
          }
          // Switching works must keep the selected workspace tab. A chapter
          // editor should not be forced into metadata for the next comic.
          return true;
        }}
        locked={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null || Object.values(coverUploads).some(Boolean)}>
        {selectedId => <div className="admin-studio-panels">
          {selectedId === null ? (
            <section className="admin-studio-create-placeholder">
              <h2>Выберите произведение</h2>
              <p>Откройте существующую историю слева или нажмите «+ Добавить», чтобы создать новую в отдельном окне.</p>
              <button type="button" className="admin-studio-background-button" onClick={openCreateWizard} disabled={busyKey !== null}>
                Создать произведение
              </button>
            </section>
          ) : null}
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
                      onBannerUploadingChange={uploading => setCoverUploads(previous => ({ ...previous, [`${comic.slug}:banner`]: uploading }))}
                      bannerUrl={comicBannerUrls[comic.id] ?? comic.bannerUrl ?? ""}
                      onBannerUrlChange={value => handleComicBannerChange(comic, value)}
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

                      <AdminVolumeTitles
                        key={`${comic.id}:${volumeTitleRevision[comic.id] ?? 0}`}
                        comicId={comic.id}
                        volumeNumbers={comic.chapters.map(chapter => chapter.volumeNumber)}
                        initialTitles={comic.volumeTitles}
                        disabled={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null}
                        onDirtyChange={dirty => setVolumeTitleDirty(previous =>
                          (previous[comic.id] ?? false) === dirty ? previous : { ...previous, [comic.id]: dirty })}
                      />

                      {comic.chapters.length > 0 ? (
                        <AdminChapterList chapters={comic.chapters} locked={busyKey !== null || editingChapterId !== null || archiveConfirmChapterId !== null}>
                          {(visibleChapters, canMove) => <ul className="space-y-2">
                          {visibleChapters.map(
                            (chapter, index) => (
                              <Fragment key={chapter.id}>
                              {index === 0 || visibleChapters[index - 1].volumeNumber !== chapter.volumeNumber ? (
                                <li data-chapter-group-heading={chapter.volumeNumber === null ? "none" : String(chapter.volumeNumber)}
                                  className="flex flex-wrap items-center justify-between gap-2 px-1 pt-4 first:pt-0">
                                  <h5 className="text-sm font-semibold text-[var(--text-primary)]">
                                    {chapter.volumeNumber === null ? "Без тома" : `Том ${chapter.volumeNumber}`}
                                  </h5>
                                  <span className="text-xs text-[var(--text-secondary)]">Порядок внутри тома</span>
                                </li>
                              ) : null}
                              <li
                                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                              >
                                {editingChapterId ===
                                chapter.id &&
                                chapterEditValues ? (
                                  <ChapterEditDialog
                                    titleId={`chapter-editor-title-${chapter.id}`}
                                    busy={busyKey !== null}
                                    onClose={() => { setEditingChapterId(null); setChapterEditValues(null); setChapterEditFeedback(null); }}
                                  >
                                  <section className="space-y-4"
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
                                        <span className="block">Ссылка на источник (необязательно)</span>
                                        <input
                                          type="url"
                                          value={chapterEditValues.sourceUrl}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, sourceUrl: event.target.value })}
                                          placeholder="https://..."
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Адрес, куда читатель перейдёт для чтения.</span>
                                      </label>                                      <label className="block text-sm font-medium">
                                        <span className="block">Название главы</span>
                                        <input
                                          value={chapterEditValues.title}
                                          onChange={(event) => setChapterEditValues({ ...chapterEditValues, title: event.target.value })}
                                          placeholder="Например, УРГА"
                                          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />
                                        <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Можно оставить пустым, если указан код главы.</span>
                                      </label>


                                    </div>
                                    <details className="rounded-xl border border-[var(--border)] p-3">
                                      <summary className="min-h-11 cursor-pointer text-sm font-semibold">Дополнительные настройки</summary>
                                      <div className="mt-3 grid gap-4 md:grid-cols-2">
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
                                    </details>

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
                                  </ChapterEditDialog>
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
                                        : "В архиве"}{chapter.status !== "ARCHIVED"
                                          ? ` · Позиция в ${chapter.volumeNumber === null ? "списке без тома" : "томе"}: ${comic.chapters.filter(c => c.status !== "ARCHIVED" && c.volumeNumber === chapter.volumeNumber).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).findIndex(c => c.id === chapter.id) + 1}`
                                          : ""}
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
                                          busyKey !== null || !canMove || editingChapterId !== null || archiveConfirmChapterId !== null || chapter.id === comic.chapters.filter(c => c.status !== "ARCHIVED" && c.volumeNumber === chapter.volumeNumber).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)[0]?.id
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
                                          busyKey !== null || !canMove || editingChapterId !== null || archiveConfirmChapterId !== null || chapter.id === comic.chapters.filter(c => c.status !== "ARCHIVED" && c.volumeNumber === chapter.volumeNumber).sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id)[0]?.id
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
                                          selectStudioTab("chapters");
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
                              </Fragment>
                            ),
                          )}
                        </ul>}
                        </AdminChapterList>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          Главы пока не добавлены.
                        </p>
                      )}

                      <ChapterBatchEditor comicId={comic.id} chapters={comic.chapters} disabled={busyKey !== null}
                        onBusyChange={busy => setBusyKey(busy ? `chapter-batch:${comic.id}` : null)} />
                    </section>

                    <div hidden={studioTab === "chapters"} className="admin-studio-save-actions">
                      {comicDirty[comic.id] ? (
                        <span className="admin-studio-dirty-indicator" role="status">Несохранённые изменения</span>
                      ) : null}
                      <button
                        type="submit"
                        disabled={
                          (coverUploads[comic.slug] || coverUploads[`${comic.slug}:banner`]) ||
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
                        disabled={!comicDirty[comic.id] || busyKey !== null || coverUploads[comic.slug] || coverUploads[`${comic.slug}:banner`]}
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

      <dialog ref={createDialogRef} className="admin-studio-create-dialog"
        aria-labelledby="admin-create-wizard-title"
        onCancel={event => { event.preventDefault(); closeCreateWizard(); }}
        onClick={event => { if (event.target === event.currentTarget) closeCreateWizard(); }}>
        <div className="admin-studio-create-dialog-inner">
          <header className="admin-studio-create-header">
            <div>
              <p className="admin-studio-overline">БЕЛЫЙ ДРАКОН · COMIC STUDIO</p>
              <h2 id="admin-create-wizard-title">Новое произведение</h2>
              <p>Создайте основу истории сейчас. Главы можно добавить позже.</p>
            </div>
            <button type="button" className="admin-studio-dialog-close"
              onClick={() => closeCreateWizard()} aria-label="Закрыть создание произведения"
              disabled={busyKey !== null || !!coverUploads.create || !!coverUploads["create-banner"]}>✕</button>
          </header>
          <nav className="admin-studio-create-steps" aria-label="Этапы создания">
            {([ ["information", "Информация"], ["artwork", "Оформление"], ["finish", "Завершение"] ] as const).map(([step, label], index) => (
              <div key={step} className={createStep === step ? "is-current" : ""}
                aria-current={createStep === step ? "step" : undefined}>
                <span>{index + 1}</span>{label}
              </div>
            ))}
          </nav>
          {categories.length === 0 ? (
            <p role="alert" className="admin-studio-feedback is-error">Создание недоступно: сначала добавьте категорию.</p>
          ) : (
            <form ref={createFormRef} noValidate
              onInput={() => setCreateDirty(true)}
              onChange={() => setCreateDirty(true)}
              onSubmit={event => saveComic(event, "create")}
              className="admin-studio-create-form">
              {error ? <p role="alert" className="admin-studio-feedback is-error">{error}</p> : null}
              <ComicFields key={`create-fields-${createFormRevision}`}
                create createStep={createStep}
                disabled={busyKey !== null}
                onUploadingChange={uploading => setCoverUploads(previous => ({ ...previous, create: uploading }))}
                onBannerUploadingChange={uploading => setCoverUploads(previous => ({ ...previous, "create-banner": uploading }))}
                onCoverUrlChange={() => setCreateDirty(true)}
                onBannerUrlChange={() => setCreateDirty(true)}
                categories={categories} />
              {createStep === "finish" ? (
                <section className="admin-studio-create-review" aria-label="Проверка перед созданием">
                  <h3>Всё готово?</h3>
                  <p><strong>Название:</strong> {createSummary?.title || "Не указано"}</p>
                  <p><strong>Автор:</strong> {createSummary?.authorName || "Не указан"}</p>
                  <p><strong>Переводчик:</strong> {createSummary?.translatorName || "Не указан"}</p>
                  <p><strong>Обложка:</strong> {createSummary?.coverUrl ? "Выбрана" : "Пока нет"}</p>
                  <p><strong>Фон:</strong> {createSummary?.bannerUrl ? "Выбран" : "Стандартный"}</p>
                  <p className="admin-studio-create-no-chapters">Главы не обязательны. После создания откройте произведение и добавьте их через вкладку «Главы».</p>
                </section>
              ) : null}
              <footer className="admin-studio-create-footer">
                <span className="admin-studio-create-draft-note" role="status">
                  {createDirty ? "Есть несохранённые данные" : "Черновик ещё не создан"}
                </span>
                {createStep !== "information" ? (
                  <button type="button" className="admin-studio-create-back"
                    disabled={busyKey !== null}
                    onClick={() => { setError(null); setCreateStep(createStep === "finish" ? "artwork" : "information"); }}>
                    Назад
                  </button>
                ) : null}
                {createStep === "finish" ? (
                  <>
                    <button type="submit" name="createPublicationStatus" value="HIDDEN"
                      disabled={busyKey !== null || !!coverUploads.create || !!coverUploads["create-banner"]}
                      className="admin-studio-create-draft">
                      {busyKey === "create" ? "Сохраняем…" : "Сохранить черновик"}
                    </button>
                    <button type="submit" name="createPublicationStatus" value="PUBLISHED"
                      disabled={busyKey !== null || !!coverUploads.create || !!coverUploads["create-banner"]}
                      className="admin-studio-create-publish">
                      Опубликовать сейчас
                    </button>
                  </>
                ) : (
                  <button type="button" className="admin-studio-create-publish"
                    disabled={busyKey !== null || !!coverUploads.create || !!coverUploads["create-banner"]}
                    onClick={advanceCreateWizard}>
                    Далее →
                  </button>
                )}
              </footer>
            </form>
          )}
        </div>
      </dialog>
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
