"use client";

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  CatalogCategory,
  CatalogComic,
} from "@/catalog/catalog-data";

import type {
  VkCandidateSetV1,
} from "./vk-candidate-normalization";

import {
  analyzeVkReviewEntries,
  buildInitialVkReviewEntries,
  buildVkReviewArtifact,
  restoreVkReviewEntriesFromArtifact,
  type VkReviewDecision,
  type VkReviewDraft,
  type VkReviewEntryV1,
  type VkReviewPreviewAction,
} from "./vk-review";

type Props = {
  candidateSet:
    VkCandidateSetV1;

  candidateSha256:
    string;

  categories:
    CatalogCategory[];

  existingComics:
    CatalogComic[];
};

type ReviewFilter =
  | "all"
  | "attention"
  | "pending"
  | "accepted"
  | "postponed"
  | "skipped"
  | "ready"
  | "invalid";

const attentionWarnings =
  new Set([
    "album-id-title-conflict",
    "historical-album-reference-unconfirmed",
    "wall-title-match-missing",
  ]);

const warningLabels:
  Record<string, string> = {
  "album-id-title-conflict":
    "Album ID связан с другим названием",

  "historical-album-reference-unconfirmed":
    "Есть неподтверждённый исторический альбом",

  "wall-title-match-missing":
    "Нет прямого совпадения названия на стене",

  "raw-title-differs-from-display":
    "Raw title отличается от display title",

  "translation-status-is-not-publication-status":
    "Статус перевода не равен publication status",

  "ephemeral-cover-evidence":
    "Cover URL временный",

  "publication-status-needs-review":
    "Нужно выбрать publication status",

  "chapter-count-missing":
    "Число глав неизвестно",

  "canonical-description-missing":
    "Описание отсутствует",

  "author-metadata-missing":
    "Автор не указан",

  "translator-metadata-missing":
    "Переводчик не указан",
};

const decisionLabels:
  Record<VkReviewDecision, string> = {
  pending:
    "Ожидает решения",

  accepted:
    "Утверждено",

  skipped:
    "Пропустить",

  postponed:
    "Отложить",
};

const previewLabels:
  Record<VkReviewPreviewAction, string> = {
  create:
    "CREATE",

  update:
    "UPDATE",

  unchanged:
    "UNCHANGED",

  invalid:
    "INVALID",
};

const reviewStoragePrefix =
  "comic-diary:vk-review:v1";

function previewClass(
  action: VkReviewPreviewAction,
) {
  if (action === "create") {
    return "border-green-300 bg-green-50 text-green-900";
  }

  if (action === "update") {
    return "border-blue-300 bg-blue-50 text-blue-900";
  }

  if (action === "unchanged") {
    return "border-black/15 bg-black/5 text-[var(--foreground)]";
  }

  return "border-red-300 bg-red-50 text-red-900";
}

function decisionClass(
  decision: VkReviewDecision,
) {
  if (decision === "accepted") {
    return "border-green-300 bg-green-50";
  }

  if (decision === "postponed") {
    return "border-amber-300 bg-amber-50";
  }

  if (decision === "skipped") {
    return "border-black/15 bg-black/5";
  }

  return "border-black/10 bg-[var(--surface)]";
}

function downloadJson(
  filename: string,
  value: unknown,
) {
  const text =
    JSON.stringify(
      value,
      null,
      2,
    ) + "\n";

  const blob =
    new Blob(
      [text],
      {
        type:
          "application/json;charset=utf-8",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url,
      );
    },
    0,
  );
}

