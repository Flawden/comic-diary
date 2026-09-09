CREATE TYPE "public"."chapter_status" AS ENUM('SCHEDULED', 'RELEASED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"comic_id" integer NOT NULL,
	"display_code" varchar(160) NOT NULL,
	"title" varchar(255),
	"sort_order" integer NOT NULL,
	"status" "chapter_status" DEFAULT 'SCHEDULED' NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comics" DROP CONSTRAINT "comics_visibility_owner_check";--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_comic_id_comics_id_fk" FOREIGN KEY ("comic_id") REFERENCES "public"."comics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comics" ADD CONSTRAINT "comics_visibility_owner_check" CHECK ((
        ("comics"."visibility" = 'SHARED' AND "comics"."owner_user_id" IS NULL)
        OR
        ("comics"."visibility" = 'PRIVATE' AND "comics"."owner_user_id" IS NOT NULL)
      ));