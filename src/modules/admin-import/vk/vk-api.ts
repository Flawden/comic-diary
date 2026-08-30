const VK_API_BASE_URL =
  "https://api.vk.com/method/";

export const VK_API_VERSION =
  "5.199";

const VK_API_TIMEOUT_MS =
  10_000;

const VK_PROBE_LIMITS = {
  albums: 100,
  sampledAlbums: 12,
  photosPerAlbum: 2,
  wallPosts: 50,
  requestSpacingMs: 450,
} as const;

type JsonRecord =
  Record<string, unknown>;

export type VkDiscoveryFailure =
  | "authorization"
  | "rate-limit"
  | "access-denied"
  | "not-found"
  | "not-community"
  | "network"
  | "invalid-response"
  | "api-error";

export class VkDiscoveryError extends Error {
  constructor(
    public readonly kind: VkDiscoveryFailure,
    public readonly vkCode: number | null = null,
  ) {
    super(kind);
    this.name = "VkDiscoveryError";
  }
}

export type ParsedVkCommunityUrl = {
  normalizedUrl: string;
  screenName: string;
};

export type VkCommunityDiscovery = {
  apiVersion: string;
  id: number;
  name: string;
  screenName: string;
  type: string;
  membersCount: number | null;
  normalizedUrl: string;
};

type ProbeError = {
  status: "error";
  failure: VkDiscoveryFailure;
  vkCode: number | null;
};

type ProbeSkipped = {
  status: "skipped";
  reason: string;
};

type VkCommunityLink = {
  id: number | null;
  name: string | null;
  description: string | null;
  url: string | null;
};

type VkAlbumProbe = {
  id: number;
  title: string;
  size: number | null;
  created: number | null;
  updated: number | null;
};

type VkPhotoProbe = {
  id: number;
  albumId: number;
  date: number | null;
  text: string;
};

type VkAlbumPhotoSample = {
  albumId: number;
  albumTitle: string;
  albumSize: number | null;
  status: "ok" | "error";
  failure: VkDiscoveryFailure | null;
  vkCode: number | null;
  photos: VkPhotoProbe[];
};

type VkWallPostProbe = {
  id: number;
  date: number | null;
  text: string;
  attachmentTypes: string[];
};

export type VkStructureProbe = {
  schemaVersion: 1;
  generatedAt: string;
  apiVersion: string;

  community: VkCommunityDiscovery;

  links:
    | {
        status: "ok";
        items: VkCommunityLink[];
      }
    | ProbeError;

  albums:
    | {
        status: "ok";
        reportedCount: number | null;
        returnedCount: number;
        items: VkAlbumProbe[];
      }
    | ProbeError;

  photoSamples:
    | {
        status: "ok";
        sampledAlbumCount: number;
        items: VkAlbumPhotoSample[];
      }
    | ProbeSkipped;

  wall:
    | {
        status: "ok";
        reportedCount: number | null;
        returnedCount: number;
        items: VkWallPostProbe[];
      }
    | ProbeError;

  limits: typeof VK_PROBE_LIMITS;
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

function clipText(
  value: unknown,
  limit = 500,
) {
  const text =
    readString(value) ?? "";

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}…`;
}

function mapVkError(
  code: number | null,
): VkDiscoveryFailure {
  switch (code) {
    case 5:
      return "authorization";

    case 6:
    case 29:
      return "rate-limit";

    case 7:
    case 15:
    case 200:
    case 203:
      return "access-denied";

    case 104:
      return "not-found";

    default:
      return "api-error";
  }
}

function toProbeError(
  error: unknown,
): ProbeError {
  if (
    error instanceof
    VkDiscoveryError
  ) {
    return {
      status: "error",
      failure: error.kind,
      vkCode: error.vkCode,
    };
  }

  return {
    status: "error",
    failure: "invalid-response",
    vkCode: null,
  };
}

async function pauseProbe() {
  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        VK_PROBE_LIMITS.requestSpacingMs,
      );
    },
  );
}

export async function callVkApi(
  method: string,
  parameters: Record<string, string>,
  accessToken: string,
) {
  const body =
    new URLSearchParams();

  body.set(
    "v",
    VK_API_VERSION,
  );

  body.set(
    "access_token",
    accessToken,
  );

  for (
    const [key, value] of
    Object.entries(parameters)
  ) {
    body.set(
      key,
      value,
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${VK_API_BASE_URL}${method}`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        cache: "no-store",
        signal:
          AbortSignal.timeout(
            VK_API_TIMEOUT_MS,
          ),
      },
    );
  } catch {
    throw new VkDiscoveryError(
      "network",
    );
  }

  if (!response.ok) {
    throw new VkDiscoveryError(
      "network",
    );
  }

  let payload: unknown;

  try {
    payload =
      await response.json();
  } catch {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  if (!isRecord(payload)) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  if ("error" in payload) {
    const rawError =
      payload.error;

    const code =
      isRecord(rawError)
        ? readInteger(
            rawError.error_code,
          )
        : null;

    /*
     * Raw VK error objects must never be
     * serialized or logged: request parameters
     * may include credentials.
     */
    throw new VkDiscoveryError(
      mapVkError(code),
      code,
    );
  }

  if (!("response" in payload)) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  return payload.response;
}

