import {
  escapeCatalogLikePattern,
  isCatalogSort,
  normalizeCatalogCategorySlug,
  normalizeCatalogSearch,
} from "../src/modules/comics/catalog-view";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  normalizeCatalogSearch(
    "  Берсерк  ",
  ) === "Берсерк",
  "search must trim surrounding whitespace",
);

assert(
  normalizeCatalogSearch(
    "   ",
  ) === "",
  "blank search must normalize to empty",
);

assert(
  normalizeCatalogSearch(
    "A".repeat(121),
  ).length === 120,
  "search must be bounded to 120 code points",
);

assert(
  normalizeCatalogSearch(
    "😀".repeat(121),
  ) === "😀".repeat(120),
  "search length must be Unicode-code-point aware",
);

assert(
  normalizeCatalogSearch(
    "one\ntwo",
  ) === "",
  "control characters must be rejected",
);

assert(
  normalizeCatalogCategorySlug(
    " fantasy "
  ) === "fantasy",
  "category slug must trim whitespace",
);

assert(
  normalizeCatalogCategorySlug(
    "   ",
  ) === null,
  "blank category slug must become null",
);

assert(
  isCatalogSort(
    "TITLE_ASC",
  ),
  "TITLE_ASC must be accepted",
);

assert(
  isCatalogSort(
    "UPDATED_DESC",
  ),
  "UPDATED_DESC must be accepted",
);

assert(
  !isCatalogSort(
    "INVALID",
  ),
  "unknown sort must be rejected",
);

assert(
  escapeCatalogLikePattern(
    String.raw`100%_done\ok`,
  ) === String.raw`100\%\_done\\ok`,
  "LIKE metacharacters must be escaped",
);

console.log(
  "R8_1C_CATALOG_QUERY_NORMALIZATION=PASS",
);

console.log(
  "R8_1C_CATALOG_FILTER_SORT_CONTRACT=PASS",
);
