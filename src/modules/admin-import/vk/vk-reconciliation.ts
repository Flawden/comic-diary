import {
  callVkApi,
  discoverVkCommunity,
  type ParsedVkCommunityUrl,
  type VkCommunityDiscovery,
  VkDiscoveryError,
} from "./vk-api";

const WALL_PAGE_SIZE = 100;
const WALL_SCAN_LIMIT = 10_000;
const REQUEST_SPACING_MS = 450;
const ALBUM_PAGE_SIZE = 100;

type JsonRecord =
  Record<string, unknown>;

type AlbumCandidate = {
  id: number;

  /*
   * Exact title returned by VK.
   * This field must never be normalized or
   * cosmetically rewritten.
   */
  rawTitle: string;

  /*
   * Display helper used by reconciliation.
   */
  title: string;
  normalizedTitle: string;
  description: string | null;
  size: number | null;
  coverUrl: string | null;
  created: number | null;
  updated: number | null;
};

type CommunityLinkSignal = {
  id: number | null;
  name: string | null;
  titleHint: string | null;
  normalizedTitleHint: string | null;
  description: string | null;
  url: string | null;
};

type WallTitleAccumulator = {
  normalizedTitle: string;
  rawTitles: Set<string>;
  mentions: number;
  firstSeen: number | null;
  lastSeen: number | null;
  hashtags: Set<string>;

  /*
   * albumIds contains any album co-occurrence
   * observed in a post.
   *
   * strongAlbumIds is intentionally stricter:
   * exactly one normalized title and exactly
   * one album ID were present in that post.
   */
  albumIds: Set<number>;
  strongAlbumIds: Set<number>;

  samplePostIds: number[];
};

type AlbumIdAccumulator = {
  albumId: number;
  mentions: number;
  firstSeen: number | null;
  lastSeen: number | null;
  samplePostIds: number[];
};

type WallTitleSignal = {
  normalizedTitle: string;
  displayTitle: string;
  rawTitles: string[];
  mentions: number;
  firstSeen: number | null;
  lastSeen: number | null;
  hashtags: string[];

  albumIds: number[];
  strongAlbumIds: number[];

  samplePostIds: number[];
};

type AlbumIdSignal = {
  albumId: number;
  mentions: number;
  firstSeen: number | null;
  lastSeen: number | null;
  samplePostIds: number[];
};

type ReconciledCandidateStatus =
  | "album-wall-link"
  | "album-wall"
  | "album-link"
  | "album-only"
  | "wall-link"
  | "wall-only"
  | "link-only";

type ReconciledCandidate = {
  normalizedTitle: string;
  displayTitle: string;
  status: ReconciledCandidateStatus;

  albumIds: number[];
  albumTitles: string[];

  wallMentions: number;
  wallFirstSeen: number | null;
  wallLastSeen: number | null;
  wallRawTitles: string[];
  wallHashtags: string[];

  /*
   * Any album IDs co-occurring with this title.
   */
  wallLinkedAlbumIds: number[];

  /*
   * Singleton-title + singleton-album evidence.
   */
  wallStrongAlbumIds: number[];

  originalLinks: Array<{
    name: string | null;
    url: string | null;
  }>;
};

type IdBackedHint = {
  evidenceKind:
    "singleton-title-singleton-album-cooccurrence";

  /*
   * Discovery evidence does not prove entity
   * identity. Candidate normalization decides
   * whether this is an alias, variant,
   * sub-story, historical relationship,
   * or unrelated co-occurrence.
   */
  identityConfirmed: false;

  wallTitle: string;
  wallNormalizedTitle: string;

  albumId: number;
  albumTitle: string;
  albumNormalizedTitle: string;

  wallMentions: number;
};

