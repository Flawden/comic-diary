import { isWorkType, isWorkFormat, type WorkType, type WorkFormat } from "@/modules/comics/work-metadata";
import { isSeriesStatus, type SeriesStatus } from "@/modules/comics/series-status";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  categories,
  comics,
} from "@/db/schema";

import {
  escapeCatalogLikePattern,
  type CatalogSort,
} from "@/modules/comics/catalog-view";

export type GetComicsOptions = {
  search?: string;
  categorySlug?: string | null;
  sort?: CatalogSort;
  seriesStatus?: SeriesStatus | null;
  workType?: WorkType | null;
  workFormat?: WorkFormat | null;
};

export async function getComics(
  options: GetComicsOptions = {},
) {
  const search =
    options.search?.trim() ??
    "";

  const predicates = [
    eq(
      comics.visibility,
      "SHARED",
    ),
    eq(
      comics.publicationStatus,
      "PUBLISHED",
    ),
  ];

  if (search !== "") {
    predicates.push(
      ilike(
        comics.title,
        `%${escapeCatalogLikePattern(
          search,
        )}%`,
      ),
    );
  }

  if (options.categorySlug) {
    predicates.push(
      eq(
        categories.slug,
        options.categorySlug,
      ),
    );
  }

  if (options.seriesStatus && isSeriesStatus(options.seriesStatus)) {
    predicates.push(eq(comics.seriesStatus, options.seriesStatus));
  }

  if (options.workType && isWorkType(options.workType)) predicates.push(eq(comics.workType, options.workType));
  if (options.workFormat && isWorkFormat(options.workFormat)) predicates.push(eq(comics.workFormat, options.workFormat));

  const sort =
    options.sort ??
    "TITLE_ASC";

  const primaryOrder =
    sort === "TITLE_DESC"
      ? desc(comics.title)
      : sort === "UPDATED_DESC"
        ? desc(comics.updatedAt)
        : asc(comics.title);

  return db
    .select({
      id: comics.id,
      slug: comics.slug,
      title: comics.title,
      description:
        comics.description,
      authorName:
        comics.authorName,
      translatorName:
        comics.translatorName,
      translatorNote:
        comics.translatorNote,
      coverUrl:
        comics.coverUrl,
      sourceUrl:
        comics.sourceUrl,
      seriesStatus: comics.seriesStatus,
      workType: comics.workType,
      workFormat: comics.workFormat,
      totalChapters:
        comics.totalChapters,
      publicationStatus:
        comics.publicationStatus,
      categoryId:
        categories.id,
      categoryName:
        categories.name,
    })
    .from(comics)
    .leftJoin(
      categories,
      eq(
        comics.categoryId,
        categories.id,
      ),
    )
    .where(
      and(
        ...predicates,
      ),
    )
    .orderBy(
      primaryOrder,
      asc(comics.id),
    );
}

export async function getPublishedCatalogCategories() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
    })
    .from(categories)
    .innerJoin(
      comics,
      eq(
        comics.categoryId,
        categories.id,
      ),
    )
    .where(
      and(
        eq(
          comics.visibility,
          "SHARED",
        ),
        eq(
          comics.publicationStatus,
          "PUBLISHED",
        ),
      ),
    )
    .groupBy(
      categories.id,
      categories.slug,
      categories.name,
    )
    .orderBy(
      asc(categories.name),
      asc(categories.id),
    );
}

export type ComicListItem = Awaited<
  ReturnType<typeof getComics>
>[number];
