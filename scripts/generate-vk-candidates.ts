import {
  createHash,
} from "node:crypto";

import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import {
  buildVkCandidateSet,
} from "../src/modules/admin-import/vk/vk-candidate-normalization";

import type {
  VkRawSnapshotV1,
} from "../src/modules/admin-import/vk/vk-snapshot";

const DEFAULT_INPUT =
  "data/catalog-import/vk/raw/v1/comics_white_dragon-184058047-2026-08-30.json";

const DEFAULT_OUTPUT =
  "data/catalog-import/vk/candidates/v1/comics_white_dragon-184058047-2026-08-30.json";

function normalizePath(
  value: string,
) {
  return value.replaceAll(
    "\\",
    "/",
  );
}

function assertSnapshotRoot(
  value: unknown,
): asserts value is VkRawSnapshotV1 {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    throw new Error(
      "Snapshot root is not an object",
    );
  }

  const root =
    value as Record<
      string,
      unknown
    >;

  if (
    root.schemaVersion !== 1 ||
    root.snapshotKind !==
      "vk-catalog-source"
  ) {
    throw new Error(
      "Unsupported snapshot contract",
    );
  }
}

async function main() {
  const inputRelative =
    process.argv[2] ??
    DEFAULT_INPUT;

  const outputRelative =
    process.argv[3] ??
    DEFAULT_OUTPUT;

  const inputPath =
    resolve(
      process.cwd(),
      inputRelative,
    );

  const outputPath =
    resolve(
      process.cwd(),
      outputRelative,
    );

  const snapshotText =
    await readFile(
      inputPath,
      "utf8",
    );

  const snapshotSha256 =
    createHash("sha256")
      .update(
        snapshotText,
        "utf8",
      )
      .digest("hex");

  const parsed:
    unknown =
    JSON.parse(
      snapshotText,
    );

  assertSnapshotRoot(
    parsed,
  );

  const candidateSet =
    buildVkCandidateSet(
      parsed,
      {
        sourceSnapshotPath:
          normalizePath(
            inputRelative,
          ),

        sourceSnapshotSha256:
          snapshotSha256,

        categorySlug:
          "tea-territory",
      },
    );

  await mkdir(
    dirname(
      outputPath,
    ),
    {
      recursive:
        true,
    },
  );

  await writeFile(
    outputPath,
    JSON.stringify(
      candidateSet,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    "VK candidate normalization completed.",
  );

  console.log(
    `Candidates: ${candidateSet.summary.currentAlbumCandidates}`,
  );

  console.log(
    `Unresolved wall titles: ${candidateSet.summary.unresolvedWallTitleSignals}`,
  );

  console.log(
    `Output: ${normalizePath(outputRelative)}`,
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : String(error),
    );

    process.exitCode =
      1;
  },
);
