import {
  readFile,
} from "node:fs/promises";

import {
  NextResponse,
} from "next/server";

import {
  coverContentType,
  coverFilePath,
  isCoverFilename,
} from "@/modules/media/cover-storage";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    filename: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const {
    filename,
  } =
    await context.params;

  if (
    !isCoverFilename(
      filename,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,

        error: {
          kind:
            "media-not-found",
        },
      },
      {
        status: 404,
      },
    );
  }

  const contentType =
    coverContentType(
      filename,
    );

  if (!contentType) {
    return new NextResponse(
      null,
      {
        status: 404,
      },
    );
  }

  let bytes:
    Buffer;

  try {
    bytes =
      await readFile(
        coverFilePath(
          filename,
        ),
      );
  } catch (
    error: unknown
  ) {
    const code =
      (
        error as
          NodeJS.ErrnoException
      ).code;

    if (
      code === "ENOENT"
    ) {
      return new NextResponse(
        null,
        {
          status: 404,
        },
      );
    }

    console.error(
      error,
    );

    return new NextResponse(
      null,
      {
        status: 500,
      },
    );
  }

  const body =
    new Uint8Array(
      bytes,
    );

  return new NextResponse(
    body,
    {
      status: 200,

      headers: {
        "content-type":
          contentType,

        "content-length":
          String(
            bytes.byteLength,
          ),

        "cache-control":
          "public, max-age=31536000, immutable",

        "x-content-type-options":
          "nosniff",
      },
    },
  );
}
