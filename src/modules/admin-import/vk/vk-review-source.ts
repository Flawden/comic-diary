import {
  createHash,
} from "node:crypto";

import {
  readFile,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

import {
  catalogCategories,
  catalogComics,
} from "@/catalog/catalog-data";

import type {
  VkCandidateSetV1,
} from "./vk-candidate-normalization";

const CANDIDATE_PATH =
  "data/catalog-import/vk/candidates/v1/comics_white_dragon-184058047-2026-08-30.json";

const EXPECTED_CANDIDATE_SHA256 =
  "e86ddb92ad14fc3ce209ed227496538b36ccdb75c1c38b909169ebe88bae6fb2";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertCandidateSet(
  value: unknown,
): asserts value is VkCandidateSetV1 {
  if (!isRecord(value)) {
    throw new Error(
      "VK candidate artifact root is invalid",
    );
  }

  if (
    value.schemaVersion !== 1 ||
    value.normalizerVersion !== 1 ||
    value.candidateKind !==
      "vk-catalog-candidates"
  ) {
    throw new Error(
      "Unsupported VK candidate artifact",
    );
  }

  if (!Array.isArray(value.candidates)) {
    throw new Error(
      "VK candidate collection is invalid",
    );
  }

  if (value.candidates.length !== 36) {
    throw new Error(
      "Unexpected VK candidate count",
    );
  }

  if (!isRecord(value.source)) {
    throw new Error(
      "VK candidate source is invalid",
    );
  }

  if (
    value.source.communityId !==
      184058047
  ) {
    throw new Error(
      "Unexpected VK candidate community",
    );
  }
}

export async function loadVkReviewWorkspace() {
  const absolutePath =
    resolve(
      process.cwd(),
      CANDIDATE_PATH,
    );

  const buffer =
    await readFile(
      absolutePath,
    );

  const candidateSha256 =
    createHash("sha256")
      .update(buffer)
      .digest("hex");

  if (
    candidateSha256 !==
    EXPECTED_CANDIDATE_SHA256
  ) {
    throw new Error(
      "VK candidate artifact SHA-256 mismatch",
    );
  }

  const parsed:
    unknown =
    JSON.parse(
      buffer.toString("utf8"),
    );

  assertCandidateSet(
    parsed,
  );

  return {
    candidateSet:
      parsed,

    candidateSha256,

    categories:
      [...catalogCategories],

    existingComics:
      [...catalogComics],
  };
}
