import type {
  CatalogCategory,
  CatalogComic,
  ComicPublicationStatus,
} from "@/catalog/catalog-data";
import { validateCatalogData } from "@/catalog/validate-catalog";

import type {
  VkCandidateSetV1,
} from "./vk-candidate-normalization";

export const VK_REVIEW_SCHEMA_VERSION =
  1 as const;

export const VK_REVIEW_KIND =
  "vk-catalog-review" as const;

export type VkReviewDecision =
  | "pending"
  | "accepted"
  | "skipped"
  | "postponed";

export type VkReviewPreviewAction =
  | "create"
  | "update"
  | "unchanged"
  | "invalid";

export type VkReviewDraft = {
  categorySlug: string;
  slug: string;
  title: string;

  description: string;
  authorName: string;
  translatorName: string;
  translatorNote: string;

  sourceUrl: string;

  /*
   * Empty string means unknown.
   * It is converted to null only at the
   * canonical validation boundary.
   */
  totalChapters: string;

  coverUrl: string;

  publicationStatus:
    | ComicPublicationStatus
    | "";
};

export type VkReviewEntryV1 = {
  candidateId: string;

  albumId: number;

  decision:
    VkReviewDecision;

  /*
   * Required independently from field validity.
   * The reviewer confirms that warnings and
   * evidence were actually inspected.
   */
  reviewConfirmed:
    boolean;

  reviewerNote:
    string;

  draft:
    VkReviewDraft;
};

export type VkReviewEntryAnalysis = {
  candidateId: string;

  valid:
    boolean;

  errors:
    string[];

  duplicateSlug:
    boolean;

  canonical:
    CatalogComic | null;

  existingCatalogMatch:
    CatalogComic | null;

  previewAction:
    VkReviewPreviewAction;

  acceptedReady:
    boolean;
};

export type VkReviewArtifactEntryV1 = {
  candidateId: string;

  albumId: number;

  decision:
    VkReviewDecision;

  reviewConfirmed:
    boolean;

  reviewerNote:
    string | null;

  draft:
    VkReviewDraft;

  canonical:
    CatalogComic | null;

  validation: {
    valid: boolean;
    errors: string[];
    duplicateSlug: boolean;
  };

  preview: {
    action:
      VkReviewPreviewAction;

    existingCatalogSlug:
      string | null;
  };

  acceptedReady:
    boolean;
};

export type VkReviewArtifactV1 = {
  schemaVersion:
    1;

  reviewKind:
    "vk-catalog-review";

  exportedAt:
    string;

  source: {
    candidateKind:
      "vk-catalog-candidates";

    candidateSchemaVersion:
      number;

    normalizerVersion:
      number;

    candidateSha256:
      string;

    snapshotSha256:
      string;

    communityId:
      number;
  };

  policy: {
    explicitHumanDecisionRequired:
      true;

    explicitReviewConfirmationRequired:
      true;

    canonicalValidationRequired:
      true;

    duplicateSlugBlocksAcceptance:
      true;

    acceptedDoesNotImport:
      true;

    canonicalCatalogWrites:
      false;

    databaseWrites:
      false;
  };

  summary: {
    total:
      number;

    pending:
      number;

    accepted:
      number;

    skipped:
      number;

    postponed:
      number;

    acceptedReady:
      number;

    acceptedBlocked:
      number;

    create:
      number;

    update:
      number;

    unchanged:
      number;

    invalid:
      number;

    duplicateSlugEntries:
      number;
  };

  reviews:
    VkReviewArtifactEntryV1[];
};

function optionalText(
  value: string,
) {
  return value === ""
    ? null
    : value;
}

function parseTotalChapters(
  value: string,
) {
  if (value === "") {
    return {
      value: null,
      error: null,
    };
  }

  if (!/^[0-9]+$/.test(value)) {
    return {
      value: null,
      error:
        "totalChapters must be blank or a positive integer",
    };
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    return {
      value: null,
      error:
        "totalChapters must be blank or a positive integer",
    };
  }

  return {
    value: parsed,
    error: null,
  };
}