export type VkReconciliationReport = {
  schemaVersion: 5;
  generatedAt: string;
  apiVersion: string;

  community: VkCommunityDiscovery;

  limits: {
    wallPageSize: number;
    wallScanLimit: number;
    requestSpacingMs: number;
  };

  albums: {
    reportedCount: number | null;
    returnedCount: number;
    regularCount: number;
    items: AlbumCandidate[];
  };

  communityLinks: {
    count: number;
    items: CommunityLinkSignal[];
  };

  wallScan: {
    /*
     * Informational value returned by VK.
     * It is not treated as a completeness proof.
     */
    reportedCount: number | null;

    returnedRawItems: number;
    duplicateRawPosts: number;

    scannedRawPosts: number;
    scannedOwnerPosts: number;

    pagesRequested: number;

    reachedTerminalEmptyPage: boolean;
    terminalOffset: number | null;

    complete: boolean;
    truncatedBySafetyLimit: boolean;

    titleSignals: WallTitleSignal[];
    albumIdSignals: AlbumIdSignal[];
  };

  reconciliation: {
    candidateCount: number;
    candidates: ReconciledCandidate[];
    idBackedHints: IdBackedHint[];
    unresolvedWallTitles: WallTitleSignal[];
  };
};

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readString(
  value: unknown,
) {
  return typeof value === "string"
    ? value
    : null;
}

function readInteger(
  value: unknown,
) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  )
    ? value
    : null;
}

function readCollection(
  response: unknown,
) {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items)
  ) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  return {
    reportedCount:
      readInteger(response.count),
    items:
      response.items,
  };
}

async function pauseRequest() {
  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        REQUEST_SPACING_MS,
      );
    },
  );
}