export function parseVkCommunityUrl(
  value: string,
): ParsedVkCommunityUrl | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname =
    url.hostname
      .toLowerCase()
      .replace(/^www\./, "");

  if (
    hostname !== "vk.ru" &&
    hostname !== "vk.com"
  ) {
    return null;
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    return null;
  }

  const segments =
    url.pathname
      .split("/")
      .filter(Boolean);

  if (segments.length !== 1) {
    return null;
  }

  const screenName =
    segments[0];

  if (
    !/^[a-zA-Z0-9_.-]{2,64}$/.test(
      screenName,
    )
  ) {
    return null;
  }

  return {
    normalizedUrl:
      `https://vk.ru/${screenName}`,
    screenName,
  };
}

function readGroups(
  response: unknown,
) {
  if (Array.isArray(response)) {
    return response;
  }

  if (
    isRecord(response) &&
    Array.isArray(response.groups)
  ) {
    return response.groups;
  }

  return null;
}

function readCollection(
  response: unknown,
) {
  if (!isRecord(response)) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  if (!Array.isArray(response.items)) {
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

export async function discoverVkCommunity(
  parsedUrl: ParsedVkCommunityUrl,
  accessToken: string,
): Promise<VkCommunityDiscovery> {
  const resolvedResponse =
    await callVkApi(
      "utils.resolveScreenName",
      {
        screen_name:
          parsedUrl.screenName,
      },
      accessToken,
    );

  if (!isRecord(resolvedResponse)) {
    throw new VkDiscoveryError(
      "not-found",
    );
  }

  const resolvedType =
    readString(
      resolvedResponse.type,
    );

  const resolvedGroupId =
    readInteger(
      resolvedResponse.group_id,
    ) ??
    readInteger(
      resolvedResponse.object_id,
    );

  if (
    resolvedGroupId === null ||
    resolvedGroupId <= 0
  ) {
    throw new VkDiscoveryError(
      "not-found",
    );
  }

  if (
    resolvedType !== "group" &&
    resolvedType !== "page" &&
    resolvedType !== "event"
  ) {
    throw new VkDiscoveryError(
      "not-community",
    );
  }

  const groupResponse =
    await callVkApi(
      "groups.getById",
      {
        group_id:
          String(resolvedGroupId),
        fields:
          "members_count",
      },
      accessToken,
    );

  const groups =
    readGroups(groupResponse);

  if (
    !groups ||
    groups.length === 0 ||
    !isRecord(groups[0])
  ) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  const group =
    groups[0];

  const id =
    readInteger(group.id) ??
    resolvedGroupId;

  const name =
    readString(group.name);

  if (!name) {
    throw new VkDiscoveryError(
      "invalid-response",
    );
  }

  const screenName =
    readString(
      group.screen_name,
    ) ??
    parsedUrl.screenName;

  const type =
    readString(group.type) ??
    resolvedType;

  const membersCount =
    readInteger(
      group.members_count,
    );

  return {
    apiVersion:
      VK_API_VERSION,
    id,
    name,
    screenName,
    type,
    membersCount,
    normalizedUrl:
      `https://vk.ru/${screenName}`,
  };
}

async function probeCommunityLinks(
  community: VkCommunityDiscovery,
  accessToken: string,
): Promise<VkStructureProbe["links"]> {
  try {
    await pauseProbe();

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
      readGroups(response);

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

    const items =
      rawLinks
        .filter(isRecord)
        .map((link) => ({
          id:
            readInteger(link.id),
          name:
            readString(link.name),
          description:
            readString(link.desc),
          url:
            readString(link.url),
        }));

    return {
      status: "ok",
      items,
    };
  } catch (error) {
    return toProbeError(error);
  }
}

async function probeAlbums(
  community: VkCommunityDiscovery,
  accessToken: string,
): Promise<VkStructureProbe["albums"]> {
  try {
    await pauseProbe();

    const response =
      await callVkApi(
        "photos.getAlbums",
        {
          owner_id:
            String(-community.id),
          count:
            String(
              VK_PROBE_LIMITS.albums,
            ),
          need_system:
            "1",
          need_covers:
            "1",
        },
        accessToken,
      );

    const collection =
      readCollection(response);

    const items =
      collection.items
        .filter(isRecord)
        .map((album) => {
          const id =
            readInteger(album.id);

          if (id === null) {
            return null;
          }

          return {
            id,
            title:
              readString(
                album.title,
              ) ?? "",
            size:
              readInteger(
                album.size,
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
          ): album is VkAlbumProbe =>
            album !== null,
        );

    return {
      status: "ok",
      reportedCount:
        collection.reportedCount,
      returnedCount:
        items.length,
      items,
    };
  } catch (error) {
    return toProbeError(error);
  }
}

async function probeAlbumPhotos(
  albums: VkStructureProbe["albums"],
  community: VkCommunityDiscovery,
  accessToken: string,
): Promise<VkStructureProbe["photoSamples"]> {
  if (albums.status !== "ok") {
    return {
      status: "skipped",
      reason:
        "albums-unavailable",
    };
  }

  const candidates =
    [...albums.items]
      .filter(
        (album) =>
          album.id > 0 &&
          (album.size ?? 0) > 0,
      )
      .sort(
        (left, right) =>
          (right.size ?? 0) -
            (left.size ?? 0) ||
          left.id - right.id,
      )
      .slice(
        0,
        VK_PROBE_LIMITS.sampledAlbums,
      );

  const items:
    VkAlbumPhotoSample[] = [];

  for (const album of candidates) {
    await pauseProbe();

    try {
      const response =
        await callVkApi(
          "photos.get",
          {
            owner_id:
              String(-community.id),
            album_id:
              String(album.id),
            count:
              String(
                VK_PROBE_LIMITS.photosPerAlbum,
              ),
            rev:
              "0",
          },
          accessToken,
        );

      const collection =
        readCollection(response);

      const photos =
        collection.items
          .filter(isRecord)
          .map((photo) => {
            const id =
              readInteger(photo.id);

            const albumId =
              readInteger(
                photo.album_id,
              );

            if (
              id === null ||
              albumId === null
            ) {
              return null;
            }

            return {
              id,
              albumId,
              date:
                readInteger(
                  photo.date,
                ),
              text:
                clipText(
                  photo.text,
                ),
            };
          })
          .filter(
            (
              photo,
            ): photo is VkPhotoProbe =>
              photo !== null,
          );

      items.push({
        albumId:
          album.id,
        albumTitle:
          album.title,
        albumSize:
          album.size,
        status:
          "ok",
        failure:
          null,
        vkCode:
          null,
        photos,
      });
    } catch (error) {
      const failure =
        toProbeError(error);

      items.push({
        albumId:
          album.id,
        albumTitle:
          album.title,
        albumSize:
          album.size,
        status:
          "error",
        failure:
          failure.failure,
        vkCode:
          failure.vkCode,
        photos:
          [],
      });
    }
  }

  return {
    status: "ok",
    sampledAlbumCount:
      candidates.length,
    items,
  };
}

function readAttachmentTypes(
  post: JsonRecord,
) {
  if (!Array.isArray(post.attachments)) {
    return [];
  }

  return Array.from(
    new Set(
      post.attachments
        .filter(isRecord)
        .map(
          (attachment) =>
            readString(
              attachment.type,
            ),
        )
        .filter(
          (
            type,
          ): type is string =>
            type !== null,
        ),
    ),
  ).sort();
}

async function probeWall(
  community: VkCommunityDiscovery,
  accessToken: string,
): Promise<VkStructureProbe["wall"]> {
  try {
    await pauseProbe();

    const response =
      await callVkApi(
        "wall.get",
        {
          owner_id:
            String(-community.id),
          count:
            String(
              VK_PROBE_LIMITS.wallPosts,
            ),
          filter:
            "owner",
        },
        accessToken,
      );

    const collection =
      readCollection(response);

    const items =
      collection.items
        .filter(isRecord)
        .map((post) => {
          const id =
            readInteger(post.id);

          if (id === null) {
            return null;
          }

          return {
            id,
            date:
              readInteger(
                post.date,
              ),
            text:
              clipText(
                post.text,
              ),
            attachmentTypes:
              readAttachmentTypes(
                post,
              ),
          };
        })
        .filter(
          (
            post,
          ): post is VkWallPostProbe =>
            post !== null,
        );

    return {
      status: "ok",
      reportedCount:
        collection.reportedCount,
      returnedCount:
        items.length,
      items,
    };
  } catch (error) {
    return toProbeError(error);
  }
}

export async function discoverVkStructure(
  parsedUrl: ParsedVkCommunityUrl,
  accessToken: string,
): Promise<VkStructureProbe> {
  const community =
    await discoverVkCommunity(
      parsedUrl,
      accessToken,
    );

  const links =
    await probeCommunityLinks(
      community,
      accessToken,
    );

  const albums =
    await probeAlbums(
      community,
      accessToken,
    );

  const photoSamples =
    await probeAlbumPhotos(
      albums,
      community,
      accessToken,
    );

  const wall =
    await probeWall(
      community,
      accessToken,
    );

  return {
    schemaVersion: 1,
    generatedAt:
      new Date().toISOString(),
    apiVersion:
      VK_API_VERSION,
    community,
    links,
    albums,
    photoSamples,
    wall,
    limits:
      VK_PROBE_LIMITS,
  };
}