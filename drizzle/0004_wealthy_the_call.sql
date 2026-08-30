ALTER TABLE "categories" ADD COLUMN "slug" varchar(160);
--> statement-breakpoint
UPDATE "categories"
SET "slug" = CASE
  WHEN "name" = 'Чайная территория'
    THEN 'tea-territory'
  ELSE 'category-' || "id"::text
END
WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "categories"
ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories"
ADD CONSTRAINT "categories_slug_unique"
UNIQUE("slug");
