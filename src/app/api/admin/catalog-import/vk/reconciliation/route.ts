import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  ADMIN_IMPORT_SESSION_COOKIE,
  getAdminImportAvailability,
  verifyAdminImportSession,
} from "@/modules/admin-import/admin-import-gate";

import {
  parseVkCommunityUrl,
  VkDiscoveryError,
} from "@/modules/admin-import/vk/vk-api";

import {
  buildVkReconciliationReport,
} from "@/modules/admin-import/vk/vk-reconciliation";

const REPORT_FILENAME =
  "comic-diary-vk-reconciliation-probe.json";

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
  if (
    getAdminImportAvailability() !==
    "ready"
  ) {
    return errorResponse(
      "admin-unavailable",
      null,
      503,
    );
  }

  const session =
    request.cookies.get(
      ADMIN_IMPORT_SESSION_COOKIE,
    )?.value;

  if (
    !verifyAdminImportSession(session)
  ) {
    return errorResponse(
      "admin-session-expired",
      null,
      401,
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

    return NextResponse.json(
      report,
      {
        headers: {
          "cache-control":
            "no-store",

          "content-disposition":
            `attachment; filename="${REPORT_FILENAME}"`,

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