function canonicalEqual(
  left: CatalogComic,
  right: CatalogComic,
) {
  return (
    left.categorySlug ===
      right.categorySlug &&
    left.slug ===
      right.slug &&
    left.title ===
      right.title &&
    left.description ===
      right.description &&
    left.authorName ===
      right.authorName &&
    left.translatorName ===
      right.translatorName &&
    left.translatorNote ===
      right.translatorNote &&
    left.sourceUrl ===
      right.sourceUrl &&
    left.totalChapters ===
      right.totalChapters &&
    left.coverUrl ===
      right.coverUrl &&
    left.publicationStatus ===
      right.publicationStatus
  );
}

function validateDraft(
  draft: VkReviewDraft,
  categories: readonly CatalogCategory[],
) {
  const errors: string[] = [];

  if (
    draft.publicationStatus === ""
  ) {
    errors.push(
      "publicationStatus is required",
    );
  }

  const parsedChapters =
    parseTotalChapters(
      draft.totalChapters,
    );

  if (parsedChapters.error) {
    errors.push(
      parsedChapters.error,
    );
  }

  if (
    errors.length > 0 ||
    draft.publicationStatus === ""
  ) {
    return {
      canonical:
        null,

      errors,
    };
  }

  const canonical:
    CatalogComic = {
    categorySlug:
      draft.categorySlug,

    slug:
      draft.slug,

    title:
      draft.title,

    description:
      optionalText(
        draft.description,
      ),

    authorName:
      optionalText(
        draft.authorName,
      ),

    translatorName:
      optionalText(
        draft.translatorName,
      ),

    translatorNote:
      optionalText(
        draft.translatorNote,
      ),

    sourceUrl:
      draft.sourceUrl,

    totalChapters:
      parsedChapters.value,

    coverUrl:
      optionalText(
        draft.coverUrl,
      ),

    publicationStatus:
      draft.publicationStatus,
  };

  try {
    validateCatalogData(
      categories,
      [canonical],
    );
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : String(error),
    );
  }

  return {
    canonical:
      errors.length === 0
        ? canonical
        : null,

    errors,
  };
}

export function buildInitialVkReviewEntries(
  candidateSet: VkCandidateSetV1,
): VkReviewEntryV1[] {
  if (
    candidateSet.schemaVersion !== 1 ||
    candidateSet.candidateKind !==
      "vk-catalog-candidates"
  ) {
    throw new Error(
      "Unsupported VK candidate contract",
    );
  }

  return candidateSet.candidates.map(
    (candidate) => ({
      candidateId:
        candidate.candidateId,

      albumId:
        candidate.sourceIdentity
          .albumId,

      decision:
        "pending",

      reviewConfirmed:
        false,

      reviewerNote:
        "",

      draft: {
        categorySlug:
          candidate.canonicalDraft
            .categorySlug.value ??
          "",

        slug:
          candidate.canonicalDraft
            .slug.value ??
          "",

        title:
          candidate.canonicalDraft
            .title.value ??
          "",

        description:
          candidate.canonicalDraft
            .description.value ??
          "",

        authorName:
          candidate.canonicalDraft
            .authorName.value ??
          "",

        translatorName:
          candidate.canonicalDraft
            .translatorName.value ??
          "",

        translatorNote:
          candidate.canonicalDraft
            .translatorNote.value ??
          "",

        sourceUrl:
          candidate.canonicalDraft
            .sourceUrl.value ??
          "",

        totalChapters:
          candidate.canonicalDraft
            .totalChapters.value ===
          null
            ? ""
            : String(
                candidate
                  .canonicalDraft
                  .totalChapters
                  .value,
              ),

        coverUrl:
          candidate.canonicalDraft
            .coverUrl.value ??
          "",

        publicationStatus:
          candidate.canonicalDraft
            .publicationStatus.value ??
          "",
      },
    }),
  );
}

