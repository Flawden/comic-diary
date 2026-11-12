import { CHAPTER_BATCH_LIMIT, ChapterBatchInputError } from "./chapter-batch-input";
import { isValidExpectedRelease } from "./chapter-release-dates";

/** Fully validated data for a single atomic structured chapter batch. */
export type StructuredChapterRow = {
  displayCode: string;
  title: string | null;
  sourceUrl: string | null;
  kind: "MAIN" | "SPECIAL";
  status: "SCHEDULED" | "RELEASED";
  volumeNumber: number | null;
  sortOrder: number | null;
  releasedAt: string | null;
  expectedRelease: string | null;
  supersedesChapterId: number | null;
  revisionConfirmed: boolean;
};

const allowed = new Set<keyof StructuredChapterRow>([
  "displayCode", "title", "sourceUrl", "kind", "status", "volumeNumber",
  "sortOrder", "releasedAt", "expectedRelease", "supersedesChapterId", "revisionConfirmed",
]);
const nullable = (value: unknown, max: number): string | null => {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new ChapterBatchInputError("Некорректный текст главы.");
  return value.trim() || null;
};

export function parseStructuredChapterBatch(value: unknown): StructuredChapterRow[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > CHAPTER_BATCH_LIMIT) {
    throw new ChapterBatchInputError(`Добавьте от 1 до ${CHAPTER_BATCH_LIMIT} глав.`);
  }
  const codes = new Set<string>();
  const replaced = new Set<number>();
  return value.map((raw, index): StructuredChapterRow => {
    const line = index + 1;
    const bad = (why: string): never => { throw new ChapterBatchInputError(`Глава ${line}: ${why}`); };
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        Object.keys(raw).some(key => !allowed.has(key as keyof StructuredChapterRow))) bad("неизвестные поля.");
    const item = raw as Record<string, unknown>;
    if (typeof item.displayCode !== "string" || item.displayCode.length > 160 || /[\u0000-\u001f\u007f]/u.test(item.displayCode)) bad("неправильный код.");
    const displayCode = item.displayCode.trim();
    const title = nullable(item.title, 255);
    const sourceUrl = nullable(item.sourceUrl, 2048);
    if (!displayCode && !title) bad("нужно название или код.");
    if (displayCode) {
      if (codes.has(displayCode)) bad("код повторяется в пакете.");
      codes.add(displayCode);
    }
    if (item.kind !== "MAIN" && item.kind !== "SPECIAL") bad("неверный тип.");
    if (item.status !== "SCHEDULED" && item.status !== "RELEASED") bad("неверный статус.");
    if (sourceUrl) {
      let url: URL;
      try { url = new URL(sourceUrl); } catch { return bad("неверная ссылка."); }
      if (url.protocol !== "https:" && url.protocol !== "http:") bad("разрешены только HTTP/HTTPS-ссылки.");
    }
    const volume = item.volumeNumber;
    if (volume !== null && (!Number.isSafeInteger(volume) || Number(volume) < 1 || Number(volume) > 99)) bad("том должен быть от 1 до 99.");
    const order = item.sortOrder;
    if (order !== null && (!Number.isSafeInteger(order) || Number(order) < 0 || Number(order) > 2147483647)) bad("неверный порядок.");
    const supersedes = item.supersedesChapterId;
    if (supersedes !== null && (!Number.isSafeInteger(supersedes) || Number(supersedes) < 1)) bad("неверная редакция для замены.");
    if (typeof item.revisionConfirmed !== "boolean") bad("неверное подтверждение редакции.");
    if (supersedes !== null) {
      if (!item.revisionConfirmed || item.status !== "RELEASED") bad("подтвердите выпуск новой редакции.");
      if (replaced.has(supersedes as number)) bad("одну редакцию нельзя заменить дважды одним пакетом.");
      replaced.add(supersedes as number);
    } else if (item.revisionConfirmed) bad("подтверждение без заменяемой главы.");
    const expectedRelease = nullable(item.expectedRelease, 10);
    const releasedAt = nullable(item.releasedAt, 24);
    if (item.status === "RELEASED") {
      if (expectedRelease) bad("для опубликованной главы нельзя указывать ожидаемую дату.");
      if (releasedAt && (!/^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/.test(releasedAt) ||
          !isValidExpectedRelease(releasedAt.slice(0, 10)))) bad("неверная дата выхода.");
    } else if (releasedAt) bad("запланированная глава не может иметь фактическую дату выхода.");
    if (expectedRelease && !isValidExpectedRelease(expectedRelease)) bad("неверная ожидаемая дата.");
    return {
      displayCode, title, sourceUrl,
      kind: item.kind as "MAIN" | "SPECIAL",
      status: item.status as "SCHEDULED" | "RELEASED",
      volumeNumber: volume as number | null,
      sortOrder: order as number | null,
      releasedAt, expectedRelease,
      supersedesChapterId: supersedes as number | null,
      revisionConfirmed: item.revisionConfirmed as boolean,
    };
  });
}
