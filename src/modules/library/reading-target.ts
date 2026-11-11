import type { ReadingChapter } from "./chapter-reading-model";

type SourceChapter = ReadingChapter & { sourceUrl: string | null };

export function readingSource(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const vk = ["vk.com", "vk.ru"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    const album = vk && (/^\/album-?\d+_\d+\/?$/.test(url.pathname) || /^album-?\d+_\d+$/.test(url.searchParams.get("z") ?? ""));
    return { href: url.href, label: album ? "Открыть альбом в VK" : vk ? "Открыть в VK" : "Открыть источник" };
  } catch { return null; }
}

// All chapter entry points use the same URL policy: an unlinked chapter may
// lead to the work's general source, but never to a later linked chapter.
export function getChapterReadingSource(chapterUrl: string | null, workUrl: string | null, status: string) {
  if (status !== "RELEASED") return { kind: "unavailable" as const, source: null };
  const direct = readingSource(chapterUrl);
  if (direct) return { kind: "direct" as const, source: direct };
  const general = readingSource(workUrl);
  if (general) return { kind: "general" as const, source: general };
  return { kind: "missing" as const, source: null };
}

// Reading order is editorial sortOrder, then id; display codes are never numbers.
// Old revision marks do not mark their replacements read. No writes occur here.
export function getReadingTarget(chapters: readonly SourceChapter[], readIds: readonly number[], sourceUrl: string | null) {
  const read = new Set(readIds);
  const available = chapters.filter(c => c.status === "RELEASED" && c.kind === "MAIN")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const chapter = available.find(c => !read.has(c.id)) ?? null;
  const direct = chapter ? readingSource(chapter.sourceUrl) : null;
  return {
    chapter,
    source: direct ?? readingSource(sourceUrl),
    direct: direct !== null,
    state: chapter ? "UNREAD" as const : available.length ? "CAUGHT_UP" as const : "NO_MAIN" as const,
  };
}
