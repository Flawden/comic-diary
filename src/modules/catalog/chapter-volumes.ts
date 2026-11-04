/** WD17: a chapter may belong to a numbered volume, or none. Pure presentation helpers. */
export type VolumeGroup<T> = { number: number | null; chapters: T[] };

export function groupChaptersByVolume<T extends { volumeNumber: number | null }>(
  chapters: readonly T[],
): VolumeGroup<T>[] {
  const groups = new Map<number | null, T[]>();
  for (const chapter of chapters) {
    const number = chapter.volumeNumber;
    const items = groups.get(number) ?? [];
    items.push(chapter);
    groups.set(number, items);
  }
  // Volume numbers are editorial labels; chapter order inside each group is retained.
  return [...groups.entries()]
    .sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a - b)
    .map(([number, items]) => ({ number, chapters: items }));
}

export function volumeProgress(
  chapters: readonly { id: number; status: string }[],
  readIds: ReadonlySet<number>,
) {
  const released = chapters.filter(chapter => chapter.status === "RELEASED");
  return { read: released.filter(chapter => readIds.has(chapter.id)).length, total: released.length };
}
