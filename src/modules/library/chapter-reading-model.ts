export type ReadingChapter = {
  id: number;
  displayCode: string;
  title: string | null;
  kind: string;
  status: string;
  sortOrder: number;
  supersedesChapterId: number | null;
};

export function selectReadThrough(chapters: ReadingChapter[], targetId: number) {
  const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const target = ordered.find((c) => c.id === targetId);
  if (!target || target.status !== "RELEASED" || target.kind !== "MAIN") {
    throw new Error("Choose a released main chapter");
  }
  return ordered.slice(0, ordered.indexOf(target) + 1)
    .filter((c) => c.status === "RELEASED" && c.kind === "MAIN");
}

/** Earlier means registry order, across volumes, not just the visible page or chapter code. */
export function unreadEarlierMainChapters(chapters: ReadingChapter[], readIds: Iterable<number>, targetId: number) {
  const alreadyRead = new Set(readIds);
  const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const index = ordered.findIndex((chapter) => chapter.id === targetId);
  if (index < 0 || ordered[index].status !== "RELEASED" || ordered[index].kind !== "MAIN") return [];
  return ordered.slice(0, index).filter((chapter) =>
    chapter.status === "RELEASED" && chapter.kind === "MAIN" && !alreadyRead.has(chapter.id));
}

export function summarizeChapterReads(chapters: ReadingChapter[], reads: { chapterId: number; readAt: Date }[]) {
  const readIds = new Set(reads.map((r) => r.chapterId));
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const active = chapters.filter((c) => c.status === "RELEASED");
  const main = active.filter((c) => c.kind === "MAIN");
  const updated = active.filter((c) => {
    if (readIds.has(c.id)) return false;
    let previous = c.supersedesChapterId;
    const visited = new Set<number>();
    while (previous !== null && !visited.has(previous)) {
      if (readIds.has(previous)) return true;
      visited.add(previous);
      previous = byId.get(previous)?.supersedesChapterId ?? null;
    }
    return false;
  });
  const lastRead = [...reads].sort((a, b) => b.readAt.getTime() - a.readAt.getTime() || b.chapterId - a.chapterId)
    .map((r) => byId.get(r.chapterId)).find(Boolean);
  return {
    currentChapter: main.filter((c) => readIds.has(c.id)).length,
    progressCeiling: main.length,
    unreadChapters: main.filter((c) => !readIds.has(c.id)).length,
    updatedChapters: updated.length,
    specialReadCount: active.filter((c) => c.kind === "SPECIAL" && readIds.has(c.id)).length,
    specialCount: active.filter((c) => c.kind === "SPECIAL").length,
    caughtUp: main.length > 0 && main.every((c) => readIds.has(c.id)),
    lastReadLabel: lastRead ? `${lastRead.displayCode}${lastRead.title ? `${lastRead.displayCode ? " — " : ""}${lastRead.title}` : ""}${lastRead.status === "ARCHIVED" ? " (старая редакция / архив)" : ""}` : null,
  };
}
