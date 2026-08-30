CREATE TYPE "public"."comic_publication_status" AS ENUM('PUBLISHED', 'HIDDEN', 'ARCHIVED');--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "author_name" varchar(255);--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "translator_name" varchar(255);--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "translator_note" text;--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "publication_status" "comic_publication_status" DEFAULT 'PUBLISHED' NOT NULL;