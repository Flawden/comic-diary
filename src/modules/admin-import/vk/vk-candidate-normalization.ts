import type {
  ComicPublicationStatus,
} from "@/catalog/catalog-data";

import type {
  VkRawSnapshotV1,
} from "./vk-snapshot";

export const VK_CANDIDATE_SET_SCHEMA_VERSION =
  1 as const;

export const VK_CANDIDATE_NORMALIZER_VERSION =
  1 as const;

type CandidateFieldState =
  | "source"
  | "derived"
  | "configured"
  | "missing"
  | "review-required";

type CandidateEvidence = {
  kind:
    | "vk-album-field"
    | "vk-album-description"
    | "pipeline-config"
    | "normalizer-rule";

  source: string;

  value:
    | string
    | number
    | null;

  note: string;
};

type CandidateField<T> = {
  value: T | null;
  state: CandidateFieldState;
  evidence: CandidateEvidence[];
};

type TranslationStatusClass =
  | "completed"
  | "ongoing"
  | "frozen"
  | "unknown";

type CandidateWallTitleEvidence = {
  comparisonKey: string;

  normalizedTitle: string;
  displayTitle: string;

  observedTitles: string[];

  mentions: number;

  albumIds: number[];
  singletonAlbumIds: number[];

  samplePostUrls: string[];

  relationship:
    | "comparison-key-match"
    | "album-id-cooccurrence";

  /*
   * Discovery evidence does not establish
   * canonical identity.
   */
  identityConfirmed: false;
};

type CandidateCommunityLinkEvidence = {
  name: string | null;
  url: string | null;

  comparisonKey: string;

  relationship:
    "comparison-key-match";

  identityConfirmed: false;
};

type CandidateHistoricalEvidence = {
  albumId: number;

  sourceUrl: string;

  mentions: number;

  firstSeenUnix: number | null;
  lastSeenUnix: number | null;

  samplePostUrls: string[];

  observedTitles: Array<{
    comparisonKey: string;
    displayTitle: string;
  }>;

  currentAlbumPresent: false;
  identityConfirmed: false;
};

export type VkCatalogCandidateV1 = {
  candidateId: string;

  sourceIdentity: {
    provider: "vk";
    communityId: number;
    albumId: number;
    currentAlbumPresent: true;
  };

  canonicalDraft: {
    categorySlug:
      CandidateField<string>;

    slug:
      CandidateField<string>;

    title:
      CandidateField<string>;

    description:
      CandidateField<string>;

    authorName:
      CandidateField<string>;

    translatorName:
      CandidateField<string>;

    translatorNote:
      CandidateField<string>;

    sourceUrl:
      CandidateField<string>;

    totalChapters:
      CandidateField<number>;

    coverUrl:
      CandidateField<string>;

    publicationStatus:
      CandidateField<ComicPublicationStatus>;
  };

  sourceMetadata: {
    rawTitle: string;
    displayTitle: string;

    rawDescription: string | null;
    descriptionRemainder: string | null;

    translationStatusRaw:
      string | null;

    translationStatusClass:
      TranslationStatusClass | null;

    ageRating:
      number | null;

    photoCount:
      number | null;

    /*
     * Signed source evidence only.
     */
    coverEvidenceUrl:
      string | null;

    createdUnix:
      number | null;

    updatedUnix:
      number | null;
  };

  evidence: {
    directWallTitleSignals:
      CandidateWallTitleEvidence[];

    albumIdCooccurrences:
      CandidateWallTitleEvidence[];

    originalSourceLinks:
      CandidateCommunityLinkEvidence[];

    historicalAlbumReferences:
      CandidateHistoricalEvidence[];
  };

  warnings: string[];

  review: {
    required: true;

    importReady: false;

    blockingFields: Array<
      "publicationStatus"
    >;
  };
};

type UnresolvedWallTitleEvidence = {
  comparisonKey: string;

  normalizedTitle: string;
  displayTitle: string;

  observedTitles: string[];

  mentions: number;

  albumIds: number[];
  singletonAlbumIds: number[];

  samplePostUrls: string[];
};