function normalizeTitle(
  input: string,
) {
  return input
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»„“”"]/g, "")
    .replace(/^[\s.,:;!?'"`()\[\]{}—–-]+/gu, "")
    .replace(/[\s.,:;!?'"`()\[\]{}—–-]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanDisplayTitle(
  input: string,
) {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/^[\s«»„“”"'.,]+/gu, "")
    .replace(/[\s«»„“”"'.,]+$/gu, "")
    .replace(/\s+/gu, " ");
}

function titleHintFromLinkName(
  name: string | null,
) {
  if (!name) {
    return null;
  }

  const firstPart =
    name.split("/")[0]?.trim();

  return firstPart || null;
}

function extractComicTitles(
  text: string,
) {
  const titles =
    new Set<string>();

  const pattern =
    /комикс(?:а|у|е|ом)?\s*[«„“"]([^»”“"]{2,120})[»”“"]/giu;

  for (
    const match of text.matchAll(pattern)
  ) {
    const raw =
      match[1];

    if (!raw) {
      continue;
    }

    const cleaned =
      cleanDisplayTitle(raw);

    if (cleaned.length >= 2) {
      titles.add(cleaned);
    }
  }

  return Array.from(titles);
}

function extractHashtags(
  text: string,
) {
  const hashtags =
    new Set<string>();

  const pattern =
    /#([A-Za-zА-Яа-яЁё0-9_]{2,100})/gu;

  for (
    const match of text.matchAll(pattern)
  ) {
    const value =
      match[1];

    if (value) {
      hashtags.add(value);
    }
  }

  return Array.from(hashtags);
}

function hashtagKey(
  hashtag: string,
) {
  return normalizeTitle(
    hashtag.replace(/_/g, " "),
  );
}

function hashtagsForTitle(
  hashtags: string[],
  normalizedTitle: string,
) {
  return hashtags.filter(
    (hashtag) => {
      const key =
        hashtagKey(hashtag);

      return (
        key === normalizedTitle ||
        key ===
          `${normalizedTitle} комикс`
      );
    },
  );
}

function extractAlbumIdsFromText(
  text: string,
  communityId: number,
) {
  const ids =
    new Set<number>();

  const pattern =
    new RegExp(
      `album-${communityId}_(\\d+)`,
      "giu",
    );

  for (
    const match of text.matchAll(pattern)
  ) {
    const raw =
      match[1];

    if (!raw) {
      continue;
    }

    const id =
      Number(raw);

    if (
      Number.isSafeInteger(id) &&
      id > 0
    ) {
      ids.add(id);
    }
  }

  return ids;
}

function extractAlbumIdsFromAttachments(
  post: JsonRecord,
) {
  const ids =
    new Set<number>();

  if (!Array.isArray(post.attachments)) {
    return ids;
  }

  for (
    const rawAttachment of
    post.attachments
  ) {
    if (!isRecord(rawAttachment)) {
      continue;
    }

    const type =
      readString(
        rawAttachment.type,
      );

    if (
      type === "photo" &&
      isRecord(rawAttachment.photo)
    ) {
      const albumId =
        readInteger(
          rawAttachment.photo.album_id,
        );

      if (
        albumId !== null &&
        albumId > 0
      ) {
        ids.add(albumId);
      }
    }

    if (
      type === "album" &&
      isRecord(rawAttachment.album)
    ) {
      const albumId =
        readInteger(
          rawAttachment.album.id,
        );

      if (
        albumId !== null &&
        albumId > 0
      ) {
        ids.add(albumId);
      }
    }
  }

  return ids;
}

function addSamplePostId(
  items: number[],
  postId: number,
) {
  if (
    items.includes(postId) ||
    items.length >= 5
  ) {
    return;
  }

  items.push(postId);
}

function updateDates(
  currentFirst: number | null,
  currentLast: number | null,
  date: number | null,
) {
  if (date === null) {
    return {
      first:
        currentFirst,
      last:
        currentLast,
    };
  }

  return {
    first:
      currentFirst === null
        ? date
        : Math.min(
            currentFirst,
            date,
          ),

    last:
      currentLast === null
        ? date
        : Math.max(
            currentLast,
            date,
          ),
  };
}

async function loadAlbums(
  community: VkCommunityDiscovery,
  accessToken: string,
) {
  const rawAlbums:
    JsonRecord[] = [];

  let reportedCount:
    number | null = null;

  let offset = 0;

  while (true) {
    await pauseRequest();

    const response =
      await callVkApi(
        "photos.getAlbums",
        {
          owner_id:
            String(-community.id),
          offset:
            String(offset),
          count:
            String(ALBUM_PAGE_SIZE),
          need_system:
            "1",
          need_covers:
            "1",
        },
        accessToken,
      );

    const collection =
      readCollection(response);

    if (reportedCount === null) {
      reportedCount =
        collection.reportedCount;
    }

    const page =
      collection.items.filter(
        isRecord,
      );

    rawAlbums.push(...page);

    if (
      page.length === 0 ||
      page.length <
        ALBUM_PAGE_SIZE ||
      (
        reportedCount !== null &&
        rawAlbums.length >=
          reportedCount
      )
    ) {
      break;
    }

    offset +=
      ALBUM_PAGE_SIZE;
  }

  const items =
    rawAlbums
      .map((album) => {
        const id =
          readInteger(album.id);

        if (id === null) {
          return null;
        }

        const rawTitle =
          readString(
            album.title,
          ) ?? "";

        const title =
          cleanDisplayTitle(
            rawTitle,
          );

        return {
          id,
          rawTitle,
          title,
          normalizedTitle:
            normalizeTitle(title),
          description:
            readString(
              album.description,
            ),
          size:
            readInteger(
              album.size,
            ),
          coverUrl:
            readString(
              album.thumb_src,
            ),
          created:
            readInteger(
              album.created,
            ),
          updated:
            readInteger(
              album.updated,
            ),
        };
      })
      .filter(
        (
          album,
        ): album is AlbumCandidate =>
          album !== null,
      );

  return {
    reportedCount,
    returnedCount:
      items.length,
    regularCount:
      items.filter(
        (album) =>
          album.id > 0,
      ).length,
    items,
  };
}

async function loadCommunityLinks(
  community: VkCommunityDiscovery,
  accessToken: string,
) {
  await pauseRequest();

  const response =
    await callVkApi(
      "groups.getById",
      {
        group_id:
          String(community.id),
        fields:
          "links",
      },
      accessToken,
    );

  const groups =
    Array.isArray(response)
      ? response
      : (
          isRecord(response) &&
          Array.isArray(
            response.groups,
          )
        )
        ? response.groups
        : null;

  if (
    !groups ||
    groups.length === 0 ||
    !isRecord(groups[0])
  ) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  const rawLinks =
    Array.isArray(
      groups[0].links,
    )
      ? groups[0].links
      : [];

  return rawLinks
    .filter(isRecord)
    .map(
      (
        link,
      ): CommunityLinkSignal => {
        const name =
          readString(link.name);

        const titleHint =
          titleHintFromLinkName(
            name,
          );

        return {
          id:
            readInteger(link.id),
          name,
          titleHint,
          normalizedTitleHint:
            titleHint
              ? normalizeTitle(
                  titleHint,
                )
              : null,
          description:
            readString(link.desc),
          url:
            readString(link.url),
        };
      },
    );
}

async function scanWall(
  community: VkCommunityDiscovery,
  accessToken: string,
) {
  const titleMap =
    new Map<
      string,
      WallTitleAccumulator
    >();

  const albumIdMap =
    new Map<
      number,
      AlbumIdAccumulator
    >();

  const seenRawPostIds =
    new Set<number>();

  const seenOwnerPostIds =
    new Set<number>();

  let reportedCount:
    number | null = null;

  let offset = 0;
  let pagesRequested = 0;

  let returnedRawItems = 0;

  let reachedTerminalEmptyPage =
    false;

  let terminalOffset:
    number | null = null;

  while (
    offset < WALL_SCAN_LIMIT
  ) {
    await pauseRequest();

    const response =
      await callVkApi(
        "wall.get",
        {
          owner_id:
            String(-community.id),
          offset:
            String(offset),
          count:
            String(WALL_PAGE_SIZE),
          /*
           * Scan the complete wall address
           * space. VK's response count can
           * describe more posts than an
           * owner-filtered page exposes.
           *
           * Owner-authored posts are selected
           * locally below using from_id.
           */
          filter:
            "all",
        },
        accessToken,
      );

    pagesRequested++;

    const collection =
      readCollection(response);

    if (reportedCount === null) {
      reportedCount =
        collection.reportedCount;
    }

    const page =
      collection.items.filter(
        isRecord,
      );

    returnedRawItems +=
      page.length;

    /*
     * A genuinely empty page is the terminal
     * proof for this bounded offset scan.
     */
    if (page.length === 0) {
      reachedTerminalEmptyPage =
        true;

      terminalOffset =
        offset;

      break;
    }

    for (const post of page) {
      const postId =
        readInteger(post.id);

      if (
        postId === null ||
        seenRawPostIds.has(postId)
      ) {
        continue;
      }

      seenRawPostIds.add(postId);

      const fromId =
        readInteger(
          post.from_id,
        );

      /*
       * wall.get(filter=all) is used only to
       * make pagination deterministic.
       * Candidate extraction remains restricted
       * to posts authored by the community.
       */
      if (
        fromId !==
        -community.id
      ) {
        continue;
      }

      seenOwnerPostIds.add(
        postId,
      );

      const date =
        readInteger(post.date);

      /*
       * The raw wall text is deliberately
       * request-local only. It is parsed below
       * and is never stored in the report.
       */
      const postText =
        readString(post.text) ?? "";

      const titles =
        extractComicTitles(
          postText,
        );

      const hashtags =
        extractHashtags(
          postText,
        );

      const albumIds =
        extractAlbumIdsFromText(
          postText,
          community.id,
        );

      for (
        const attachmentAlbumId of
        extractAlbumIdsFromAttachments(
          post,
        )
      ) {
        albumIds.add(
          attachmentAlbumId,
        );
      }

      /*
       * Do not create a title/album cross-product
       * when one post mentions several entities.
       */
      const normalizedTitleKeys =
        new Set(
          titles
            .map(
              (title) =>
                normalizeTitle(
                  title,
                ),
            )
            .filter(Boolean),
        );

      const strongAlbumId =
        (
          normalizedTitleKeys.size === 1 &&
          albumIds.size === 1
        )
          ? (
              Array.from(
                albumIds,
              )[0] ?? null
            )
          : null;

      for (const albumId of albumIds) {
        let signal =
          albumIdMap.get(
            albumId,
          );

        if (!signal) {
          signal = {
            albumId,
            mentions: 0,
            firstSeen: null,
            lastSeen: null,
            samplePostIds: [],
          };

          albumIdMap.set(
            albumId,
            signal,
          );
        }

        signal.mentions++;

        const dates =
          updateDates(
            signal.firstSeen,
            signal.lastSeen,
            date,
          );

        signal.firstSeen =
          dates.first;

        signal.lastSeen =
          dates.last;

        addSamplePostId(
          signal.samplePostIds,
          postId,
        );
      }

      for (const rawTitle of titles) {
        const normalizedTitle =
          normalizeTitle(
            rawTitle,
          );

        if (!normalizedTitle) {
          continue;
        }

        let signal =
          titleMap.get(
            normalizedTitle,
          );

        if (!signal) {
          signal = {
            normalizedTitle,
            rawTitles:
              new Set<string>(),
            mentions: 0,
            firstSeen: null,
            lastSeen: null,
            hashtags:
              new Set<string>(),
            albumIds:
              new Set<number>(),
            strongAlbumIds:
              new Set<number>(),
            samplePostIds: [],
          };

          titleMap.set(
            normalizedTitle,
            signal,
          );
        }

        signal.rawTitles.add(
          rawTitle,
        );

        signal.mentions++;

        const dates =
          updateDates(
            signal.firstSeen,
            signal.lastSeen,
            date,
          );

        signal.firstSeen =
          dates.first;

        signal.lastSeen =
          dates.last;

        for (
          const hashtag of
          hashtagsForTitle(
            hashtags,
            normalizedTitle,
          )
        ) {
          signal.hashtags.add(
            hashtag,
          );
        }

        for (const albumId of albumIds) {
          signal.albumIds.add(
            albumId,
          );
        }

        if (
          strongAlbumId !== null &&
          normalizedTitleKeys.has(
            normalizedTitle,
          )
        ) {
          signal.strongAlbumIds.add(
            strongAlbumId,
          );
        }

        addSamplePostId(
          signal.samplePostIds,
          postId,
        );
      }
    }

    /*
     * Sparse pages are allowed. Keep advancing
     * until an empty page or the safety cap.
     */
    offset +=
      WALL_PAGE_SIZE;
  }

  const titleSignals:
    WallTitleSignal[] =
    Array.from(
      titleMap.values(),
    )
      .map((signal) => {
        const rawTitles =
          Array.from(
            signal.rawTitles,
          ).sort(
            (left, right) =>
              left.localeCompare(
                right,
                "ru",
              ),
          );

        return {
          normalizedTitle:
            signal.normalizedTitle,
          displayTitle:
            rawTitles[0] ??
            signal.normalizedTitle,
          rawTitles,
          mentions:
            signal.mentions,
          firstSeen:
            signal.firstSeen,
          lastSeen:
            signal.lastSeen,
          hashtags:
            Array.from(
              signal.hashtags,
            ).sort(),
          albumIds:
            Array.from(
              signal.albumIds,
            ).sort(
              (left, right) =>
                left - right,
            ),

          strongAlbumIds:
            Array.from(
              signal.strongAlbumIds,
            ).sort(
              (left, right) =>
                left - right,
            ),

          samplePostIds:
            [...signal.samplePostIds],
        };
      })
      .sort(
        (left, right) =>
          right.mentions -
            left.mentions ||
          left.displayTitle.localeCompare(
            right.displayTitle,
            "ru",
          ),
      );

  const albumIdSignals:
    AlbumIdSignal[] =
    Array.from(
      albumIdMap.values(),
    )
      .map((signal) => ({
        albumId:
          signal.albumId,
        mentions:
          signal.mentions,
        firstSeen:
          signal.firstSeen,
        lastSeen:
          signal.lastSeen,
        samplePostIds:
          [...signal.samplePostIds],
      }))
      .sort(
        (left, right) =>
          right.mentions -
            left.mentions ||
          left.albumId -
            right.albumId,
      );

  const duplicateRawPosts =
    Math.max(
      0,
      returnedRawItems -
        seenRawPostIds.size,
    );

  const truncatedBySafetyLimit =
    (
      !reachedTerminalEmptyPage &&
      offset >=
        WALL_SCAN_LIMIT
    );

  return {
    reportedCount,

    returnedRawItems,
    duplicateRawPosts,

    scannedRawPosts:
      seenRawPostIds.size,

    scannedOwnerPosts:
      seenOwnerPostIds.size,

    pagesRequested,

    reachedTerminalEmptyPage,
    terminalOffset,

    complete:
      (
        reachedTerminalEmptyPage &&
        !truncatedBySafetyLimit
      ),

    truncatedBySafetyLimit,
    titleSignals,
    albumIdSignals,
  };
}

function statusForSources(
  hasAlbum: boolean,
  hasWall: boolean,
  hasLink: boolean,
): ReconciledCandidateStatus {
  if (
    hasAlbum &&
    hasWall &&
    hasLink
  ) {
    return "album-wall-link";
  }

  if (
    hasAlbum &&
    hasWall
  ) {
    return "album-wall";
  }

  if (
    hasAlbum &&
    hasLink
  ) {
    return "album-link";
  }

  if (hasAlbum) {
    return "album-only";
  }

  if (
    hasWall &&
    hasLink
  ) {
    return "wall-link";
  }

  if (hasWall) {
    return "wall-only";
  }

  return "link-only";
}

function buildReconciliation(
  albums: AlbumCandidate[],
  links: CommunityLinkSignal[],
  wallTitles: WallTitleSignal[],
) {
  const regularAlbums =
    albums.filter(
      (album) =>
        album.id > 0 &&
        album.normalizedTitle,
    );

  const albumsByKey =
    new Map<
      string,
      AlbumCandidate[]
    >();

  const albumsById =
    new Map<
      number,
      AlbumCandidate
    >();

  for (const album of regularAlbums) {
    albumsById.set(
      album.id,
      album,
    );

    const list =
      albumsByKey.get(
        album.normalizedTitle,
      ) ?? [];

    list.push(album);

    albumsByKey.set(
      album.normalizedTitle,
      list,
    );
  }

  const wallByKey =
    new Map(
      wallTitles.map(
        (signal) => [
          signal.normalizedTitle,
          signal,
        ] as const,
      ),
    );

  const linksByKey =
    new Map<
      string,
      CommunityLinkSignal[]
    >();

  for (const link of links) {
    if (!link.normalizedTitleHint) {
      continue;
    }

    const list =
      linksByKey.get(
        link.normalizedTitleHint,
      ) ?? [];

    list.push(link);

    linksByKey.set(
      link.normalizedTitleHint,
      list,
    );
  }

  const allKeys =
    new Set<string>([
      ...albumsByKey.keys(),
      ...wallByKey.keys(),
      ...linksByKey.keys(),
    ]);

  const candidates:
    ReconciledCandidate[] =
    Array.from(allKeys)
      .map((key) => {
        const albumItems =
          albumsByKey.get(key) ??
          [];

        const wall =
          wallByKey.get(key) ??
          null;

        const linkItems =
          linksByKey.get(key) ??
          [];

        const displayTitle =
          albumItems[0]?.title ??
          wall?.displayTitle ??
          linkItems[0]?.titleHint ??
          key;

        return {
          normalizedTitle:
            key,
          displayTitle,
          status:
            statusForSources(
              albumItems.length > 0,
              wall !== null,
              linkItems.length > 0,
            ),

          albumIds:
            albumItems.map(
              (album) =>
                album.id,
            ),

          albumTitles:
            albumItems.map(
              (album) =>
                album.title,
            ),

          wallMentions:
            wall?.mentions ?? 0,

          wallFirstSeen:
            wall?.firstSeen ?? null,

          wallLastSeen:
            wall?.lastSeen ?? null,

          wallRawTitles:
            wall?.rawTitles ?? [],

          wallHashtags:
            wall?.hashtags ?? [],

          wallLinkedAlbumIds:
            wall?.albumIds ?? [],

          wallStrongAlbumIds:
            wall?.strongAlbumIds ?? [],

          originalLinks:
            linkItems.map(
              (link) => ({
                name:
                  link.name,
                url:
                  link.url,
              }),
            ),
        };
      })
      .sort(
        (left, right) =>
          left.displayTitle.localeCompare(
            right.displayTitle,
            "ru",
          ),
      );

  const idBackedHints:
    IdBackedHint[] = [];

  for (const wall of wallTitles) {
    for (
      const albumId of
      wall.strongAlbumIds
    ) {
      const album =
        albumsById.get(
          albumId,
        );

      if (
        !album ||
        album.normalizedTitle ===
          wall.normalizedTitle
      ) {
        continue;
      }

      idBackedHints.push({
        evidenceKind:
          "singleton-title-singleton-album-cooccurrence",

        identityConfirmed:
          false,

        wallTitle:
          wall.displayTitle,
        wallNormalizedTitle:
          wall.normalizedTitle,
        albumId:
          album.id,
        albumTitle:
          album.title,
        albumNormalizedTitle:
          album.normalizedTitle,
        wallMentions:
          wall.mentions,
      });
    }
  }

  idBackedHints.sort(
    (left, right) =>
      right.wallMentions -
        left.wallMentions ||
      left.wallTitle.localeCompare(
        right.wallTitle,
        "ru",
      ),
  );

  /*
   * A wall title is resolved here only by an
   * exact normalized album title.
   *
   * Album-ID co-occurrence remains evidence,
   * not an identity decision. Alias/variant
   * decisions belong to R5.3.4.
   */
  const unresolvedWallTitles =
    wallTitles.filter(
      (wall) =>
        !albumsByKey.has(
          wall.normalizedTitle,
        ),
    );

  return {
    candidateCount:
      candidates.length,
    candidates,
    idBackedHints,
    unresolvedWallTitles,
  };
}

export async function buildVkReconciliationReport(
  parsedUrl: ParsedVkCommunityUrl,
  accessToken: string,
): Promise<VkReconciliationReport> {
  const community =
    await discoverVkCommunity(
      parsedUrl,
      accessToken,
    );

  const albums =
    await loadAlbums(
      community,
      accessToken,
    );

  const communityLinks =
    await loadCommunityLinks(
      community,
      accessToken,
    );

  const wallScan =
    await scanWall(
      community,
      accessToken,
    );

  return {
    schemaVersion: 5,

    generatedAt:
      new Date().toISOString(),

    apiVersion:
      community.apiVersion,

    community,

    limits: {
      wallPageSize:
        WALL_PAGE_SIZE,
      wallScanLimit:
        WALL_SCAN_LIMIT,
      requestSpacingMs:
        REQUEST_SPACING_MS,
    },

    albums,

    communityLinks: {
      count:
        communityLinks.length,
      items:
        communityLinks,
    },

    wallScan,

    reconciliation:
      buildReconciliation(
        albums.items,
        communityLinks,
        wallScan.titleSignals,
      ),
  };
}