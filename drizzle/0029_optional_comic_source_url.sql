-- WD-LINK-01: the source is editorial metadata, not a requirement for a work.
-- Existing URLs stay untouched; no comic or chapter rows are rewritten.
ALTER TABLE "comics" ALTER COLUMN "source_url" DROP NOT NULL;
