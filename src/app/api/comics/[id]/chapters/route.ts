import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentUser,
} from "@/modules/auth/request-identity";

import {
  getComicById,
} from "@/modules/comics/queries/get-comic-by-id";

import {
  getComicChapters,
} from "@/modules/comics/queries/get-comic-chapters";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonResponse(
  value: unknown,
  status: number,
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

function parseComicId(
  rawId: string,
) {
  if (
    !/^[1-9]\d*$/.test(
      rawId,
    )
  ) {
    return null;
  }

  const id =
    Number(
      rawId,
    );

  if (
    !Number.isSafeInteger(
      id,
    )
  ) {
    return null;
  }

  return id;
}

export async function GET(
  _request: NextRequest,
  {
    params,
  }: RouteContext,
) {
  const {
    id: rawId,
  } = await params;

  const comicId =
    parseComicId(
      rawId,
    );

  if (comicId === null) {
    return errorResponse(
      "invalid-comic-id",
      400,
    );
  }

  try {
    const currentUser =
      await getCurrentUser();

    const comic =
      await getComicById(
        comicId,
        currentUser?.id ?? null,
      );

    /*
     * Missing and inaccessible comics deliberately share
     * the same response so PRIVATE existence is not leaked.
     */
    if (!comic) {
      return errorResponse(
        "comic-not-found",
        404,
      );
    }

    const canSeeUnreleasedChapters =
      comic.visibility === "PRIVATE" &&
      currentUser?.id ===
        comic.ownerUserId;

    const chapters =
      await getComicChapters(
        comic.id,
        {
          includeUnreleased:
            canSeeUnreleasedChapters,
        },
      );

    return jsonResponse(
      {
        ok: true,
        chapters,
      },
      200,
    );
  } catch (error) {
    console.error(
      "Chapter read API failed",
      error,
    );

    return errorResponse(
      "internal-error",
      500,
    );
  }
}