export type VkCandidateSetV1 = {
  schemaVersion: 1;

  normalizerVersion: 1;

  candidateKind:
    "vk-catalog-candidates";

  source: {
    snapshotKind:
      "vk-catalog-source";

    snapshotSchemaVersion:
      number;

    snapshotPath:
      string;

    snapshotSha256:
      string;

    communityId:
      number;

    communityScreenName:
      string;

    snapshotGeneratedAt:
      string;
  };

  policy: {
    currentAlbumsCreateCandidates:
      true;

    wallSignalsCreateCandidates:
      false;

    historicalReferencesCreateCandidates:
      false;

    translationStatusMapsToPublicationStatus:
      false;

    photoCountMapsToTotalChapters:
      false;

    signedCoverEvidenceMapsToCanonicalCover:
      false;

    automaticAliasIdentity:
      false;
  };

  summary: {
    currentAlbumCandidates:
      number;

    withStructuredTranslationMetadata:
      number;

    withDirectWallTitleEvidence:
      number;

    withOriginalSourceLinkEvidence:
      number;

    withHistoricalReferenceEvidence:
      number;

    withAlbumIdTitleConflictEvidence:
      number;

    unresolvedWallTitleSignals:
      number;

    unresolvedCommunityLinks:
      number;

    unresolvedHistoricalAlbumReferences:
      number;

    importReadyCandidates:
      number;
  };

  candidates:
    VkCatalogCandidateV1[];

  unresolvedEvidence: {
    wallTitleSignals:
      UnresolvedWallTitleEvidence[];

    communityLinks:
      CandidateCommunityLinkEvidence[];

    historicalAlbumReferences:
      CandidateHistoricalEvidence[];
  };
};

type BuildOptions = {
  sourceSnapshotPath: string;
  sourceSnapshotSha256: string;
  categorySlug: string;
};

const transliteration: Record<
  string,
  string
> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function buildVkTitleComparisonKey(
  value: string,
) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(
      /[^a-z0-9а-я]+/gi,
      " ",
    )
    .trim()
    .replace(/\s+/g, " ");
}

function slugifyTitle(
  value: string,
) {
  const transliterated =
    Array.from(
      value
        .normalize("NFKC")
        .toLocaleLowerCase("ru"),
    )
      .map(
        (character) =>
          transliteration[
            character
          ] ?? character,
      )
      .join("");

  return transliterated
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    )
    .replace(
      /-+/g,
      "-",
    );
}

function extractLinkTitle(
  name: string | null,
) {
  if (!name) {
    return "";
  }

  const slashIndex =
    name.indexOf("/");

  return (
    slashIndex >= 0
      ? name.slice(
          0,
          slashIndex,
        )
      : name
  ).trim();
}

function parseAlbumDescription(
  description: string | null,
) {
  const lines =
    (description ?? "")
      .split(/\r?\n/)
      .map(
        (line) =>
          line.trim(),
      )
      .filter(Boolean);

  let translationStatusRaw:
    string | null = null;

  let ageRating:
    number | null = null;

  const remainder: string[] = [];

  for (const line of lines) {
    const translationMatch =
      line.match(
        /^Статус перевода:\s*(.+)$/i,
      );

    if (translationMatch) {
      translationStatusRaw =
        translationMatch[1]
          .trim();

      continue;
    }

    const ageMatch =
      line.match(
        /^Возрастной рейтинг:\s*\+?(\d+)\s*$/i,
      );

    if (ageMatch) {
      ageRating =
        Number.parseInt(
          ageMatch[1],
          10,
        );

      continue;
    }

    remainder.push(line);
  }

  let translationStatusClass:
    TranslationStatusClass | null =
      null;

  if (translationStatusRaw) {
    const normalized =
      translationStatusRaw
        .toLocaleLowerCase("ru")
        .replaceAll("ё", "е");

    if (
      normalized.startsWith(
        "завершен",
      ) ||
      normalized.startsWith(
        "закончен",
      )
    ) {
      translationStatusClass =
        "completed";
    } else if (
      normalized.startsWith(
        "продолжается",
      )
    ) {
      translationStatusClass =
        "ongoing";
    } else if (
      normalized.startsWith(
        "заморожен",
      )
    ) {
      translationStatusClass =
        "frozen";
    } else {
      translationStatusClass =
        "unknown";
    }
  }

  return {
    translationStatusRaw,
    translationStatusClass,
    ageRating,

    descriptionRemainder:
      remainder.length > 0
        ? remainder.join("\n")
        : null,
  };
}

