import { NextResponse } from "next/server";

import {
  addComicToDevUserLibrary,
  changeDevUserComicProgress,
  isReadingStatus,
  setDevUserComicStatus,
} from "@/modules/library/mutations/update-user-comic-state";

export async function POST(request: Request) {
  const formData = await request.formData();

  const comicId = Number(
    formData.get("comicId"),
  );

  if (
    !Number.isInteger(comicId) ||
    comicId <= 0
  ) {
    return NextResponse.json(
      {
        error: "Invalid comicId",
      },
      {
        status: 400,
      },
    );
  }

  const intent = formData.get("intent");

  try {
    let slug: string;

    if (intent === "add-to-library") {
      slug =
        await addComicToDevUserLibrary(
          comicId,
        );
    } else if (intent === "set-status") {
      const status =
        formData.get("status");

      if (
        typeof status !== "string" ||
        !isReadingStatus(status)
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid reading status",
          },
          {
            status: 400,
          },
        );
      }

      slug =
        await setDevUserComicStatus(
          comicId,
          status,
        );
    } else if (
      intent === "change-progress"
    ) {
      const delta = Number(
        formData.get("delta"),
      );

      if (
        delta !== -1 &&
        delta !== 1
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid progress delta",
          },
          {
            status: 400,
          },
        );
      }

      slug =
        await changeDevUserComicProgress(
          comicId,
          delta,
        );
    } else {
      return NextResponse.json(
        {
          error: "Invalid intent",
        },
        {
          status: 400,
        },
      );
    }

    return new Response(
      null,
      {
        status: 303,
        headers: {
          Location:
            `/comics/${encodeURIComponent(slug)}`,
        },
      },
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Unable to update reading state",
      },
      {
        status: 400,
      },
    );
  }
}
