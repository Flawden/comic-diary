import type {
  CatalogCategory,
  CatalogComic,
} from "@/catalog/catalog-data";
import { validateCatalogData } from "@/catalog/validate-catalog";

import type {
  VkCandidateSetV1,
} from "./vk-candidate-normalization";
import {
  analyzeVkReviewEntries,
  restoreVkReviewEntriesFromArtifact,
} from "./vk-review";

export type VkCanonicalImportAction =
  | "create"
  | "update"
  | "unchanged";

export type VkCanonicalImportPlanItem = {
  candidateId: string;
  albumId: number;
  action: VkCanonicalImportAction;
  comic: CatalogComic;
};

export type VkCanonicalImportPlan = {
  source: {
    candidateSha256: string;
    snapshotSha256: string;
    communityId: number;
  };

  summary: {
    accepted: number;
    create: number;
    update: number;
    unchanged: number;
  };

  items: VkCanonicalImportPlanItem[];
};

export function buildVkCanonicalImportPlan(
  candidateSet: VkCandidateSetV1,
  candidateSha256: string,
  reviewArtifact: unknown,
  categories: readonly CatalogCategory[],
  existingComics: readonly CatalogComic[],
): VkCanonicalImportPlan {
  /*
   * Never trust canonical / validation / preview
   * fields serialized inside Review Artifact.
   *
   * Restore only reviewer-owned state against
   * the exact candidate-set identity, then
   * recompute the canonical analysis here.
   */
  const entries =
    restoreVkReviewEntriesFromArtifact(
      candidateSet,
      candidateSha256,
      reviewArtifact,
    );

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

  const acceptedEntries =
    entries.filter(
      (entry) =>
        entry.decision === "accepted",
    );

  const blockedAccepted =
    acceptedEntries.filter(
      (entry) => {
        const analysis =
          analysisById.get(
            entry.candidateId,
          );

        return (
          !analysis ||
          !analysis.acceptedReady
        );
      },
    );

  if (blockedAccepted.length > 0) {
    const details =
      blockedAccepted.map(
        (entry) => {
          const analysis =
            analysisById.get(
              entry.candidateId,
            );

          const errors =
            analysis?.errors.length
              ? analysis.errors.join("; ")
              : "accepted entry is not import-ready";

          return `${entry.candidateId}: ${errors}`;
        },
      );

    throw new Error(
      [
        "Accepted review entries are blocked.",
        ...details,
      ].join("\n"),
    );
  }

  const items =
    acceptedEntries.map(
      (
        entry,
      ): VkCanonicalImportPlanItem => {
        const analysis =
          analysisById.get(
            entry.candidateId,
          );

        if (
          !analysis ||
          !analysis.canonical ||
          !analysis.acceptedReady ||
          analysis.previewAction ===
            "invalid"
        ) {
          throw new Error(
            `Accepted review entry lost canonical readiness: ${entry.candidateId}`,
          );
        }

        return {
          candidateId:
            entry.candidateId,

          albumId:
            entry.albumId,

          action:
            analysis.previewAction,

          comic: {
            ...analysis.canonical,
          },
        };
      },
    );

  /*
   * Validate the full accepted batch together.
   * This is intentionally fresh validation,
   * independent of serialized Review Artifact
   * computed fields.
   */
  validateCatalogData(
    categories,
    items.map(
      (item) =>
        item.comic,
    ),
  );

  return {
    source: {
      candidateSha256,

      snapshotSha256:
        candidateSet.source
          .snapshotSha256,

      communityId:
        candidateSet.source
          .communityId,
    },

    summary: {
      accepted:
        items.length,

      create:
        items.filter(
          (item) =>
            item.action === "create",
        ).length,

      update:
        items.filter(
          (item) =>
            item.action === "update",
        ).length,

      unchanged:
        items.filter(
          (item) =>
            item.action === "unchanged",
        ).length,
    },

    items,
  };
}