function assertEntryIdentity(
  candidateSet: VkCandidateSetV1,
  entries: readonly VkReviewEntryV1[],
) {
  if (
    entries.length !==
    candidateSet.candidates.length
  ) {
    throw new Error(
      "Review entry count does not match candidate set",
    );
  }

  const expected =
    new Map(
      candidateSet.candidates.map(
        (candidate) => [
          candidate.candidateId,
          candidate.sourceIdentity
            .albumId,
        ],
      ),
    );

  const seen =
    new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.candidateId)) {
      throw new Error(
        `Duplicate review candidate: ${entry.candidateId}`,
      );
    }

    seen.add(
      entry.candidateId,
    );

    const albumId =
      expected.get(
        entry.candidateId,
      );

    if (
      albumId === undefined ||
      albumId !== entry.albumId
    ) {
      throw new Error(
        `Unknown review candidate: ${entry.candidateId}`,
      );
    }
  }
}

export function analyzeVkReviewEntries(
  candidateSet: VkCandidateSetV1,
  entries: readonly VkReviewEntryV1[],
  categories: readonly CatalogCategory[],
  existingComics: readonly CatalogComic[],
): VkReviewEntryAnalysis[] {
  assertEntryIdentity(
    candidateSet,
    entries,
  );

  const activeSlugCounts =
    new Map<string, number>();

  for (const entry of entries) {
    if (
      entry.decision === "skipped" ||
      entry.decision === "postponed"
    ) {
      continue;
    }

    const slug =
      entry.draft.slug;

    if (slug === "") {
      continue;
    }

    activeSlugCounts.set(
      slug,
      (
        activeSlugCounts.get(slug) ??
        0
      ) + 1,
    );
  }

  const existingBySlug =
    new Map(
      existingComics.map(
        (comic) => [
          comic.slug,
          comic,
        ],
      ),
    );

  return entries.map(
    (
      entry,
    ): VkReviewEntryAnalysis => {
      const validation =
        validateDraft(
          entry.draft,
          categories,
        );

      const duplicateSlug =
        (
          activeSlugCounts.get(
            entry.draft.slug,
          ) ?? 0
        ) > 1;

      const errors =
        [...validation.errors];

      if (duplicateSlug) {
        errors.push(
          `Duplicate active review slug: ${entry.draft.slug}`,
        );
      }

      const canonical =
        errors.length === 0
          ? validation.canonical
          : null;

      const existingCatalogMatch =
        canonical
          ? (
              existingBySlug.get(
                canonical.slug,
              ) ??
              null
            )
          : null;

      let previewAction:
        VkReviewPreviewAction =
          "invalid";

      if (canonical) {
        if (!existingCatalogMatch) {
          previewAction =
            "create";
        } else if (
          canonicalEqual(
            canonical,
            existingCatalogMatch,
          )
        ) {
          previewAction =
            "unchanged";
        } else {
          previewAction =
            "update";
        }
      }

      const acceptedReady =
        entry.decision ===
          "accepted" &&
        entry.reviewConfirmed &&
        canonical !== null &&
        !duplicateSlug;

      return {
        candidateId:
          entry.candidateId,

        valid:
          canonical !== null,

        errors,

        duplicateSlug,

        canonical,

        existingCatalogMatch,

        previewAction,

        acceptedReady,
      };
    },
  );
}

