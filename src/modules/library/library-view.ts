export const librarySortLabels = {
  UPDATED: "Недавно обновлённые",
  TITLE: "По названию",
  PROGRESS: "По прогрессу",
  RATING: "По оценке",
} as const;

export type LibrarySort =
  keyof typeof librarySortLabels;

export type LibraryViewSortItem = {
  title: string;
  updatedAt: Date;
  progressPercent: number | null;
  averageRating: number | null;
};

export function isLibrarySort(
  value: string,
): value is LibrarySort {
  return Object.prototype.hasOwnProperty.call(
    librarySortLabels,
    value,
  );
}

export function getLibraryProgressPercent(
  currentChapter: number,
  totalChapters: number | null,
): number | null {
  if (
    totalChapters === null ||
    totalChapters <= 0
  ) {
    return null;
  }

  const boundedChapter =
    Math.min(
      totalChapters,
      Math.max(
        0,
        currentChapter,
      ),
    );

  return Math.round(
    (
      boundedChapter /
      totalChapters
    ) * 100,
  );
}

export function compareLibraryViewItems(
  left: LibraryViewSortItem,
  right: LibraryViewSortItem,
  sort: LibrarySort,
): number {
  let result = 0;

  if (sort === "UPDATED") {
    result =
      right.updatedAt.getTime() -
      left.updatedAt.getTime();
  } else if (sort === "TITLE") {
    result =
      left.title.localeCompare(
        right.title,
        "ru",
        {
          sensitivity: "base",
        },
      );
  } else if (sort === "PROGRESS") {
    result =
      (right.progressPercent ?? -1) -
      (left.progressPercent ?? -1);
  } else if (sort === "RATING") {
    result =
      (right.averageRating ?? -1) -
      (left.averageRating ?? -1);
  }

  if (result !== 0) {
    return result;
  }

  return left.title.localeCompare(
    right.title,
    "ru",
    {
      sensitivity: "base",
    },
  );
}
