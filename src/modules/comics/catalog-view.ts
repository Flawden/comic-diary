export const catalogSortLabels = {
  TITLE_ASC: "Название: А → Я",
  TITLE_DESC: "Название: Я → А",
  UPDATED_DESC: "Недавно обновлённые",
} as const;

export type CatalogSort =
  keyof typeof catalogSortLabels;

const SEARCH_MAX_CHARACTERS =
  120;

const CATEGORY_SLUG_MAX_CHARACTERS =
  160;

const forbiddenControlCharacters =
  /[\u0000-\u001f\u007f]/u;

export function isCatalogSort(
  value: string,
): value is CatalogSort {
  return Object.prototype.hasOwnProperty.call(
    catalogSortLabels,
    value,
  );
}

function trimToCodePoints(
  value: string,
  maxCharacters: number,
) {
  return Array.from(
    value.trim(),
  )
    .slice(
      0,
      maxCharacters,
    )
    .join("");
}

export function normalizeCatalogSearch(
  value:
    | string
    | undefined,
) {
  if (!value) {
    return "";
  }

  const normalized =
    trimToCodePoints(
      value,
      SEARCH_MAX_CHARACTERS,
    );

  if (
    forbiddenControlCharacters.test(
      normalized,
    )
  ) {
    return "";
  }

  return normalized;
}

export function normalizeCatalogCategorySlug(
  value:
    | string
    | undefined,
) {
  if (!value) {
    return null;
  }

  const normalized =
    trimToCodePoints(
      value,
      CATEGORY_SLUG_MAX_CHARACTERS,
    );

  if (
    normalized === "" ||
    forbiddenControlCharacters.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

/**
 * Escape PostgreSQL LIKE metacharacters before
 * wrapping a title search in `%...%`.
 */
export function escapeCatalogLikePattern(
  value: string,
) {
  return value.replace(
    /[\\%_]/g,
    "\\$&",
  );
}