export function buildVkReviewArtifact(
  candidateSet: VkCandidateSetV1,
  candidateSha256: string,
  entries: readonly VkReviewEntryV1[],
  categories: readonly CatalogCategory[],
  existingComics: readonly CatalogComic[],
  exportedAt: string,
): VkReviewArtifactV1 {
  const analyses =
    analyzeVkReviewEntries(
      candidateSet,
      entries,
      categories,
      existingComics,
    );

  const analysisById =
    new Map(
      analyses.map(
        (analysis) => [
          analysis.candidateId,
          analysis,
        ],
      ),
    );

  const reviews =
    entries.map(
      (
        entry,
      ): VkReviewArtifactEntryV1 => {
        const analysis =
          analysisById.get(
            entry.candidateId,
          );

        if (!analysis) {
          throw new Error(
            `Missing review analysis: ${entry.candidateId}`,
          );
        }

        return {
          candidateId:
            entry.candidateId,

          albumId:
            entry.albumId,

          decision:
            entry.decision,

          reviewConfirmed:
            entry.reviewConfirmed,

          reviewerNote:
            entry.reviewerNote === ""
              ? null
              : entry.reviewerNote,

          draft: {
            ...entry.draft,
          },

          canonical:
            analysis.canonical,

          validation: {
            valid:
              analysis.valid,

            errors:
              [...analysis.errors],

            duplicateSlug:
              analysis.duplicateSlug,
          },

          preview: {
            action:
              analysis.previewAction,

            existingCatalogSlug:
              analysis
                .existingCatalogMatch
                ?.slug ??
              null,
          },

          acceptedReady:
            analysis.acceptedReady,
        };
      },
    );

  const accepted =
    reviews.filter(
      (entry) =>
        entry.decision ===
        "accepted",
    );

  return {
    schemaVersion:
      VK_REVIEW_SCHEMA_VERSION,

    reviewKind:
      VK_REVIEW_KIND,

    exportedAt,

    source: {
      candidateKind:
        candidateSet.candidateKind,

      candidateSchemaVersion:
        candidateSet.schemaVersion,

      normalizerVersion:
        candidateSet.normalizerVersion,

      candidateSha256,

      snapshotSha256:
        candidateSet.source
          .snapshotSha256,

      communityId:
        candidateSet.source
          .communityId,
    },

    policy: {
      explicitHumanDecisionRequired:
        true,

      explicitReviewConfirmationRequired:
        true,

      canonicalValidationRequired:
        true,

      duplicateSlugBlocksAcceptance:
        true,

      acceptedDoesNotImport:
        true,

      canonicalCatalogWrites:
        false,

      databaseWrites:
        false,
    },

    summary: {
      total:
        reviews.length,

      pending:
        reviews.filter(
          (entry) =>
            entry.decision ===
            "pending",
        ).length,

      accepted:
        accepted.length,

      skipped:
        reviews.filter(
          (entry) =>
            entry.decision ===
            "skipped",
        ).length,

      postponed:
        reviews.filter(
          (entry) =>
            entry.decision ===
            "postponed",
        ).length,

      acceptedReady:
        accepted.filter(
          (entry) =>
            entry.acceptedReady,
        ).length,

      acceptedBlocked:
        accepted.filter(
          (entry) =>
            !entry.acceptedReady,
        ).length,

      create:
        accepted.filter(
          (entry) =>
            entry.acceptedReady &&
            entry.preview.action ===
              "create",
        ).length,

      update:
        accepted.filter(
          (entry) =>
            entry.acceptedReady &&
            entry.preview.action ===
              "update",
        ).length,

      unchanged:
        accepted.filter(
          (entry) =>
            entry.acceptedReady &&
            entry.preview.action ===
              "unchanged",
        ).length,

      invalid:
        reviews.filter(
          (entry) =>
            !entry.validation.valid,
        ).length,

      duplicateSlugEntries:
        reviews.filter(
          (entry) =>
            entry.validation
              .duplicateSlug,
        ).length,
    },

    reviews,
  };
}
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireString(
  value: unknown,
  field: string,
) {
  if (typeof value !== "string") {
    throw new Error(
      `Invalid review artifact field: ${field}`,
    );
  }

  return value;
}

function requireBoolean(
  value: unknown,
  field: string,
) {
  if (typeof value !== "boolean") {
    throw new Error(
      `Invalid review artifact field: ${field}`,
    );
  }

  return value;
}

function requireDecision(
  value: unknown,
): VkReviewDecision {
  if (
    value === "pending" ||
    value === "accepted" ||
    value === "skipped" ||
    value === "postponed"
  ) {
    return value;
  }

  throw new Error(
    "Invalid review artifact decision",
  );
}

function requirePublicationStatus(
  value: unknown,
): VkReviewDraft["publicationStatus"] {
  if (
    value === "" ||
    value === "PUBLISHED" ||
    value === "HIDDEN" ||
    value === "ARCHIVED"
  ) {
    return value;
  }

  throw new Error(
    "Invalid review artifact publicationStatus",
  );
}

