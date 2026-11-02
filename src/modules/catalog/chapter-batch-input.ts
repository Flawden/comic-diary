export const CHAPTER_BATCH_LIMIT = 100;
export type ChapterBatchRow = { displayCode: string; title: string | null; kind: "MAIN" | "SPECIAL"; sourceUrl: string | null };
export class ChapterBatchInputError extends Error {}

export function parseChapterBatch(text: string): ChapterBatchRow[] {
  if (text.length > 20000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new ChapterBatchInputError("Некорректный или слишком большой список.");
  const rows: ChapterBatchRow[] = [];
  const codes = new Set<string>();
  for (const [index, line] of text.replace(/\r\n/g, "\n").split("\n").entries()) {
    if (!line.trim()) continue;
    const cells = line.split("\t").map(value => value.trim());
    const [displayCode, title = "", kind = "MAIN", sourceUrl = ""] = cells;
    if (cells.length > 4 || (!displayCode && !title) || displayCode.length > 160 || title.length > 255 || sourceUrl.length > 2048 || (kind !== "MAIN" && kind !== "SPECIAL")) {
      throw new ChapterBatchInputError(`Строка ${index + 1}: проверьте код, название, тип и ссылку.`);
    }
    if (sourceUrl) {
      let parsed: URL;
      try { parsed = new URL(sourceUrl); } catch { throw new ChapterBatchInputError(`Строка ${index + 1}: некорректная ссылка.`); }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new ChapterBatchInputError(`Строка ${index + 1}: нужна HTTP/HTTPS-ссылка.`);
    }
    if (displayCode && codes.has(displayCode)) throw new ChapterBatchInputError(`Строка ${index + 1}: код главы повторяется.`);
    codes.add(displayCode);
    rows.push({ displayCode, title: title || null, kind, sourceUrl: sourceUrl || null });
    if (rows.length > CHAPTER_BATCH_LIMIT) throw new ChapterBatchInputError(`Не больше ${CHAPTER_BATCH_LIMIT} глав за один раз.`);
  }
  if (!rows.length) throw new ChapterBatchInputError("Добавьте хотя бы одну строку.");
  return rows;
}
