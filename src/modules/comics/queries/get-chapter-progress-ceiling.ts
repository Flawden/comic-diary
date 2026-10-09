import { getComicChapters } from "./get-comic-chapters";

/** Available progress is defined only by released MAIN registry records. */
export async function getChapterProgressCeiling(comicId: number): Promise<number> {
  const registry = await getComicChapters(comicId, { includeUnreleased: true });
  return registry.filter((chapter) => chapter.status === "RELEASED" && chapter.kind === "MAIN").length;
}
