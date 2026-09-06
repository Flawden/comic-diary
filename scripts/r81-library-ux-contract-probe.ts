import {
  compareLibraryViewItems,
  getLibraryProgressPercent,
  isLibrarySort,
} from "../src/modules/library/library-view";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  getLibraryProgressPercent(
    5,
    10,
  ) === 50,
  "progress must be rounded to percent",
);

assert(
  getLibraryProgressPercent(
    12,
    10,
  ) === 100,
  "progress must clamp above total chapters",
);

assert(
  getLibraryProgressPercent(
    -2,
    10,
  ) === 0,
  "progress must clamp below zero",
);

assert(
  getLibraryProgressPercent(
    5,
    null,
  ) === null,
  "unknown total chapters must not invent percent",
);

assert(
  isLibrarySort("UPDATED"),
  "UPDATED must be accepted",
);

assert(
  !isLibrarySort("NOPE"),
  "unknown sort must be rejected",
);

const now =
  new Date(
    "2026-09-06T00:00:00Z",
  );

const older =
  new Date(
    "2026-09-05T00:00:00Z",
  );

const items = [
  {
    title: "Бета",
    updatedAt: older,
    progressPercent: 80,
    averageRating: 4.2,
  },
  {
    title: "Альфа",
    updatedAt: now,
    progressPercent: 20,
    averageRating: 4.8,
  },
];

const byUpdated =
  [...items].sort(
    (left, right) =>
      compareLibraryViewItems(
        left,
        right,
        "UPDATED",
      ),
  );

assert(
  byUpdated[0]?.title ===
    "Альфа",
  "updated sort must put newest first",
);

const byProgress =
  [...items].sort(
    (left, right) =>
      compareLibraryViewItems(
        left,
        right,
        "PROGRESS",
      ),
  );

assert(
  byProgress[0]?.title ===
    "Бета",
  "progress sort must put highest progress first",
);

const byRating =
  [...items].sort(
    (left, right) =>
      compareLibraryViewItems(
        left,
        right,
        "RATING",
      ),
  );

assert(
  byRating[0]?.title ===
    "Альфа",
  "rating sort must put highest rating first",
);

console.log(
  "R8_1B_LIBRARY_PROGRESS_HELPER=PASS",
);
console.log(
  "R8_1B_LIBRARY_SORT_CONTRACT=PASS",
);
