import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeAdminCatalogImportRequest,
} from "@/modules/admin-import/admin-import-authorization";
import {
  applyVkCanonicalImportPlan,
} from "@/modules/admin-import/vk/vk-canonical-apply";
import {
  buildVkDatabaseAwareImportPlan,
} from "@/modules/admin-import/vk/vk-canonical-db";
import {
  buildVkCanonicalImportPlan,
} from "@/modules/admin-import/vk/vk-canonical-import";
import {
  loadVkReviewWorkspace,
} from "@/modules/admin-import/vk/vk-review-source";

export const runtime =
  "nodejs";

const MAX_REQUEST_BYTES =
  1024 * 1024;

type ImportMode =
  | "dry-run"
  | "apply";

type ImportRequestBody = {
  mode: ImportMode;
  candidateSha256: string;
  reviewArtifact: unknown;
  confirmApply: boolean;
};

function jsonResponse(
  value: unknown,
  status = 200,
) {
  return NextResponse.json(
    value,
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

function errorResponse(
  kind: string,
  status: number,
) {
  return jsonResponse(
    {
      ok: false,

      error: {
        kind,
      },
    },
    status,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseBody(
  value: unknown,
): ImportRequestBody | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.mode !==
      "dry-run" &&
    value.mode !==
      "apply"
  ) {
    return null;
  }

  if (
    typeof value.candidateSha256 !==
      "string" ||
    !/^[0-9a-f]{64}$/.test(
      value.candidateSha256,
    )
  ) {
    return null;
  }

  return {
    mode:
      value.mode,

    candidateSha256:
      value.candidateSha256,

    reviewArtifact:
      value.reviewArtifact,

    confirmApply:
      value.confirmApply ===
      true,
  };
}

export async function POST(
  request: NextRequest,
) {
  /*
   * Authorization happens before reading
   * potentially large or malformed request data.
   */
  const authorization =
    await authorizeAdminCatalogImportRequest(
      request,
    );

  if (!authorization.ok) {
    return errorResponse(
      authorization.kind,
      authorization.status,
    );
  }

  const contentType =
    request.headers
      .get(
        "content-type",
      )
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

  if (
    contentType !==
    "application/json"
  ) {
    return errorResponse(
      "content-type-required",
      415,
    );
  }

  const declaredLength =
    request.headers.get(
      "content-length",
    );

  if (declaredLength) {
    const parsedLength =
      Number.parseInt(
        declaredLength,
        10,
      );

    if (
      Number.isFinite(
        parsedLength,
      ) &&
      parsedLength >
        MAX_REQUEST_BYTES
    ) {
      return errorResponse(
        "request-too-large",
        413,
      );
    }
  }

  let rawBody: string;

  try {
    rawBody =
      await request.text();
  } catch {
    return errorResponse(
      "request-read-failed",
      400,
    );
  }

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    MAX_REQUEST_BYTES
  ) {
    return errorResponse(
      "request-too-large",
      413,
    );
  }

  let parsed:
    unknown;

  try {
    parsed =
      JSON.parse(
        rawBody,
      );
  } catch {
    return errorResponse(
      "invalid-json",
      400,
    );
  }

  const body =
    parseBody(
      parsed,
    );

  if (!body) {
    return errorResponse(
      "invalid-import-request",
      400,
    );
  }

  const databaseUrl =
    process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return errorResponse(
      "database-unavailable",
      503,
    );
  }

  let workspace:
    Awaited<
      ReturnType<
        typeof loadVkReviewWorkspace
      >
    >;

  try {
    workspace =
      await loadVkReviewWorkspace();
  } catch {
    return errorResponse(
      "candidate-source-unavailable",
      503,
    );
  }

  if (
    body.candidateSha256 !==
    workspace.candidateSha256
  ) {
    return errorResponse(
      "candidate-sha-mismatch",
      400,
    );
  }

  let canonicalPlan:
    ReturnType<
      typeof buildVkCanonicalImportPlan
    >;

  try {
    canonicalPlan =
      buildVkCanonicalImportPlan(
        workspace.candidateSet,
        workspace.candidateSha256,
        body.reviewArtifact,
        workspace.categories,
        workspace.existingComics,
      );
  } catch {
    return errorResponse(
      "review-artifact-rejected",
      400,
    );
  }

  if (
    canonicalPlan.items.length ===
    0
  ) {
    return errorResponse(
      "nothing-to-import",
      422,
    );
  }

  if (
    body.mode ===
    "dry-run"
  ) {
    try {
      const result =
        await buildVkDatabaseAwareImportPlan(
          canonicalPlan,
          databaseUrl,
        );

      return jsonResponse(
        {
          ok: true,
          mode:
            "dry-run",
          result,
        },
      );
    } catch {
      return errorResponse(
        "dry-run-failed",
        500,
      );
    }
  }

  /*
   * Merely choosing mode=apply is not enough.
   * The client must opt into the destructive
   * boundary explicitly.
   *
   * The operation is non-destructive with
   * respect to deletion/user data, but it does
   * write canonical catalog metadata.
   */
  if (!body.confirmApply) {
    return errorResponse(
      "apply-confirmation-required",
      400,
    );
  }

  try {
    const result =
      await applyVkCanonicalImportPlan(
        canonicalPlan,
        workspace.categories,
        databaseUrl,
      );

    return jsonResponse(
      {
        ok: true,
        mode:
          "apply",
        result,
      },
    );
  } catch {
    return errorResponse(
      "apply-failed",
      500,
    );
  }
}
