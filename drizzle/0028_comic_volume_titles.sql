-- A4.1: optional editorial titles for numbered volumes, keyed by comic and number.
-- No chapter rows are updated: existing reading history and order are untouched.
CREATE TABLE "comic_volume_titles" (
  "comic_id" integer NOT NULL REFERENCES "comics"("id") ON DELETE CASCADE,
  "volume_number" integer NOT NULL,
  "title" varchar(160) NOT NULL,
  CONSTRAINT "comic_volume_titles_pkey" PRIMARY KEY ("comic_id", "volume_number"),
  CONSTRAINT "comic_volume_titles_number_valid" CHECK ("volume_number" BETWEEN 1 AND 99),
  CONSTRAINT "comic_volume_titles_title_nonempty" CHECK (length(btrim("title")) > 0)
);
