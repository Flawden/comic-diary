import { isWorkType, isWorkFormat } from "@/modules/comics/work-metadata";
import { isSeriesStatus } from "@/modules/comics/series-status";
import type {
  CatalogCategory,
  CatalogComic,
  ComicPublicationStatus,
} from "@/catalog/catalog-data";

const slugPattern =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Custom page art must come from the authenticated media upload pipeline.
const bannerPattern =
  /^\/media\/covers\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const publicationStatuses =
  new Set<ComicPublicationStatus>([
    "PUBLISHED",
    "HIDDEN",
    "ARCHIVED",
  ]);

function validateSlug(
  slug: string,
  label: string,
) {
  if (!slugPattern.test(slug)) {
    throw new Error(
      `${label} has invalid slug: ${slug}`,
    );
  }
}

function validateUniqueSlugs(
  values: readonly { slug: string }[],
  label: string,
) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value.slug)) {
      throw new Error(
        `Duplicate ${label} slug: ${value.slug}`,
      );
    }

    seen.add(value.slug);
  }
}

function validateSourceUrl(
  sourceUrl: string | null,
  comicSlug: string,
) {
  // Absence is valid; a supplied URL must still meet the existing HTTP(S) rules.
  if (sourceUrl === null) return;
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error(
      `Comic ${comicSlug} has invalid source URL`,
    );
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new Error(
      `Comic ${comicSlug} has unsupported source URL protocol`,
    );
  }
}

function validateOptionalText(
  value: string | null,
  label: string,
  comicSlug: string,
) {
  if (
    value !== null &&
    value.trim() === ""
  ) {
    throw new Error(
      `Comic ${comicSlug} has empty ${label}`,
    );
  }
}

export function validateCatalogData(
  categories: readonly CatalogCategory[],
  comics: readonly CatalogComic[],
) {
  validateUniqueSlugs(
    categories,
    "category",
  );

  validateUniqueSlugs(
    comics,
    "comic",
  );

  const categorySlugs = new Set(
    categories.map(
      (category) => category.slug,
    ),
  );

  for (const category of categories) {
    validateSlug(
      category.slug,
      "Category",
    );

    if (category.name.trim() === "") {
      throw new Error(
        `Category ${category.slug} has an empty name`,
      );
    }
  }

  for (const comic of comics) {
    validateSlug(
      comic.slug,
      "Comic",
    );

    if (comic.title.trim() === "") {
      throw new Error(
        `Comic ${comic.slug} has an empty title`,
      );
    }

    validateOptionalText(
      comic.authorName,
      "author name",
      comic.slug,
    );

    validateOptionalText(
      comic.translatorName,
      "translator name",
      comic.slug,
    );

    validateOptionalText(
      comic.translatorNote,
      "translator note",
      comic.slug,
    );

    if (comic.bannerUrl != null && !bannerPattern.test(comic.bannerUrl)) {
      throw new Error(`Comic ${comic.slug} has invalid banner URL`);
    }

    if (
      (comic.workType !== undefined && !isWorkType(comic.workType)) ||
      (comic.workFormat !== undefined && !isWorkFormat(comic.workFormat)) ||
      (comic.seriesStatus !== undefined && !isSeriesStatus(comic.seriesStatus)) ||
      !publicationStatuses.has(
        comic.publicationStatus,
      )
    ) {
      throw new Error(
        `Comic ${comic.slug} has invalid publication status`,
      );
    }

    if (
      !categorySlugs.has(
        comic.categorySlug,
      )
    ) {
      throw new Error(
        `Comic ${comic.slug} references unknown category: ${comic.categorySlug}`,
      );
    }

    if (
      comic.totalChapters !== null &&
      (
        !Number.isInteger(
          comic.totalChapters,
        ) ||
        comic.totalChapters <= 0
      )
    ) {
      throw new Error(
        `Comic ${comic.slug} has invalid total chapters`,
      );
    }

    validateSourceUrl(
      comic.sourceUrl,
      comic.slug,
    );
  }
}