export function VkReviewConsole({
  candidateSet,
  candidateSha256,
  categories,
  existingComics,
}: Props) {
  const storageKey =
    `${reviewStoragePrefix}:${candidateSha256}`;

  const initialEntries =
    useMemo(
      () =>
        buildInitialVkReviewEntries(
          candidateSet,
        ),
      [candidateSet],
    );

  const [
    entries,
    setEntries,
  ] =
    useState<VkReviewEntryV1[]>(
      initialEntries,
    );

  const [
    filter,
    setFilter,
  ] =
    useState<ReviewFilter>(
      "all",
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    artifactMessage,
    setArtifactMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    storageReady,
    setStorageReady,
  ] =
    useState(
      false,
    );

  const analyses =
    useMemo(
      () =>
        analyzeVkReviewEntries(
          candidateSet,
          entries,
          categories,
          existingComics,
        ),
      [
        candidateSet,
        entries,
        categories,
        existingComics,
      ],
    );

  useEffect(
    () => {
      let restoredEntries:
        VkReviewEntryV1[] | null =
        null;

      let restoreMessage:
        string | null =
        null;

      try {
        const stored =
          window.localStorage.getItem(
            storageKey,
          );

        if (stored !== null) {
          const parsed:
            unknown =
            JSON.parse(
              stored,
            );

          restoredEntries =
            restoreVkReviewEntriesFromArtifact(
              candidateSet,
              candidateSha256,
              parsed,
            );

          restoreMessage =
            "Review state автоматически восстановлен из браузерного автосохранения.";
        }
      } catch (error) {
        try {
          window.localStorage.removeItem(
            storageKey,
          );
        } catch {
          // localStorage may be unavailable.
        }

        restoreMessage =
          error instanceof Error
            ? `Повреждённое автосохранение отклонено: ${error.message}`
            : "Повреждённое автосохранение отклонено.";
      }

      const timer =
        window.setTimeout(
          () => {
            if (
              restoredEntries !==
              null
            ) {
              setEntries(
                restoredEntries,
              );
            }

            if (
              restoreMessage !==
              null
            ) {
              setArtifactMessage(
                restoreMessage,
              );
            }

            setStorageReady(
              true,
            );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    },
    [
      candidateSet,
      candidateSha256,
      storageKey,
    ],
  );

  useEffect(
    () => {
      if (!storageReady) {
        return;
      }

      try {
        const artifact =
          buildVkReviewArtifact(
            candidateSet,
            candidateSha256,
            entries,
            categories,
            existingComics,
            new Date().toISOString(),
          );

        window.localStorage.setItem(
          storageKey,
          JSON.stringify(
            artifact,
          ),
        );
      } catch {
        // Manual Review JSON export remains available if
        // browser storage is unavailable.
      }
    },
    [
      candidateSet,
      candidateSha256,
      entries,
      categories,
      existingComics,
      storageKey,
      storageReady,
    ],
  );
  const entryById =
    useMemo(
      () =>
        new Map(
          entries.map(
            (entry) => [
              entry.candidateId,
              entry,
            ],
          ),
        ),
      [entries],
    );

  const analysisById =
    useMemo(
      () =>
        new Map(
          analyses.map(
            (analysis) => [
              analysis.candidateId,
              analysis,
            ],
          ),
        ),
      [analyses],
    );

  const stats =
    useMemo(
      () => {
        const accepted =
          entries.filter(
            (entry) =>
              entry.decision ===
              "accepted",
          ).length;

        const acceptedReady =
          analyses.filter(
            (analysis) =>
              analysis.acceptedReady,
          ).length;

        return {
          total:
            entries.length,

          pending:
            entries.filter(
              (entry) =>
                entry.decision ===
                "pending",
            ).length,

          accepted,

          acceptedReady,

          acceptedBlocked:
            accepted -
            acceptedReady,

          postponed:
            entries.filter(
              (entry) =>
                entry.decision ===
                "postponed",
            ).length,

          skipped:
            entries.filter(
              (entry) =>
                entry.decision ===
                "skipped",
            ).length,

          invalid:
            analyses.filter(
              (analysis) =>
                !analysis.valid,
            ).length,

          create:
            analyses.filter(
              (analysis) =>
                analysis.acceptedReady &&
                analysis.previewAction ===
                  "create",
            ).length,

          update:
            analyses.filter(
              (analysis) =>
                analysis.acceptedReady &&
                analysis.previewAction ===
                  "update",
            ).length,

          unchanged:
            analyses.filter(
              (analysis) =>
                analysis.acceptedReady &&
                analysis.previewAction ===
                  "unchanged",
            ).length,
        };
      },
      [
        analyses,
        entries,
      ],
    );

  function updateEntry(
    candidateId: string,
    updater:
      (
        current: VkReviewEntryV1,
      ) => VkReviewEntryV1,
  ) {
    setEntries(
      (current) =>
        current.map(
          (entry) =>
            entry.candidateId ===
            candidateId
              ? updater(entry)
              : entry,
        ),
    );
  }

  function updateDraft<
    K extends keyof VkReviewDraft,
  >(
    candidateId: string,
    field: K,
    value: VkReviewDraft[K],
  ) {
    updateEntry(
      candidateId,
      (entry) => ({
        ...entry,

        draft: {
          ...entry.draft,
          [field]:
            value,
        },
      }),
    );
  }

  function setDecision(
    candidateId: string,
    decision:
      VkReviewDecision,
  ) {
    updateEntry(
      candidateId,
      (entry) => ({
        ...entry,

        decision,

        reviewConfirmed:
          decision === "pending"
            ? false
            : true,
      }),
    );
  }

  function approveCandidate(
    candidateId: string,
  ) {
    const analysis =
      analysisById.get(
        candidateId,
      );

    if (
      !analysis ||
      !analysis.valid ||
      analysis.duplicateSlug
    ) {
      return;
    }

    updateEntry(
      candidateId,
      (entry) => ({
        ...entry,

        decision:
          "accepted",

        reviewConfirmed:
          true,
      }),
    );
  }

  function resetCandidate(
    candidateId: string,
  ) {
    const original =
      initialEntries.find(
        (entry) =>
          entry.candidateId ===
          candidateId,
      );

    if (!original) {
      return;
    }

    updateEntry(
      candidateId,
      () => ({
        ...original,

        draft: {
          ...original.draft,
        },
      }),
    );
  }

  function resetAll() {
    if (
      !window.confirm(
        "Сбросить все решения и правки Review Console?",
      )
    ) {
      return;
    }

    setEntries(
      buildInitialVkReviewEntries(
        candidateSet,
      ),
    );

    setArtifactMessage(
      "Review state сброшен к исходным кандидатам.",
    );
  }

  function exportArtifact() {
    try {
      const exportedAt =
        new Date()
          .toISOString();

      const artifact =
        buildVkReviewArtifact(
          candidateSet,
          candidateSha256,
          entries,
          categories,
          existingComics,
          exportedAt,
        );

      const stamp =
        exportedAt
          .replace(
            /[:.]/g,
            "-",
          );

      downloadJson(
        `comic-diary-vk-review-v1-${stamp}.json`,
        artifact,
      );

      setArtifactMessage(
        "Review Artifact v1 скачан. Это не импорт в каталог.",
      );
    } catch (error) {
      setArtifactMessage(
        error instanceof Error
          ? `Не удалось собрать artifact: ${error.message}`
          : "Не удалось собрать Review Artifact.",
      );
    }
  }

  async function importArtifact(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    try {
      const text =
        await file.text();

      const parsed:
        unknown =
        JSON.parse(
          text,
        );

      const restored =
        restoreVkReviewEntriesFromArtifact(
          candidateSet,
          candidateSha256,
          parsed,
        );

      setEntries(
        restored,
      );

      setArtifactMessage(
        `Review state восстановлен из ${file.name}.`,
      );
    } catch (error) {
      setArtifactMessage(
        error instanceof Error
          ? `Review artifact отклонён: ${error.message}`
          : "Review artifact отклонён.",
      );
    } finally {
      event.target.value =
        "";
    }
  }

  const normalizedSearch =
    search
      .trim()
      .toLocaleLowerCase(
        "ru",
      );

  const visibleCandidates =
    candidateSet.candidates.filter(
      (candidate) => {
        const entry =
          entryById.get(
            candidate.candidateId,
          );

        const analysis =
          analysisById.get(
            candidate.candidateId,
          );

        if (
          !entry ||
          !analysis
        ) {
          return false;
        }

        if (
          normalizedSearch !== ""
        ) {
          const haystack =
            [
              candidate
                .canonicalDraft
                .title.value ??
                "",

              entry.draft.title,

              entry.draft.slug,

              candidate.candidateId,

              String(
                candidate
                  .sourceIdentity
                  .albumId,
              ),
            ]
              .join(" ")
              .toLocaleLowerCase(
                "ru",
              );

          if (
            !haystack.includes(
              normalizedSearch,
            )
          ) {
            return false;
          }
        }

        if (filter === "all") {
          return true;
        }

        if (filter === "attention") {
          return candidate.warnings.some(
            (warning) =>
              attentionWarnings.has(
                warning,
              ),
          );
        }

        if (filter === "ready") {
          return analysis.acceptedReady;
        }

        if (filter === "invalid") {
          return !analysis.valid;
        }

        return (
          entry.decision ===
          filter
        );
      },
    );

  return (
    <section
      id="review-console"
      className="mt-8 space-y-6"
    >
      <div className="rounded-2xl border border-black/10 bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-[var(--primary)]">
              R5.3.5 · Human Review
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Review Console
            </h2>

            <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">
              Каждая карточка рассматривается независимо:
              можно проверить один комикс, исправить его и
              сразу утвердить, не дожидаясь остальных.
              Изменения автоматически сохраняются в этом
              браузере и восстанавливаются после
              перезагрузки. Review Artifact можно скачать
              как переносимый backup. PostgreSQL и
              canonical catalog здесь не изменяются.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
                exportArtifact
              }
              className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Скачать Review JSON
            </button>

            <label className="cursor-pointer rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold">
              Загрузить Review JSON

              <input
                type="file"
                accept="application/json,.json"
                onChange={
                  importArtifact
                }
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={
                resetAll
              }
              className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800"
            >
              Сбросить всё
            </button>
          </div>
        </div>

        {artifactMessage ? (
          <p className="mt-4 rounded-xl border border-black/10 bg-black/5 p-3 text-sm">
            {artifactMessage}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs text-[var(--muted)]">
              Всего
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.total}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs text-[var(--muted)]">
              Pending
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.pending}
            </div>
          </div>

          <div className="rounded-xl border border-green-300 bg-green-50 p-3">
            <div className="text-xs text-green-800/70">
              Accepted ready
            </div>
            <div className="mt-1 text-xl font-bold text-green-900">
              {stats.acceptedReady}
            </div>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="text-xs text-amber-900/70">
              Accepted blocked
            </div>
            <div className="mt-1 text-xl font-bold text-amber-950">
              {stats.acceptedBlocked}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs text-[var(--muted)]">
              Postponed
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.postponed}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs text-[var(--muted)]">
              Skipped
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.skipped}
            </div>
          </div>

          <div className="rounded-xl border border-red-300 bg-red-50 p-3">
            <div className="text-xs text-red-800/70">
              Invalid drafts
            </div>
            <div className="mt-1 text-xl font-bold text-red-900">
              {stats.invalid}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs text-[var(--muted)]">
              Import preview
            </div>
            <div className="mt-1 text-sm font-semibold">
              +{stats.create} / ~{stats.update} / ={stats.unchanged}
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs text-[var(--muted)]">
          Candidate SHA-256: {candidateSha256}
        </p>

        <p className="mt-1 text-xs text-[var(--muted)]">
          {storageReady
            ? "Автосохранение review: активно в этом браузере."
            : "Автосохранение review: восстановление состояния..."}
        </p>
      </div>

      <div className="rounded-2xl border border-black/10 bg-[var(--surface)] p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <label>
            <span className="mb-2 block text-sm font-medium">
              Поиск
            </span>

            <input
              type="search"
              value={search}
              onChange={
                (event) =>
                  setSearch(
                    event.target.value,
                  )
              }
              placeholder="Название, slug, album ID..."
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium">
              Фильтр
            </span>

            <select
              value={filter}
              onChange={
                (event) =>
                  setFilter(
                    event.target
                      .value as
                      ReviewFilter,
                  )
              }
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3"
            >
              <option value="all">
                Все
              </option>

              <option value="attention">
                Требуют особого внимания
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="accepted">
                Accepted
              </option>

              <option value="ready">
                Accepted ready
              </option>

              <option value="postponed">
                Postponed
              </option>

              <option value="skipped">
                Skipped
              </option>

              <option value="invalid">
                Invalid
              </option>
            </select>
          </label>
        </div>

        <p className="mt-3 text-xs text-[var(--muted)]">
          Показано: {visibleCandidates.length} из {candidateSet.candidates.length}
        </p>
      </div>

      {visibleCandidates.map(
        (candidate) => {
          const entry =
            entryById.get(
              candidate.candidateId,
            );

          const analysis =
            analysisById.get(
              candidate.candidateId,
            );

          if (
            !entry ||
            !analysis
          ) {
            return null;
          }

          const canApprove =
            analysis.valid &&
            !analysis.duplicateSlug;

          const isApproved =
            entry.decision ===
              "accepted" &&
            entry.reviewConfirmed;

          return (
            <article
              key={
                candidate.candidateId
              }
              className={`rounded-2xl border p-5 shadow-sm ${decisionClass(
                entry.decision,
              )}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    {candidate.candidateId}
                    {" · "}
                    VK album {candidate.sourceIdentity.albumId}
                  </p>

                  <h3 className="mt-1 break-words text-xl font-bold">
                    {entry.draft.title ||
                      candidate.sourceMetadata.displayTitle}
                  </h3>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${previewClass(
                        analysis.previewAction,
                      )}`}
                    >
                      {previewLabels[
                        analysis.previewAction
                      ]}
                    </span>

                    <span className="rounded-lg border border-black/15 px-2.5 py-1 text-xs font-semibold">
                      {decisionLabels[
                        entry.decision
                      ]}
                    </span>

                    {analysis.acceptedReady ? (
                      <span className="rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-900">
                        READY
                      </span>
                    ) : null}

                    {analysis.duplicateSlug ? (
                      <span className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-900">
                        DUPLICATE SLUG
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={
                    () =>
                      resetCandidate(
                        candidate.candidateId,
                      )
                  }
                  className="rounded-xl border border-black/15 px-3 py-2 text-xs font-semibold"
                >
                  Сбросить карточку
                </button>
              </div>

              {candidate.warnings.length > 0 ? (
                <div className="mt-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Warnings
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {candidate.warnings.map(
                      (warning) => (
                        <span
                          key={warning}
                          className={
                            attentionWarnings.has(
                              warning,
                            )
                              ? "rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-950"
                              : "rounded-lg border border-black/10 bg-black/5 px-2.5 py-1 text-xs"
                          }
                        >
                          {warningLabels[
                            warning
                          ] ??
                            warning}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {analysis.errors.length > 0 ? (
                <div className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
                  <div className="text-sm font-semibold">
                    Validation
                  </div>

                  <ul className="mt-2 space-y-1 text-sm">
                    {analysis.errors.map(
                      (error) => (
                        <li key={error}>
                          • {error}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-900">
                  Canonical draft валиден.
                </div>
              )}

              {analysis.existingCatalogMatch ? (
                <div className="mt-5 rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950">
                  <div className="font-semibold">
                    Existing catalog match
                  </div>

                  <div className="mt-1">
                    {analysis.existingCatalogMatch.title}
                    {" · "}
                    {analysis.existingCatalogMatch.slug}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Category
                  </span>

                  <select
                    value={
                      entry.draft
                        .categorySlug
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "categorySlug",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  >
                    {categories.map(
                      (category) => (
                        <option
                          key={
                            category.slug
                          }
                          value={
                            category.slug
                          }
                        >
                          {category.name}
                          {" · "}
                          {category.slug}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Publication status *
                  </span>

                  <select
                    value={
                      entry.draft
                        .publicationStatus
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "publicationStatus",
                          event.target
                            .value as
                            VkReviewDraft[
                              "publicationStatus"
                            ],
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">
                      — выбрать —
                    </option>

                    <option value="PUBLISHED">
                      PUBLISHED
                    </option>

                    <option value="HIDDEN">
                      HIDDEN
                    </option>

                    <option value="ARCHIVED">
                      ARCHIVED
                    </option>
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Title *
                  </span>

                  <input
                    value={
                      entry.draft.title
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "title",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Slug *
                  </span>

                  <input
                    value={
                      entry.draft.slug
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "slug",
                          event.target.value,
                        )
                    }
                    spellCheck={false}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 font-mono text-sm"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold">
                    Source URL *
                  </span>

                  <input
                    type="url"
                    value={
                      entry.draft
                        .sourceUrl
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "sourceUrl",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold">
                    Description
                  </span>

                  <textarea
                    rows={3}
                    value={
                      entry.draft
                        .description
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "description",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Author
                  </span>

                  <input
                    value={
                      entry.draft
                        .authorName
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "authorName",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Translator
                  </span>

                  <input
                    value={
                      entry.draft
                        .translatorName
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "translatorName",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold">
                    Translator note
                  </span>

                  <textarea
                    rows={2}
                    value={
                      entry.draft
                        .translatorNote
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "translatorNote",
                          event.target.value,
                        )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Total chapters
                  </span>

                  <input
                    inputMode="numeric"
                    value={
                      entry.draft
                        .totalChapters
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "totalChapters",
                          event.target.value,
                        )
                    }
                    placeholder="неизвестно"
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold">
                    Cover URL
                  </span>

                  <input
                    type="url"
                    value={
                      entry.draft
                        .coverUrl
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          candidate.candidateId,
                          "coverUrl",
                          event.target.value,
                        )
                    }
                    placeholder="не задан"
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
              </div>

              <details className="mt-6 rounded-xl border border-black/10 p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  Source evidence
                </summary>

                <div className="mt-4 space-y-5 text-sm">
                  <dl className="grid gap-3 md:grid-cols-2">
                    <div>
                      <dt className="text-xs text-[var(--muted)]">
                        Raw title
                      </dt>
                      <dd className="mt-1 break-words font-medium">
                        {candidate.sourceMetadata.rawTitle}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-[var(--muted)]">
                        Display title
                      </dt>
                      <dd className="mt-1 break-words font-medium">
                        {candidate.sourceMetadata.displayTitle}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-[var(--muted)]">
                        Translation status
                      </dt>
                      <dd className="mt-1">
                        {candidate.sourceMetadata.translationStatusRaw ??
                          "—"}
                        {candidate.sourceMetadata.translationStatusClass
                          ? ` (${candidate.sourceMetadata.translationStatusClass})`
                          : ""}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-[var(--muted)]">
                        Age rating
                      </dt>
                      <dd className="mt-1">
                        {candidate.sourceMetadata.ageRating ??
                          "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-[var(--muted)]">
                        VK photo count
                      </dt>
                      <dd className="mt-1">
                        {candidate.sourceMetadata.photoCount ??
                          "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-[var(--muted)]">
                        Temporary cover evidence
                      </dt>
                      <dd className="mt-1">
                        {candidate.sourceMetadata.coverEvidenceUrl ? (
                          <a
                            href={
                              candidate.sourceMetadata.coverEvidenceUrl
                            }
                            target="_blank"
                            rel="noreferrer noopener"
                            className="font-semibold text-[var(--primary)] underline"
                          >
                            открыть evidence
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <div className="font-semibold">
                      Direct wall title signals:{" "}
                      {candidate.evidence.directWallTitleSignals.length}
                    </div>

                    <div className="mt-2 space-y-2">
                      {candidate.evidence.directWallTitleSignals.map(
                        (
                          signal,
                          index,
                        ) => (
                          <div
                            key={`${signal.comparisonKey}-${index}`}
                            className="rounded-lg bg-black/5 p-3"
                          >
                            <div className="font-medium">
                              {signal.displayTitle}
                            </div>

                            <div className="mt-1 text-xs text-[var(--muted)]">
                              mentions={signal.mentions}
                              {" · "}
                              albumIds=[
                              {signal.albumIds.join(", ")}
                              ]
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      Album-ID co-occurrences:{" "}
                      {candidate.evidence.albumIdCooccurrences.length}
                    </div>

                    <div className="mt-2 space-y-2">
                      {candidate.evidence.albumIdCooccurrences.map(
                        (
                          signal,
                          index,
                        ) => (
                          <div
                            key={`${signal.comparisonKey}-${index}`}
                            className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                          >
                            <div className="font-medium text-amber-950">
                              {signal.displayTitle}
                            </div>

                            <div className="mt-1 text-xs text-amber-900/70">
                              identityConfirmed=false
                              {" · "}
                              mentions={signal.mentions}
                            </div>

                            {signal.samplePostUrls.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {signal.samplePostUrls.map(
                                  (url) => (
                                    <a
                                      key={url}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="text-xs font-semibold text-[var(--primary)] underline"
                                    >
                                      post
                                    </a>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      Original-source links:{" "}
                      {candidate.evidence.originalSourceLinks.length}
                    </div>

                    <div className="mt-2 space-y-2">
                      {candidate.evidence.originalSourceLinks.map(
                        (
                          link,
                          index,
                        ) => (
                          <div
                            key={`${link.comparisonKey}-${index}`}
                            className="rounded-lg bg-black/5 p-3"
                          >
                            <div>
                              {link.name ??
                                "Unnamed source"}
                            </div>

                            {link.url ? (
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="mt-1 block break-all text-xs font-semibold text-[var(--primary)] underline"
                              >
                                {link.url}
                              </a>
                            ) : null}

                            <div className="mt-1 text-xs text-[var(--muted)]">
                              identityConfirmed=false
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold">
                      Historical album references:{" "}
                      {candidate.evidence.historicalAlbumReferences.length}
                    </div>

                    <div className="mt-2 space-y-2">
                      {candidate.evidence.historicalAlbumReferences.map(
                        (history) => (
                          <div
                            key={
                              history.albumId
                            }
                            className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                          >
                            <div className="font-medium text-amber-950">
                              Album {history.albumId}
                            </div>

                            <div className="mt-1 text-xs text-amber-900/70">
                              identityConfirmed=false
                              {" · "}
                              mentions={history.mentions}
                            </div>

                            <div className="mt-1 text-xs">
                              {history.observedTitles
                                .map(
                                  (title) =>
                                    title.displayTitle,
                                )
                                .join(", ")}
                            </div>

                            <a
                              href={history.sourceUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-2 inline-block text-xs font-semibold text-[var(--primary)] underline"
                            >
                              открыть historical album
                            </a>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </details>

              <div className="mt-6 rounded-xl border border-black/10 bg-white/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      !canApprove
                    }
                    onClick={
                      () =>
                        approveCandidate(
                          candidate.candidateId,
                        )
                    }
                    className={
                      canApprove
                        ? "rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white"
                        : "cursor-not-allowed rounded-xl border border-black/10 bg-black/5 px-4 py-2.5 text-sm font-semibold text-[var(--muted)]"
                    }
                  >
                    {isApproved
                      ? "Утверждено"
                      : "Утвердить карточку"}
                  </button>

                  <button
                    type="button"
                    onClick={
                      () =>
                        setDecision(
                          candidate.candidateId,
                          "postponed",
                        )
                    }
                    className={
                      entry.decision ===
                      "postponed"
                        ? "rounded-xl border border-amber-400 bg-amber-100 px-4 py-2.5 text-sm font-semibold text-amber-950"
                        : "rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold"
                    }
                  >
                    Отложить
                  </button>

                  <button
                    type="button"
                    onClick={
                      () =>
                        setDecision(
                          candidate.candidateId,
                          "skipped",
                        )
                    }
                    className={
                      entry.decision ===
                      "skipped"
                        ? "rounded-xl border border-black/30 bg-black/10 px-4 py-2.5 text-sm font-semibold"
                        : "rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold"
                    }
                  >
                    Пропустить
                  </button>

                  {entry.decision !==
                  "pending" ? (
                    <button
                      type="button"
                      onClick={
                        () =>
                          setDecision(
                            candidate.candidateId,
                            "pending",
                          )
                      }
                      className="rounded-xl border border-black/15 px-4 py-2.5 text-sm text-[var(--muted)]"
                    >
                      Снять решение
                    </button>
                  ) : null}
                </div>

                <p className="mt-3 text-xs text-[var(--muted)]">
                  Утверждение относится только к этой
                  карточке. Нажатие кнопки одновременно
                  фиксирует решение Accept и человеческое
                  подтверждение review.
                </p>

                {!canApprove ? (
                  <p className="mt-2 text-xs font-medium text-amber-900">
                    Утверждение недоступно, пока canonical
                    draft невалиден или обнаружен duplicate
                    slug. Отложить или пропустить карточку
                    можно независимо.
                  </p>
                ) : null}

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-semibold">
                    Reviewer note
                  </span>

                  <textarea
                    rows={2}
                    value={
                      entry.reviewerNote
                    }
                    onChange={
                      (event) =>
                        updateEntry(
                          candidate.candidateId,
                          (current) => ({
                            ...current,
                            reviewerNote:
                              event.target.value,
                          }),
                        )
                    }
                    placeholder="Почему исправлено, принято, отложено или пропущено..."
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
              </div>

              {entry.decision ===
                "accepted" &&
              !analysis.acceptedReady ? (
                <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  Карточка пока не READY: исправьте
                  validation или duplicate slug, а затем
                  нажмите «Утвердить карточку». Если это
                  состояние восстановлено из старого Review
                  JSON без confirmation, повторное нажатие
                  также завершит подтверждение.
                </div>
              ) : null}
            </article>
          );
        },
      )}

      <details className="rounded-2xl border border-black/10 bg-[var(--surface)] p-5">
        <summary className="cursor-pointer text-lg font-semibold">
          Unresolved evidence
        </summary>

        <div className="mt-5 space-y-6">
          <div>
            <h3 className="font-semibold">
              Wall title signals ·{" "}
              {candidateSet.unresolvedEvidence.wallTitleSignals.length}
            </h3>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {candidateSet.unresolvedEvidence.wallTitleSignals.map(
                (
                  signal,
                  index,
                ) => (
                  <div
                    key={`${signal.comparisonKey}-${index}`}
                    className="rounded-xl border border-black/10 p-3 text-sm"
                  >
                    <div className="font-semibold">
                      {signal.displayTitle}
                    </div>

                    <div className="mt-1 text-xs text-[var(--muted)]">
                      mentions={signal.mentions}
                      {" · "}
                      albumIds=[
                      {signal.albumIds.join(", ")}
                      ]
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          <div>
            <h3 className="font-semibold">
              Community links ·{" "}
              {candidateSet.unresolvedEvidence.communityLinks.length}
            </h3>

            <div className="mt-3 space-y-2">
              {candidateSet.unresolvedEvidence.communityLinks.map(
                (
                  link,
                  index,
                ) => (
                  <div
                    key={`${link.comparisonKey}-${index}`}
                    className="rounded-xl border border-black/10 p-3 text-sm"
                  >
                    <div className="font-semibold">
                      {link.name ??
                        "Unnamed link"}
                    </div>

                    {link.url ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 block break-all text-xs text-[var(--primary)] underline"
                      >
                        {link.url}
                      </a>
                    ) : null}

                    <div className="mt-1 text-xs text-[var(--muted)]">
                      identityConfirmed=false
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          <div>
            <h3 className="font-semibold">
              Historical album refs ·{" "}
              {candidateSet.unresolvedEvidence.historicalAlbumReferences.length}
            </h3>

            <div className="mt-3 space-y-2">
              {candidateSet.unresolvedEvidence.historicalAlbumReferences.map(
                (history) => (
                  <div
                    key={
                      history.albumId
                    }
                    className="rounded-xl border border-black/10 p-3 text-sm"
                  >
                    <div className="font-semibold">
                      Album {history.albumId}
                    </div>

                    <div className="mt-1">
                      {history.observedTitles
                        .map(
                          (title) =>
                            title.displayTitle,
                        )
                        .join(", ")}
                    </div>

                    <div className="mt-1 text-xs text-[var(--muted)]">
                      identityConfirmed=false
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
