import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  ADMIN_IMPORT_SESSION_COOKIE,
  getAdminImportAvailability,
  verifyAdminImportSession,
} from "@/modules/admin-import/admin-import-gate";

function redirectToWorkspace(
  request: NextRequest,
  values: Record<string, string>,
) {
  const url = new URL(
    "/admin/catalog-import/vk",
    request.url,
  );

  for (
    const [key, value] of
    Object.entries(values)
  ) {
    url.searchParams.set(
      key,
      value,
    );
  }

  return NextResponse.redirect(
    url,
    {
      status: 303,
    },
  );
}

function normalizeCommunityUrl(
  value: string,
) {
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

  const segments =
    url.pathname
      .split("/")
      .filter(Boolean);

  if (segments.length !== 1) {
    return null;
  }

  const screenName = segments[0];

  if (
    !/^[a-zA-Z0-9_.-]{2,64}$/.test(
      screenName,
    )
  ) {
    return null;
  }

  return `https://vk.ru/${screenName}`;
}

export async function POST(
  request: NextRequest,
) {
  if (
    getAdminImportAvailability() !==
    "ready"
  ) {
    return redirectToWorkspace(
      request,
      {
        gate: "unavailable",
      },
    );
  }

  const session =
    request.cookies.get(
      ADMIN_IMPORT_SESSION_COOKIE,
    )?.value;

  if (
    !verifyAdminImportSession(session)
  ) {
    return redirectToWorkspace(
      request,
      {
        gate: "expired",
      },
    );
  }

  const formData =
    await request.formData();

  const rawCommunityUrl =
    formData.get("communityUrl");

  const rawServiceToken =
    formData.get("serviceToken");

  if (
    typeof rawCommunityUrl !== "string"
  ) {
    return redirectToWorkspace(
      request,
      {
        probe:
          "invalid-community",
      },
    );
  }

  const communityUrl =
    normalizeCommunityUrl(
      rawCommunityUrl.trim(),
    );

  if (!communityUrl) {
    return redirectToWorkspace(
      request,
      {
        probe:
          "invalid-community",
      },
    );
  }

  if (
    typeof rawServiceToken !== "string"
  ) {
    return redirectToWorkspace(
      request,
      {
        probe:
          "invalid-token",
        community:
          communityUrl,
      },
    );
  }

  const serviceToken =
    rawServiceToken.trim();

  if (
    serviceToken.length < 20 ||
    /\s/.test(serviceToken)
  ) {
    return redirectToWorkspace(
      request,
      {
        probe:
          "invalid-token",
        community:
          communityUrl,
      },
    );
  }

  /*
   * R5.3.1 intentionally stops here.
   *
   * The service token exists only inside
   * this request scope and is neither
   * persisted nor returned to the client.
   *
   * R5.3.2 will introduce the actual
   * read-only VK API discovery call.
   */
  void serviceToken;

  return redirectToWorkspace(
    request,
    {
      probe: "accepted",
      community:
        communityUrl,
    },
  );
}