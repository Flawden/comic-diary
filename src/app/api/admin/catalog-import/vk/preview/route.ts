import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeAdminCatalogImportRequest,
} from "@/modules/admin-import/admin-import-authorization";
import {
  discoverVkCommunity,
  parseVkCommunityUrl,
  VkDiscoveryError,
} from "@/modules/admin-import/vk/vk-api";

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

export async function POST(
  request: NextRequest,
) {
  const authorization =
    await authorizeAdminCatalogImportRequest(
      request,
    );

  if (!authorization.ok) {
    return NextResponse.json(
      {
        ok: false,

        error: {
          kind:
            authorization.kind,
        },
      },
      {
        status:
          authorization.status,

        headers: {
          "cache-control":
            "no-store",

          "x-content-type-options":
            "nosniff",
        },
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

  const parsedCommunity =
    parseVkCommunityUrl(
      rawCommunityUrl.trim(),
    );

  if (!parsedCommunity) {
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
          parsedCommunity.normalizedUrl,
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
          parsedCommunity.normalizedUrl,
      },
    );
  }

  try {
    const discovery =
      await discoverVkCommunity(
        parsedCommunity,
        serviceToken,
      );

    const values: Record<string, string> = {
      probe:
        "connected",
      community:
        discovery.normalizedUrl,
      groupId:
        String(discovery.id),
      groupName:
        discovery.name,
      groupScreenName:
        discovery.screenName,
      groupType:
        discovery.type,
      apiVersion:
        discovery.apiVersion,
    };

    if (
      discovery.membersCount !== null
    ) {
      values.membersCount =
        String(
          discovery.membersCount,
        );
    }

    return redirectToWorkspace(
      request,
      values,
    );
  } catch (error) {
    if (
      error instanceof
      VkDiscoveryError
    ) {
      const values: Record<string, string> = {
        probe:
          "vk-error",
        community:
          parsedCommunity.normalizedUrl,
        vkFailure:
          error.kind,
      };

      if (error.vkCode !== null) {
        values.vkCode =
          String(error.vkCode);
      }

      return redirectToWorkspace(
        request,
        values,
      );
    }

    return redirectToWorkspace(
      request,
      {
        probe:
          "vk-error",
        community:
          parsedCommunity.normalizedUrl,
        vkFailure:
          "invalid-response",
      },
    );
  }
}