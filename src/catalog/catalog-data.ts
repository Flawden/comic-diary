import type { SeriesStatus } from "@/modules/comics/series-status";
export type CatalogCategory = {
  slug: string;
  name: string;
  description: string | null;
};

export type ComicPublicationStatus =
  | "PUBLISHED"
  | "HIDDEN"
  | "ARCHIVED";

export type CatalogComic = {
  slug: string;
  title: string;
  description: string | null;
  authorName: string | null;
  translatorName: string | null;
  translatorNote: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  totalChapters: number | null;
  publicationStatus: ComicPublicationStatus;
  seriesStatus?: SeriesStatus;
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
