-- WD17: optional, non-destructive chapter grouping. Existing rows stay ungrouped.
ALTER TABLE "chapters" ADD COLUMN "volume_number" integer;
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_volume_number_valid"
  CHECK ("volume_number" IS NULL OR "volume_number" BETWEEN 1 AND 99);
