/**
 * Reader-facing placement is per volume. The database still uses one integer
 * sortOrder per comic; this planner deterministically assigns global slots
 * without exposing technical indices to administrators.
 *
 * This is a pure function so an invalid anchor fails BEFORE any transaction
 * writes. Existing IDs and reading history are never changed by the planner.
 */
export type PlaceVolume = number | null;
export type ChapterPlacementMode = "AUTO" | "BEFORE" | "AFTER";
export type PlacementExisting = {
  id: number;
  volumeNumber: PlaceVolume;
  sortOrder: number;
};
export type PlacementDraft = {
  volumeNumber: PlaceVolume;
  supersedesChapterId: number | null;
  placementMode: ChapterPlacementMode;
  anchorChapterId: number | null;
};
export type VolumePlacementPlan = {
  newSortOrders: number[];
  existingChanges: Array<{ id: number; sortOrder: number }>;
};

type Slot = { id: number; afterAnchorId: number | null };
const volumeCompare = (a: PlaceVolume, b: PlaceVolume): number =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b;

export function planVolumeChapterPlacement(
  existing: readonly PlacementExisting[],
  drafts: readonly PlacementDraft[],
): VolumePlacementPlan {
  if ((existing.length + drafts.length) * 10 > 2147483647) {
    throw new Error("Слишком много глав для расчёта порядка.");
  }
  const volumes = new Map<PlaceVolume, Slot[]>();
  const seenIds = new Set<number>();
  for (const chapter of [...existing].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
    if (!Number.isSafeInteger(chapter.id) || chapter.id <= 0 || seenIds.has(chapter.id)) {
      throw new Error("Некорректный реестр глав.");
    }
    seenIds.add(chapter.id);
    const list = volumes.get(chapter.volumeNumber) ?? [];
    list.push({ id: chapter.id, afterAnchorId: null });
    volumes.set(chapter.volumeNumber, list);
  }
  const replacedIds = new Set(drafts.map(d => d.supersedesChapterId).filter((id): id is number => id !== null));
  if (replacedIds.size !== drafts.filter(d => d.supersedesChapterId !== null).length) {
    throw new Error("Нельзя заменить одну главу дважды.");
  }
  const byId = new Map(existing.map(chapter => [chapter.id, chapter]));
  for (const id of replacedIds) {
    if (!byId.has(id)) throw new Error("Заменяемая глава отсутствует в активном реестре.");
  }
  // An anchor must survive the entire batch. This rejects references to a
  // chapter replaced in a later row, not just an earlier one.
  for (const draft of drafts) {
    if (draft.placementMode !== "AUTO") {
      const anchor = draft.anchorChapterId === null ? null : byId.get(draft.anchorChapterId);
      if (!anchor || replacedIds.has(anchor.id) || anchor.volumeNumber !== draft.volumeNumber) {
        throw new Error("Выберите существующую главу в том же томе, не заменяемую в этом пакете.");
      }
    } else if (draft.anchorChapterId !== null) {
      throw new Error("Автоматическое расположение не принимает соседнюю главу.");
    }
  }
  for (const [index, draft] of drafts.entries()) {
    let replacedAt: number | null = null;
    const old = draft.supersedesChapterId === null ? null : byId.get(draft.supersedesChapterId)!;
    if (old) {
      const oldList = volumes.get(old.volumeNumber)!;
      const oldIndex = oldList.findIndex(slot => slot.id === old.id);
      if (oldIndex === -1) throw new Error("Заменяемая глава уже отсутствует.");
      oldList.splice(oldIndex, 1);
      if (old.volumeNumber === draft.volumeNumber) replacedAt = oldIndex;
    }
    const list = volumes.get(draft.volumeNumber) ?? [];
    volumes.set(draft.volumeNumber, list);
    let insertionIndex = list.length;
    let afterAnchorId: number | null = null;
    if (draft.placementMode === "AUTO") {
      if (replacedAt !== null) insertionIndex = Math.min(replacedAt, list.length);
    } else {
      const anchorIndex = list.findIndex(slot => slot.id === draft.anchorChapterId);
      if (anchorIndex === -1) throw new Error("Соседняя глава больше недоступна.");
      insertionIndex = anchorIndex;
      if (draft.placementMode === "AFTER") {
        insertionIndex++;
        afterAnchorId = draft.anchorChapterId;
        // Repeated AFTER placements preserve their input order.
        while (insertionIndex < list.length && list[insertionIndex].afterAnchorId === draft.anchorChapterId) {
          insertionIndex++;
        }
      }
    }
    list.splice(insertionIndex, 0, { id: -(index + 1), afterAnchorId });
  }
  const newSortOrders = Array.from({ length: drafts.length }, () => 0);
  const oldSortOrders = new Map(existing.map(row => [row.id, row.sortOrder]));
  const existingChanges: Array<{ id: number; sortOrder: number }> = [];
  let position = 0;
  for (const volume of [...volumes.keys()].sort(volumeCompare)) {
    for (const slot of volumes.get(volume)!) {
      const sortOrder = (++position) * 10;
      if (slot.id < 0) {
        newSortOrders[-slot.id - 1] = sortOrder;
      } else if (oldSortOrders.get(slot.id) !== sortOrder) {
        existingChanges.push({ id: slot.id, sortOrder });
      }
    }
  }
  if (newSortOrders.some(value => value <= 0)) throw new Error("Невозможно рассчитать порядок глав.");
  return { newSortOrders, existingChanges };
}
