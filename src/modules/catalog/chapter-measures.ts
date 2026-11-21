/** Omitted values preserve existing metadata; null explicitly means unknown. */
export function optionalChapterMeasure(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 100000) {
    throw new Error('Страницы и время: укажите целое число от 1 до 100000 или оставьте поле пустым.');
  }
  return value;
}

export function expectedChapterMeasures(value: unknown): { pageCount: number | null; readingMinutes: number | null } | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata baseline');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || Object.keys(row).some(k => k !== 'pageCount' && k !== 'readingMinutes')) throw new Error('Invalid metadata baseline');
  const pageCount = optionalChapterMeasure(row.pageCount), readingMinutes = optionalChapterMeasure(row.readingMinutes);
  if (pageCount === undefined || readingMinutes === undefined) throw new Error('Incomplete metadata baseline');
  return { pageCount, readingMinutes };
}
