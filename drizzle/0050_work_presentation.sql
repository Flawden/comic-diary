CREATE TABLE "comic_genres" (
	"comic_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "comic_genres_comic_id_genre_id_pk" PRIMARY KEY("comic_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(48) NOT NULL,
	CONSTRAINT "genres_key_unique" UNIQUE("key"),
	CONSTRAINT "genres_name_nonempty" CHECK (length(btrim("genres"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "reading_minutes" integer;--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "age_rating" integer;--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "presentation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comic_genres" ADD CONSTRAINT "comic_genres_comic_id_comics_id_fk" FOREIGN KEY ("comic_id") REFERENCES "public"."comics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_genres" ADD CONSTRAINT "comic_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_page_count_valid" CHECK ("chapters"."page_count" IS NULL OR "chapters"."page_count" BETWEEN 1 AND 100000);--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_reading_minutes_valid" CHECK ("chapters"."reading_minutes" IS NULL OR "chapters"."reading_minutes" BETWEEN 1 AND 100000);--> statement-breakpoint
ALTER TABLE "comics" ADD CONSTRAINT "comics_age_rating_valid" CHECK ("comics"."age_rating" IS NULL OR "comics"."age_rating" IN (0,6,12,16,18));--> statement-breakpoint
ALTER TABLE "comics" ADD CONSTRAINT "comics_presentation_revision_valid" CHECK ("comics"."presentation_revision" >= 0);