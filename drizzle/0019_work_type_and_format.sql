CREATE TYPE "public"."comic_work_format" AS ENUM('UNKNOWN', 'PAGED', 'WEBTOON', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."comic_work_type" AS ENUM('UNKNOWN', 'MANGA', 'MANHWA', 'MANHUA', 'COMIC', 'OTHER');--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "work_type" "comic_work_type" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "work_format" "comic_work_format" DEFAULT 'UNKNOWN' NOT NULL;