function field<T>(
  value: T | null,
  state: CandidateFieldState,
  evidence: CandidateEvidence[],
): CandidateField<T> {
  return {
    value,
    state,
    evidence,
  };
}

function wallEvidence(
  signal:
    VkRawSnapshotV1[
      "wallEvidence"
    ]["titleSignals"][number],
  relationship:
    CandidateWallTitleEvidence[
      "relationship"
    ],
): CandidateWallTitleEvidence {
  return {
    comparisonKey:
      buildVkTitleComparisonKey(
        signal.displayTitle,
      ),

    normalizedTitle:
      signal.normalizedTitle,

    displayTitle:
      signal.displayTitle,

    observedTitles:
      [...signal.observedTitles],

    mentions:
      signal.mentions,

    albumIds:
      [...signal.albumIds],

    singletonAlbumIds:
      [...signal.singletonAlbumIds],

    samplePostUrls:
      [...signal.samplePostUrls],

    relationship,

    identityConfirmed:
      false,
  };
}

function communityLinkEvidence(
  link:
    VkRawSnapshotV1[
      "communityLinks"
    ][number],
): CandidateCommunityLinkEvidence {
  const title =
    extractLinkTitle(
      link.name,
    );

  return {
    name:
      link.name,

    url:
      link.url,

    comparisonKey:
      buildVkTitleComparisonKey(
        title,
      ),

    relationship:
      "comparison-key-match",

    identityConfirmed:
      false,
  };
}

function historicalEvidence(
  item:
    VkRawSnapshotV1[
      "historicalAlbumReferences"
    ][number],
): CandidateHistoricalEvidence {
  return {
    albumId:
      item.albumId,

    sourceUrl:
      item.sourceUrl,

    mentions:
      item.mentions,

    firstSeenUnix:
      item.firstSeenUnix,

    lastSeenUnix:
      item.lastSeenUnix,

    samplePostUrls:
      [...item.samplePostUrls],

    observedTitles:
      item.observedTitles.map(
        (title) => ({
          comparisonKey:
            buildVkTitleComparisonKey(
              title.displayTitle,
            ),

          displayTitle:
            title.displayTitle,
        }),
      ),

    currentAlbumPresent:
      false,

    identityConfirmed:
      false,
  };
}

