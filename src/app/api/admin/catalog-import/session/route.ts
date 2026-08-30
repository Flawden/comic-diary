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
  gate: string,
) {
  const params =
    new URLSearchParams();

  params.set(
    "gate",
    gate,
  );

  return new NextResponse(
    null,
    {
      status: 303,

      headers: {
        Location:
          `/admin/catalog-import/vk?${params.toString()}`,
      },
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
      "invalid",
    );
  }

  const response =
    redirectToWorkspace(
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