import {
  getComicChapters,
} from "./get-comic-chapters";

/**
 * The chapter registry becomes authoritative as soon as
 * a comic has chapter records.
 *
 * For legacy comics without any registered chapters yet,
 * totalChapters remains a temporary compatibility fallback.
 */
export async function getChapterProgressCeiling(
  comicId: number,
  legacyTotalChapters: number | null,
): Promise<number | null> {
  const registeredChapters =
    await getComicChapters(
      comicId,
      {
        includeUnreleased: true,
      },
    );

  if (
    registeredChapters.length === 0
  ) {
    return legacyTotalChapters;
  }

  return registeredChapters.filter(
    (chapter) =>
      chapter.status ===
      "RELEASED",
  ).length;
}