export function buildVkCandidateSet(
  snapshot: VkRawSnapshotV1,
  options: BuildOptions,
): VkCandidateSetV1 {
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.snapshotKind !==
      "vk-catalog-source"
  ) {
    throw new Error(
      "Unsupported VK snapshot contract",
    );
  }

  const currentAlbums =
    snapshot.albums.filter(
      (album) =>
        album.kind === "regular" &&
        album.id > 0,
    );

  const comparisonKeys =
    new Set(
      currentAlbums.map(
        (album) =>
          buildVkTitleComparisonKey(
            album.displayTitle,
          ),
      ),
    );

  const baseSlugs =
    currentAlbums.map(
      (album) => {
        const generated =
          slugifyTitle(
            album.displayTitle,
          );

        return {
          albumId:
            album.id,

          value:
            generated === ""
              ? `vk-album-${album.id}`
              : generated,
        };
      },
    );

  const slugCounts =
    new Map<
      string,
      number
    >();

  for (const item of baseSlugs) {
    slugCounts.set(
      item.value,
      (
        slugCounts.get(
          item.value,
        ) ?? 0
      ) + 1,
    );
  }

  const slugByAlbumId =
    new Map<
      number,
      {
        value: string;
        collided: boolean;
      }
    >();

  for (const item of baseSlugs) {
    const collided =
      (
        slugCounts.get(
          item.value,
        ) ?? 0
      ) > 1;

    slugByAlbumId.set(
      item.albumId,
      {
        value:
          collided
            ? `${item.value}-vk-${item.albumId}`
            : item.value,

        collided,
      },
    );
  }

  const candidates =
    currentAlbums.map(
      (album):
        VkCatalogCandidateV1 => {
        if (!album.sourceUrl) {
          throw new Error(
            `Regular album ${album.id} has no source URL`,
          );
        }

        const comparisonKey =
          buildVkTitleComparisonKey(
            album.displayTitle,
          );

        const metadata =
          parseAlbumDescription(
            album.description,
          );

        const directSignals =
          snapshot.wallEvidence
            .titleSignals
            .filter(
              (signal) =>
                buildVkTitleComparisonKey(
                  signal.displayTitle,
                ) === comparisonKey,
            )
            .map(
              (signal) =>
                wallEvidence(
                  signal,
                  "comparison-key-match",
                ),
            );

        const albumIdSignals =
          snapshot.wallEvidence
            .titleSignals
            .filter(
              (signal) =>
                signal.albumIds.includes(
                  album.id,
                ),
            )
            .map(
              (signal) =>
                wallEvidence(
                  signal,
                  "album-id-cooccurrence",
                ),
            );

        const conflictingAlbumIdSignals =
          albumIdSignals.filter(
            (signal) =>
              signal.comparisonKey !==
              comparisonKey,
          );

        const originalSourceLinks =
          snapshot.communityLinks
            .filter(
              (link) =>
                buildVkTitleComparisonKey(
                  extractLinkTitle(
                    link.name,
                  ),
                ) === comparisonKey,
            )
            .map(
              communityLinkEvidence,
            );

        const historicalReferences =
          snapshot
            .historicalAlbumReferences
            .filter(
              (item) =>
                item.observedTitles.some(
                  (title) =>
                    buildVkTitleComparisonKey(
                      title.displayTitle,
                    ) === comparisonKey,
                ),
            )
            .map(
              historicalEvidence,
            );

        const slug =
          slugByAlbumId.get(
            album.id,
          );

        if (!slug) {
          throw new Error(
            `Missing generated slug for album ${album.id}`,
          );
        }

        const warnings =
          new Set<string>();

        if (
          album.rawTitle !==
          album.displayTitle
        ) {
          warnings.add(
            "raw-title-differs-from-display",
          );
        }

        if (
          directSignals.length === 0
        ) {
          warnings.add(
            "wall-title-match-missing",
          );
        }

        if (
          conflictingAlbumIdSignals.length > 0
        ) {
          warnings.add(
            "album-id-title-conflict",
          );
        }

        if (
          metadata.translationStatusRaw
        ) {
          warnings.add(
            "translation-status-is-not-publication-status",
          );
        }

        if (
          album.coverEvidenceUrl
        ) {
          warnings.add(
            "ephemeral-cover-evidence",
          );
        }

        if (
          historicalReferences.length > 0
        ) {
          warnings.add(
            "historical-album-reference-unconfirmed",
          );
        }

        if (slug.collided) {
          warnings.add(
            "slug-collision-disambiguated",
          );
        }

        if (
          metadata.descriptionRemainder ===
          null
        ) {
          warnings.add(
            "canonical-description-missing",
          );
        } else {
          warnings.add(
            "canonical-description-needs-review",
          );
        }

        warnings.add(
          "author-metadata-missing",
        );

        warnings.add(
          "translator-metadata-missing",
        );

        warnings.add(
          "chapter-count-missing",
        );

        warnings.add(
          "publication-status-needs-review",
        );

        const rawDescriptionEvidence:
          CandidateEvidence = {
          kind:
            "vk-album-description",

          source:
            `vk-album:${album.id}:description`,

          value:
            album.description,

          note:
            "VK album description is source evidence and may contain structured translation metadata.",
        };

        return {
          candidateId:
            `vk-album-${album.id}`,

          sourceIdentity: {
            provider:
              "vk",

            communityId:
              snapshot.source
                .community.id,

            albumId:
              album.id,

            currentAlbumPresent:
              true,
          },

          canonicalDraft: {
            categorySlug:
              field(
                options.categorySlug,
                "configured",
                [
                  {
                    kind:
                      "pipeline-config",

                    source:
                      "R5.3 category target",

                    value:
                      options.categorySlug,

                    note:
                      "Configured Comic Diary category; not inferred from VK.",
                  },
                ],
              ),

            slug:
              field(
                slug.value,
                "derived",
                [
                  {
                    kind:
                      "normalizer-rule",

                    source:
                      `vk-album:${album.id}:displayTitle`,

                    value:
                      album.displayTitle,

                    note:
                      "Deterministic transliteration candidate. Slug is not frozen until human review.",
                  },
                ],
              ),

            title:
              field(
                album.displayTitle,
                "source",
                [
                  {
                    kind:
                      "vk-album-field",

                    source:
                      `vk-album:${album.id}:rawTitle`,

                    value:
                      album.rawTitle,

                    note:
                      "Exact VK title preserved separately from the display-normalized title.",
                  },

                  {
                    kind:
                      "vk-album-field",

                    source:
                      `vk-album:${album.id}:displayTitle`,

                    value:
                      album.displayTitle,

                    note:
                      "Primary title proposal. Wall evidence may expose spelling, grammar, or identity conflicts.",
                  },
                ],
              ),

            description:
              field(
                metadata
                  .descriptionRemainder,

                metadata
                  .descriptionRemainder
                  ? "review-required"
                  : "missing",

                [
                  rawDescriptionEvidence,
                ],
              ),

            authorName:
              field<string>(
                null,
                "missing",
                [
                  {
                    kind:
                      "normalizer-rule",

                    source:
                      "snapshot",

                    value:
                      null,

                    note:
                      "No reliable author attribution exists in the snapshot.",
                  },
                ],
              ),

            translatorName:
              field<string>(
                null,
                "missing",
                [
                  {
                    kind:
                      "normalizer-rule",

                    source:
                      "snapshot",

                    value:
                      null,

                    note:
                      "Community ownership is not sufficient evidence to invent translator attribution.",
                  },
                ],
              ),

            translatorNote:
              field<string>(
                null,
                "missing",
                [
                  {
                    kind:
                      "normalizer-rule",

                    source:
                      "snapshot",

                    value:
                      null,

                    note:
                      "No canonical translator note was derived.",
                  },
                ],
              ),

            sourceUrl:
              field(
                album.sourceUrl,
                "source",
                [
                  {
                    kind:
                      "vk-album-field",

                    source:
                      `vk-album:${album.id}:sourceUrl`,

                    value:
                      album.sourceUrl,

                    note:
                      "Current VK album is the reading-source proposal.",
                  },
                ],
              ),

            totalChapters:
              field<number>(
                null,
                "missing",
                [
                  {
                    kind:
                      "vk-album-field",

                    source:
                      `vk-album:${album.id}:photoCount`,

                    value:
                      album.photoCount,

                    note:
                      "VK photo/page count is evidence only and must not be interpreted as totalChapters.",
                  },
                ],
              ),

            coverUrl:
              field<string>(
                null,
                album.coverEvidenceUrl
                  ? "review-required"
                  : "missing",
                [
                  {
                    kind:
                      "vk-album-field",

                    source:
                      `vk-album:${album.id}:coverEvidenceUrl`,

                    value:
                      album.coverEvidenceUrl,

                    note:
                      "Signed VK CDN URL may expire and is not a canonical cover URL.",
                  },
                ],
              ),

            publicationStatus:
              field<
                ComicPublicationStatus
              >(
                null,
                "review-required",
                [
                  {
                    kind:
                      "vk-album-description",

                    source:
                      `vk-album:${album.id}:translationStatus`,

                    value:
                      metadata
                        .translationStatusRaw,

                    note:
                      "Translation workflow status is not the Comic Diary publication lifecycle status.",
                  },
                ],
              ),
          },

          sourceMetadata: {
            rawTitle:
              album.rawTitle,

            displayTitle:
              album.displayTitle,

            rawDescription:
              album.description,

            descriptionRemainder:
              metadata
                .descriptionRemainder,

            translationStatusRaw:
              metadata
                .translationStatusRaw,

            translationStatusClass:
              metadata
                .translationStatusClass,

            ageRating:
              metadata.ageRating,

            photoCount:
              album.photoCount,

            coverEvidenceUrl:
              album.coverEvidenceUrl,

            createdUnix:
              album.createdUnix,

            updatedUnix:
              album.updatedUnix,
          },

          evidence: {
            directWallTitleSignals:
              directSignals,

            albumIdCooccurrences:
              albumIdSignals,

            originalSourceLinks,

            historicalAlbumReferences:
              historicalReferences,
          },

          warnings:
            [...warnings].sort(),

          review: {
            required:
              true,

            importReady:
              false,

            blockingFields: [
              "publicationStatus",
            ],
          },
        };
      },
    );

  const unresolvedWallTitleSignals =
    snapshot.wallEvidence
      .titleSignals
      .filter(
        (signal) =>
          !comparisonKeys.has(
            buildVkTitleComparisonKey(
              signal.displayTitle,
            ),
          ),
      )
      .map(
        (
          signal,
        ): UnresolvedWallTitleEvidence => ({
          comparisonKey:
            buildVkTitleComparisonKey(
              signal.displayTitle,
            ),

          normalizedTitle:
            signal.normalizedTitle,

          displayTitle:
            signal.displayTitle,

          observedTitles:
            [...signal.observedTitles],

          mentions:
            signal.mentions,

          albumIds:
            [...signal.albumIds],

          singletonAlbumIds:
            [...signal.singletonAlbumIds],

          samplePostUrls:
            [...signal.samplePostUrls],
        }),
      );

  const unresolvedCommunityLinks =
    snapshot.communityLinks
      .filter(
        (link) =>
          !comparisonKeys.has(
            buildVkTitleComparisonKey(
              extractLinkTitle(
                link.name,
              ),
            ),
          ),
      )
      .map(
        communityLinkEvidence,
      );

  const unresolvedHistoricalReferences =
    snapshot
      .historicalAlbumReferences
      .filter(
        (item) =>
          !item.observedTitles.some(
            (title) =>
              comparisonKeys.has(
                buildVkTitleComparisonKey(
                  title.displayTitle,
                ),
              ),
          ),
      )
      .map(
        historicalEvidence,
      );

  return {
    schemaVersion:
      VK_CANDIDATE_SET_SCHEMA_VERSION,

    normalizerVersion:
      VK_CANDIDATE_NORMALIZER_VERSION,

    candidateKind:
      "vk-catalog-candidates",

    source: {
      snapshotKind:
        snapshot.snapshotKind,

      snapshotSchemaVersion:
        snapshot.schemaVersion,

      snapshotPath:
        options.sourceSnapshotPath,

      snapshotSha256:
        options.sourceSnapshotSha256,

      communityId:
        snapshot.source.community.id,

      communityScreenName:
        snapshot.source.community
          .screenName,

      snapshotGeneratedAt:
        snapshot.generatedAt,
    },

    policy: {
      currentAlbumsCreateCandidates:
        true,

      wallSignalsCreateCandidates:
        false,

      historicalReferencesCreateCandidates:
        false,

      translationStatusMapsToPublicationStatus:
        false,

      photoCountMapsToTotalChapters:
        false,

      signedCoverEvidenceMapsToCanonicalCover:
        false,

      automaticAliasIdentity:
        false,
    },

    summary: {
      currentAlbumCandidates:
        candidates.length,

      withStructuredTranslationMetadata:
        candidates.filter(
          (candidate) =>
            candidate.sourceMetadata
              .translationStatusRaw !==
              null ||
            candidate.sourceMetadata
              .ageRating !== null,
        ).length,

      withDirectWallTitleEvidence:
        candidates.filter(
          (candidate) =>
            candidate.evidence
              .directWallTitleSignals
              .length > 0,
        ).length,

      withOriginalSourceLinkEvidence:
        candidates.filter(
          (candidate) =>
            candidate.evidence
              .originalSourceLinks
              .length > 0,
        ).length,

      withHistoricalReferenceEvidence:
        candidates.filter(
          (candidate) =>
            candidate.evidence
              .historicalAlbumReferences
              .length > 0,
        ).length,

      withAlbumIdTitleConflictEvidence:
        candidates.filter(
          (candidate) => {
            const candidateKey =
              buildVkTitleComparisonKey(
                candidate
                  .sourceMetadata
                  .displayTitle,
              );

            return candidate.evidence
              .albumIdCooccurrences
              .some(
                (signal) =>
                  signal.comparisonKey !==
                  candidateKey,
              );
          },
        ).length,

      unresolvedWallTitleSignals:
        unresolvedWallTitleSignals
          .length,

      unresolvedCommunityLinks:
        unresolvedCommunityLinks
          .length,

      unresolvedHistoricalAlbumReferences:
        unresolvedHistoricalReferences
          .length,

      importReadyCandidates:
        candidates.filter(
          (candidate) =>
            candidate.review
              .importReady,
        ).length,
    },

    candidates,

    unresolvedEvidence: {
      wallTitleSignals:
        unresolvedWallTitleSignals,

      communityLinks:
        unresolvedCommunityLinks,

      historicalAlbumReferences:
        unresolvedHistoricalReferences,
    },
  };
}
