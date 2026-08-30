import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  ADMIN_IMPORT_SESSION_COOKIE,
  ADMIN_IMPORT_SESSION_TTL_SECONDS,
  createAdminImportSession,
  getAdminImportAvailability,
  verifyAdminImportSecret,
} from "@/modules/admin-import/admin-import-gate";

function redirectToWorkspace(
  request: NextRequest,
  gate: string,
) {
  const url = new URL(
    "/admin/catalog-import/vk",
    request.url,
  );

  url.searchParams.set(
    "gate",
    gate,
  );

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
  const availability =
    getAdminImportAvailability();

  if (availability !== "ready") {
    return redirectToWorkspace(
      request,
      availability,
    );
  }

  const formData =
    await request.formData();

  const intent =
    formData.get("intent");

  if (intent === "logout") {
    const response =
      redirectToWorkspace(
        request,
        "locked",
      );

    response.cookies.delete(
      ADMIN_IMPORT_SESSION_COOKIE,
    );

    return response;
  }

  const candidate =
    formData.get("adminSecret");

  if (
    typeof candidate !== "string" ||
    !verifyAdminImportSecret(candidate)
  ) {
    return redirectToWorkspace(
      request,
      "invalid",
    );
  }

  const response =
    redirectToWorkspace(
      request,
      "unlocked",
    );

  response.cookies.set({
    name:
      ADMIN_IMPORT_SESSION_COOKIE,
    value:
      createAdminImportSession(),
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "strict",
    path: "/",
    maxAge:
      ADMIN_IMPORT_SESSION_TTL_SECONDS,
  });

  return response;
}