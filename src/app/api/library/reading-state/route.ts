import { NextResponse } from "next/server";

import {
  addComicToDevUserLibrary,
  changeDevUserComicProgress,
  removeComicFromDevUserLibrary,
  isReadingStatus,
  setDevUserComicStatus,
  updateDevUserComicDiary,
} from "@/modules/library/mutations/update-user-comic-state";

const INVALID_RATING = Symbol(
  "INVALID_RATING",
);

function parseOptionalRating(
  value: FormDataEntryValue | null,
): number | null | typeof INVALID_RATING {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return INVALID_RATING;
  }

  const normalized = value.trim();

  if (normalized === "") {
    return null;
  }

  const rating = Number(normalized);

  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return INVALID_RATING;
  }

  return rating;
}

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
    } else if (
      intent === "remove-from-library"
    ) {
      slug =
        await removeComicFromDevUserLibrary(
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
    } else if (
      intent === "update-diary"
    ) {
      const ratingPlot =
        parseOptionalRating(
          formData.get("ratingPlot"),
        );

      const ratingCharacters =
        parseOptionalRating(
          formData.get(
            "ratingCharacters",
          ),
        );

      const ratingArt =
        parseOptionalRating(
          formData.get("ratingArt"),
        );

      const ratingDepth =
        parseOptionalRating(
          formData.get("ratingDepth"),
        );

      const ratingWorld =
        parseOptionalRating(
          formData.get("ratingWorld"),
        );

      if (
        ratingPlot === INVALID_RATING ||
        ratingCharacters === INVALID_RATING ||
        ratingArt === INVALID_RATING ||
        ratingDepth === INVALID_RATING ||
        ratingWorld === INVALID_RATING
      ) {
        return NextResponse.json(
          {
            error: "Invalid diary rating",
          },
          {
            status: 400,
          },
        );
      }

      const personalNoteValue =
        formData.get("personalNote");

      if (
        typeof personalNoteValue !==
        "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid personal note",
          },
          {
            status: 400,
          },
        );
      }

      const normalizedNote =
        personalNoteValue.trim();

      slug =
        await updateDevUserComicDiary(
          comicId,
          {
            ratingPlot,
            ratingCharacters,
            ratingArt,
            ratingDepth,
            ratingWorld,
            personalNote:
              normalizedNote === ""
                ? null
                : normalizedNote,
          },
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
