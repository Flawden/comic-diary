import { updateChapterReading } from "@/modules/library/mutations/update-chapter-reading";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getCurrentUser } from "@/modules/auth/request-identity";
import { isSameOriginRequest } from "@/modules/auth/request-origin";

import {
  addComicToUserLibrary,
  changeUserComicProgress,
  removeComicFromUserLibrary,
  isReadingStatus,
  setUserComicStatus,
  setLegacyComicProgress,
  updateUserComicDiary,
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

export async function POST(
  request: NextRequest,
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const currentUser =
    await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      {
        error: "Authentication required",
      },
      {
        status: 401,
      },
    );
  }

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

    if (intent === "chapter-reading") {
      const action = formData.get("action");
      const chapterId = Number(formData.get("chapterId"));
      if (action !== "read" && action !== "unread" && action !== "read-through") {
        return NextResponse.json({ error: "Invalid chapter action" }, { status: 400 });
      }
      slug = await updateChapterReading(currentUser.id, comicId, chapterId, action);
    } else if (intent === "set-legacy-progress") {
      const count = formData.get("count");
      if (typeof count !== "string" || !/^\d+$/.test(count)) {
        return NextResponse.json({ error: "Invalid progress" }, { status: 400 });
      }
      slug = await setLegacyComicProgress(currentUser.id, comicId, Number(count));
    } else if (intent === "add-to-library") {
      slug =
        await addComicToUserLibrary(
          currentUser.id,
          comicId,
        );
    } else if (
      intent === "remove-from-library"
    ) {
      slug =
        await removeComicFromUserLibrary(
          currentUser.id,
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
        await setUserComicStatus(
          currentUser.id,
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
        await changeUserComicProgress(
          currentUser.id,
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
        await updateUserComicDiary(
          currentUser.id,
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
