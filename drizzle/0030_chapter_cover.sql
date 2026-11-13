-- UX-09: optional artwork for chapters. Existing rows remain NULL.
ALTER TABLE "chapters" ADD COLUMN "cover_url" text;
