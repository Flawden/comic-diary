import type {
  VkReconciliationReport,
} from "./vk-reconciliation";

export const VK_RAW_SNAPSHOT_SCHEMA_VERSION =
  1 as const;

export const VK_RAW_SNAPSHOT_KIND =
  "vk-catalog-source" as const;

type SnapshotAlbum = {
  id: number;

  kind:
    | "regular"
    | "system";

  rawTitle: string;
  displayTitle: string;

  description: string | null;

  /*
   * VK album.size is photo/page count.
   * It is not canonical totalChapters.
   */
  photoCount: number | null;

  /*
   * Signed VK CDN links may expire.
   * Keep them only as source evidence.
   */
  coverEvidenceUrl: string | null;

  createdUnix: number | null;
  updatedUnix: number | null;

  sourceUrl: string | null;
};

type SnapshotCommunityLink = {
  id: number | null;
  name: string | null;
  description: string | null;
  url: string | null;
};

type SnapshotWallTitleSignal = {
  normalizedTitle: string;
  displayTitle: string;

  /*
   * Extracted title observations only.
   * Raw post text is intentionally absent.
   */
  observedTitles: string[];

  mentions: number;

  firstSeenUnix: number | null;
  lastSeenUnix: number | null;

  hashtags: string[];

  albumIds: number[];

  /*
   * Higher-signal singleton co-occurrence.
   * Still not identity proof.
   */
  singletonAlbumIds: number[];

  samplePostIds: number[];
  samplePostUrls: string[];
};

type SnapshotAlbumIdSignal = {
  albumId: number;

  mentions: number;

  firstSeenUnix: number | null;
  lastSeenUnix: number | null;

  samplePostIds: number[];
  samplePostUrls: string[];
};

type HistoricalAlbumReference = {
  albumId: number;

  sourceUrl: string;

  currentAlbumPresent: false;
  identityConfirmed: false;

  mentions: number;

  firstSeenUnix: number | null;
  lastSeenUnix: number | null;

  samplePostIds: number[];
  samplePostUrls: string[];

  observedTitles: Array<{
    normalizedTitle: string;
    displayTitle: string;
  }>;
};

export type VkRawSnapshotV1 = {
  schemaVersion: 1;

  snapshotKind:
    "vk-catalog-source";

  generatedAt: string;

  source: {
    provider: "vk";

    apiVersion: string;

    reconciliationSchemaVersion:
      number;

    community: {
      id: number;
      name: string;
      screenName: string;
      type: string;
      membersCount: number | null;
      sourceUrl: string;
    };
  };

  policy: {
    credentialsIncluded: false;

    rawWallTextIncluded: false;

    derivedWallEvidenceIncluded: true;

    signedCoverUrlsAreEphemeralEvidence:
      true;

    sourceDisappearanceDoesNotImplyCanonicalDeletion:
      true;
  };

  capture: {
    albums: {
      reportedCount: number | null;
      returnedCount: number;
      regularCount: number;
    };

    wall: {
      reportedCount: number | null;

      returnedRawItems: number;
      duplicateRawPosts: number;

      scannedRawPosts: number;
      scannedOwnerPosts: number;

      pagesRequested: number;

      reachedTerminalEmptyPage:
        boolean;

      terminalOffset:
        number | null;

      complete:
        boolean;

      truncatedBySafetyLimit:
        boolean;
    };
  };

  albums:
    SnapshotAlbum[];

  communityLinks:
    SnapshotCommunityLink[];

  wallEvidence: {
    titleSignals:
      SnapshotWallTitleSignal[];

    albumIdSignals:
      SnapshotAlbumIdSignal[];
  };

  historicalAlbumReferences:
    HistoricalAlbumReference[];
};

function albumSourceUrl(
  communityId: number,
  albumId: number,
) {
  if (albumId <= 0) {
    return null;
  }

  return (
    `https://vk.ru/album-` +
    `${communityId}_${albumId}`
  );
}

function postSourceUrl(
  communityId: number,
  postId: number,
) {
  return (
    `https://vk.ru/wall-` +
    `${communityId}_${postId}`
  );
}

function postUrls(
  communityId: number,
  postIds: number[],
) {
  return postIds.map(
    (postId) =>
      postSourceUrl(
        communityId,
        postId,
      ),
  );
}

