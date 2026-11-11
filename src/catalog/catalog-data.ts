import type { WorkType, WorkFormat } from "@/modules/comics/work-metadata";
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
  // Optional so older catalog imports do not overwrite manually assigned art.
  bannerUrl?: string | null;
  // A work can be catalogued even when its reading source is not known.
  sourceUrl: string | null;
  totalChapters: number | null;
  publicationStatus: ComicPublicationStatus;
  seriesStatus?: SeriesStatus;
  workType?: WorkType;
  workFormat?: WorkFormat;
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
