CREATE TABLE "comics" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"cover_url" text,
	"source_url" text NOT NULL,
	"total_chapters" integer,
	"category_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "comics" ADD CONSTRAINT "comics_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;