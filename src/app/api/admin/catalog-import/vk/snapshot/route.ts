import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeAdminCatalogImportRequest,
} from "@/modules/admin-import/admin-import-authorization";

import {
  parseVkCommunityUrl,
  VkDiscoveryError,
} from "@/modules/admin-import/vk/vk-api";

import {
  buildVkReconciliationReport,
} from "@/modules/admin-import/vk/vk-reconciliation";

import {
  buildVkRawSnapshot,
} from "@/modules/admin-import/vk/vk-snapshot";

const SNAPSHOT_FILENAME =
  "comic-diary-vk-raw-snapshot-v1.json";

function errorResponse(
  kind: string,
  vkCode: number | null,
  status = 502,
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        kind,
        vkCode,
      },
    },
    {
      status,
      headers: {
        "cache-control":
          "no-store",

        "x-content-type-options":
          "nosniff",
      },
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
    return errorResponse(
      authorization.kind,
      null,
      authorization.status,
    );
  }

  const formData =
    await request.formData();

  const rawCommunityUrl =
    formData.get(
      "communityUrl",
    );

  const rawServiceToken =
    formData.get(
      "serviceToken",
    );

  if (
    typeof rawCommunityUrl !==
    "string"
  ) {
    return errorResponse(
      "invalid-community",
      null,
      400,
    );
  }

  const community =
    parseVkCommunityUrl(
      rawCommunityUrl.trim(),
    );

  if (!community) {
    return errorResponse(
      "invalid-community",
      null,
      400,
    );
  }

  if (
    typeof rawServiceToken !==
    "string"
  ) {
    return errorResponse(
      "invalid-token",
      null,
      400,
    );
  }

  const serviceToken =
    rawServiceToken.trim();

  if (
    serviceToken.length < 20 ||
    /\s/.test(serviceToken)
  ) {
    return errorResponse(
      "invalid-token",
      null,
      400,
    );
  }

  try {
    const report =
      await buildVkReconciliationReport(
        community,
        serviceToken,
      );

    const snapshot =
      buildVkRawSnapshot(
        report,
      );

    return NextResponse.json(
      snapshot,
      {
        headers: {
          "cache-control":
            "no-store",

          "content-disposition":
            `attachment; filename="${SNAPSHOT_FILENAME}"`,

          "x-content-type-options":
            "nosniff",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      VkDiscoveryError
    ) {
      return errorResponse(
        error.kind,
        error.vkCode,
      );
    }

    return errorResponse(
      "invalid-response",
      null,
    );
  }
}