export function buildVkRawSnapshot(
  report: VkReconciliationReport,
): VkRawSnapshotV1 {
  const communityId =
    report.community.id;

  const currentRegularAlbumIds =
    new Set(
      report.albums.items
        .filter(
          (album) =>
            album.id > 0,
        )
        .map(
          (album) =>
            album.id,
        ),
    );

  const albums:
    SnapshotAlbum[] =
    report.albums.items.map(
      (album) => ({
        id:
          album.id,

        kind:
          album.id > 0
            ? "regular"
            : "system",

        rawTitle:
          album.rawTitle,

        displayTitle:
          album.title,

        description:
          album.description,

        photoCount:
          album.size,

        coverEvidenceUrl:
          album.coverUrl,

        createdUnix:
          album.created,

        updatedUnix:
          album.updated,

        sourceUrl:
          albumSourceUrl(
            communityId,
            album.id,
          ),
      }),
    );

  const communityLinks:
    SnapshotCommunityLink[] =
    report.communityLinks.items.map(
      (link) => ({
        id:
          link.id,

        name:
          link.name,

        description:
          link.description,

        url:
          link.url,
      }),
    );

  const titleSignals:
    SnapshotWallTitleSignal[] =
    report.wallScan.titleSignals.map(
      (signal) => ({
        normalizedTitle:
          signal.normalizedTitle,

        displayTitle:
          signal.displayTitle,

        observedTitles:
          [...signal.rawTitles],

        mentions:
          signal.mentions,

        firstSeenUnix:
          signal.firstSeen,

        lastSeenUnix:
          signal.lastSeen,

        hashtags:
          [...signal.hashtags],

        albumIds:
          [...signal.albumIds],

        singletonAlbumIds:
          [...signal.strongAlbumIds],

        samplePostIds:
          [...signal.samplePostIds],

        samplePostUrls:
          postUrls(
            communityId,
            signal.samplePostIds,
          ),
      }),
    );

  const albumIdSignals:
    SnapshotAlbumIdSignal[] =
    report.wallScan.albumIdSignals.map(
      (signal) => ({
        albumId:
          signal.albumId,

        mentions:
          signal.mentions,

        firstSeenUnix:
          signal.firstSeen,

        lastSeenUnix:
          signal.lastSeen,

        samplePostIds:
          [...signal.samplePostIds],

        samplePostUrls:
          postUrls(
            communityId,
            signal.samplePostIds,
          ),
      }),
    );

  const historicalAlbumReferences:
    HistoricalAlbumReference[] =
    report.wallScan.albumIdSignals
      .filter(
        (signal) =>
          signal.albumId > 0 &&
          !currentRegularAlbumIds.has(
            signal.albumId,
          ),
      )
      .map(
        (signal) => ({
          albumId:
            signal.albumId,

          sourceUrl:
            albumSourceUrl(
              communityId,
              signal.albumId,
            )!,

          currentAlbumPresent:
            false,

          /*
           * Historical source evidence does not
           * prove canonical identity.
           */
          identityConfirmed:
            false,

          mentions:
            signal.mentions,

          firstSeenUnix:
            signal.firstSeen,

          lastSeenUnix:
            signal.lastSeen,

          samplePostIds:
            [...signal.samplePostIds],

          samplePostUrls:
            postUrls(
              communityId,
              signal.samplePostIds,
            ),

          observedTitles:
            report.wallScan.titleSignals
              .filter(
                (titleSignal) =>
                  titleSignal.albumIds.includes(
                    signal.albumId,
                  ),
              )
              .map(
                (titleSignal) => ({
                  normalizedTitle:
                    titleSignal.normalizedTitle,

                  displayTitle:
                    titleSignal.displayTitle,
                }),
              ),
        }),
      );

  return {
    schemaVersion:
      VK_RAW_SNAPSHOT_SCHEMA_VERSION,

    snapshotKind:
      VK_RAW_SNAPSHOT_KIND,

    generatedAt:
      report.generatedAt,

    source: {
      provider:
        "vk",

      apiVersion:
        report.apiVersion,

      reconciliationSchemaVersion:
        report.schemaVersion,

      community: {
        id:
          report.community.id,

        name:
          report.community.name,

        screenName:
          report.community.screenName,

        type:
          report.community.type,

        membersCount:
          report.community.membersCount,

        sourceUrl:
          report.community.normalizedUrl,
      },
    },

    policy: {
      credentialsIncluded:
        false,

      rawWallTextIncluded:
        false,

      derivedWallEvidenceIncluded:
        true,

      signedCoverUrlsAreEphemeralEvidence:
        true,

      sourceDisappearanceDoesNotImplyCanonicalDeletion:
        true,
    },

    capture: {
      albums: {
        reportedCount:
          report.albums.reportedCount,

        returnedCount:
          report.albums.returnedCount,

        regularCount:
          report.albums.regularCount,
      },

      wall: {
        reportedCount:
          report.wallScan.reportedCount,

        returnedRawItems:
          report.wallScan.returnedRawItems,

        duplicateRawPosts:
          report.wallScan.duplicateRawPosts,

        scannedRawPosts:
          report.wallScan.scannedRawPosts,

        scannedOwnerPosts:
          report.wallScan.scannedOwnerPosts,

        pagesRequested:
          report.wallScan.pagesRequested,

        reachedTerminalEmptyPage:
          report.wallScan.reachedTerminalEmptyPage,

        terminalOffset:
          report.wallScan.terminalOffset,

        complete:
          report.wallScan.complete,

        truncatedBySafetyLimit:
          report.wallScan.truncatedBySafetyLimit,
      },
    },

    albums,
    communityLinks,

    wallEvidence: {
      titleSignals,
      albumIdSignals,
    },

    historicalAlbumReferences,
  };
}