export function restoreVkReviewEntriesFromArtifact(
  candidateSet: VkCandidateSetV1,
  candidateSha256: string,
  value: unknown,
): VkReviewEntryV1[] {
  if (!isRecord(value)) {
    throw new Error(
      "Review artifact root is not an object",
    );
  }

  if (
    value.schemaVersion !== 1 ||
    value.reviewKind !==
      "vk-catalog-review"
  ) {
    throw new Error(
      "Unsupported review artifact contract",
    );
  }

  if (!isRecord(value.source)) {
    throw new Error(
      "Review artifact source is invalid",
    );
  }

  if (
    value.source.candidateKind !==
      candidateSet.candidateKind ||
    value.source.candidateSchemaVersion !==
      candidateSet.schemaVersion ||
    value.source.normalizerVersion !==
      candidateSet.normalizerVersion ||
    value.source.candidateSha256 !==
      candidateSha256 ||
    value.source.snapshotSha256 !==
      candidateSet.source.snapshotSha256 ||
    value.source.communityId !==
      candidateSet.source.communityId
  ) {
    throw new Error(
      "Review artifact belongs to a different candidate set",
    );
  }

  if (!Array.isArray(value.reviews)) {
    throw new Error(
      "Review artifact reviews are invalid",
    );
  }

  const entries =
    value.reviews.map(
      (
        raw,
        index,
      ): VkReviewEntryV1 => {
        if (!isRecord(raw)) {
          throw new Error(
            `Invalid review entry at index ${index}`,
          );
        }

        if (
          typeof raw.albumId !== "number" ||
          !Number.isInteger(raw.albumId)
        ) {
          throw new Error(
            `Invalid albumId at review index ${index}`,
          );
        }

        if (!isRecord(raw.draft)) {
          throw new Error(
            `Invalid draft at review index ${index}`,
          );
        }

        const note =
          raw.reviewerNote;

        if (
          note !== null &&
          typeof note !== "string"
        ) {
          throw new Error(
            `Invalid reviewerNote at review index ${index}`,
          );
        }

        return {
          candidateId:
            requireString(
              raw.candidateId,
              "candidateId",
            ),

          albumId:
            raw.albumId,

          decision:
            requireDecision(
              raw.decision,
            ),

          reviewConfirmed:
            requireBoolean(
              raw.reviewConfirmed,
              "reviewConfirmed",
            ),

          reviewerNote:
            note ?? "",

          draft: {
            categorySlug:
              requireString(
                raw.draft.categorySlug,
                "draft.categorySlug",
              ),

            slug:
              requireString(
                raw.draft.slug,
                "draft.slug",
              ),

            title:
              requireString(
                raw.draft.title,
                "draft.title",
              ),

            description:
              requireString(
                raw.draft.description,
                "draft.description",
              ),

            authorName:
              requireString(
                raw.draft.authorName,
                "draft.authorName",
              ),

            translatorName:
              requireString(
                raw.draft.translatorName,
                "draft.translatorName",
              ),

            translatorNote:
              requireString(
                raw.draft.translatorNote,
                "draft.translatorNote",
              ),

            sourceUrl:
              requireString(
                raw.draft.sourceUrl,
                "draft.sourceUrl",
              ),

            totalChapters:
              requireString(
                raw.draft.totalChapters,
                "draft.totalChapters",
              ),

            coverUrl:
              requireString(
                raw.draft.coverUrl,
                "draft.coverUrl",
              ),

            publicationStatus:
              requirePublicationStatus(
                raw.draft.publicationStatus,
              ),
          },
        };
      },
    );

  assertEntryIdentity(
    candidateSet,
    entries,
  );

  const byId =
    new Map(
      entries.map(
        (entry) => [
          entry.candidateId,
          entry,
        ],
      ),
    );

  return candidateSet.candidates.map(
    (candidate) => {
      const entry =
        byId.get(
          candidate.candidateId,
        );

      if (!entry) {
        throw new Error(
          `Review artifact is missing ${candidate.candidateId}`,
        );
      }

      return {
        ...entry,

        draft: {
          ...entry.draft,
        },
      };
    },
  );
}
