import type {
  CatalogCategory,
  CatalogComic,
} from "@/catalog/catalog-data";

/**
 * One PostgreSQL advisory transaction lock protects
 * shared canonical catalog mutations.
 *
 * Bulk imports and manual/editor mutations deliberately
 * use the same lock so they cannot race each other.
 */
export const SHARED_CATALOG_ADVISORY_LOCK =
  536000001;

export function canonicalCategoryCreateValues(
  category: CatalogCategory,
) {
  return {
    slug:
      category.slug,

    name:
      category.name,

    description:
      category.description,
  };
}

export function canonicalCategoryUpdateValues(
  category: CatalogCategory,
) {
  const createValues =
    canonicalCategoryCreateValues(
      category,
    );

  const {
    slug,
    ...mutableValues
  } = createValues;

  /*
   * Category slug is canonical identity and is excluded
   * from metadata updates. Existing comic/import references
   * therefore remain stable across category edits.
   */
  void slug;

  return {
    ...mutableValues,

    updatedAt:
      new Date(),
  };
}

export function canonicalComicCreateValues(
  comic: CatalogComic,
  categoryId: number,
) {
  return {
    slug:
      comic.slug,

    title:
      comic.title,

    description:
      comic.description,

    authorName:
      comic.authorName,

    translatorName:
      comic.translatorName,

    translatorNote:
      comic.translatorNote,

    coverUrl:
      comic.coverUrl,

    sourceUrl:
      comic.sourceUrl,

    totalChapters:
      comic.totalChapters,

    ...(comic.workType === undefined ? {} : { workType: comic.workType }),
    ...(comic.workFormat === undefined ? {} : { workFormat: comic.workFormat }),
    ...(comic.seriesStatus === undefined ? {} : { seriesStatus: comic.seriesStatus }),

    publicationStatus:
      comic.publicationStatus,

    visibility:
      "SHARED" as const,

    ownerUserId:
      null,

    categoryId,
  };
}

export function canonicalComicUpdateValues(
  comic: CatalogComic,
  categoryId: number,
) {
  const createValues =
    canonicalComicCreateValues(
      comic,
      categoryId,
    );

  const {
    slug,
    visibility,
    ownerUserId,
    ...mutableValues
  } = createValues;

  void visibility;
  void ownerUserId;

  /*
   * Reading slug here is deliberate:
   * slug is canonical identity and is excluded from
   * metadata updates rather than written as undefined.
   */
  void slug;

  return {
    ...mutableValues,

    updatedAt:
      new Date(),
  };
}
