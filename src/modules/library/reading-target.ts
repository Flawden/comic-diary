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
