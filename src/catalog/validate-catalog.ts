import type {
  CatalogCategory,
  CatalogComic,
} from "@/catalog/catalog-data";

const slugPattern =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  sourceUrl: string,
  comicSlug: string,
) {
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
