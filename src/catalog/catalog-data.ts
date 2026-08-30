export type CatalogCategory = {
  slug: string;
  name: string;
  description: string | null;
};

export type CatalogComic = {
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  totalChapters: number | null;
  categorySlug: string;
};

export const catalogCategories = [
  {
    slug: "tea-territory",
    name: "Чайная территория",
    description:
      "Основная территория каталога комиксов",
  },
] as const satisfies readonly CatalogCategory[];

export const catalogComics: readonly CatalogComic[] = [];
