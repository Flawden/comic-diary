import type { UpdatesKind, UpdatesTitle } from "./get-reading-updates";

/** The title's counts cover all unread released chapters, not only the first API page. */
export function unreadChapterCount(
  title: Pick<UpdatesTitle, "mainCount" | "specialCount" | "updatedCount">,
  kind: UpdatesKind,
): number {
  if (kind === "MAIN") return title.mainCount;
  if (kind === "SPECIAL") return title.specialCount;
  if (kind === "UPDATED") return title.updatedCount;
  return title.mainCount + title.specialCount;
}

export function chapterCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const unit = lastTwo >= 11 && lastTwo <= 14 ? "глав" : last === 1 ? "глава" : last >= 2 && last <= 4 ? "главы" : "глав";
  return `${count} ${unit}`;
}
