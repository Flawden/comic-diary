ALTER TABLE "chapters" ADD CONSTRAINT "chapters_id_comic_review_unique" UNIQUE("id","comic_id");--> statement-breakpoint
CREATE TABLE "community_review_reactions" (
	"review_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "community_review_reactions_review_id_user_id_pk" PRIMARY KEY("review_id","user_id"),
	CONSTRAINT "community_review_reactions_value_check" CHECK ("community_review_reactions"."value" IN (-1,1))
);
--> statement-breakpoint
CREATE TABLE "community_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"comic_id" integer NOT NULL,
	"chapter_id" integer,
	"user_id" integer NOT NULL,
	"rating_plot" integer,
	"rating_characters" integer,
	"rating_art" integer,
	"rating_depth" integer,
	"rating_world" integer,
	"rating" integer,
	"body" text DEFAULT '' NOT NULL,
	"spoiler" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"hidden_at" timestamp (3) with time zone,
	CONSTRAINT "community_reviews_scores_check" CHECK ((
    ("community_reviews"."chapter_id" IS NULL AND "community_reviews"."rating" IS NULL AND "community_reviews"."rating_plot" IS NOT NULL AND "community_reviews"."rating_characters" IS NOT NULL AND "community_reviews"."rating_art" IS NOT NULL AND "community_reviews"."rating_depth" IS NOT NULL AND "community_reviews"."rating_world" IS NOT NULL
      AND "community_reviews"."rating_plot" BETWEEN 1 AND 5 AND "community_reviews"."rating_characters" BETWEEN 1 AND 5 AND "community_reviews"."rating_art" BETWEEN 1 AND 5 AND "community_reviews"."rating_depth" BETWEEN 1 AND 5 AND "community_reviews"."rating_world" BETWEEN 1 AND 5)
    OR ("community_reviews"."chapter_id" IS NOT NULL AND "community_reviews"."rating" IS NOT NULL AND "community_reviews"."rating" BETWEEN 1 AND 5 AND "community_reviews"."rating_plot" IS NULL AND "community_reviews"."rating_characters" IS NULL AND "community_reviews"."rating_art" IS NULL AND "community_reviews"."rating_depth" IS NULL AND "community_reviews"."rating_world" IS NULL))),
	CONSTRAINT "community_reviews_body_check" CHECK (char_length("community_reviews"."body") <= 2000),
	CONSTRAINT "community_reviews_version_check" CHECK ("community_reviews"."version" > 0 AND "community_reviews"."updated_at" >= "community_reviews"."created_at")
);
--> statement-breakpoint
ALTER TABLE "community_comment_moderation_events" ADD COLUMN "review_id" integer;--> statement-breakpoint
ALTER TABLE "community_review_reactions" ADD CONSTRAINT "community_review_reactions_review_id_community_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."community_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_review_reactions" ADD CONSTRAINT "community_review_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reviews" ADD CONSTRAINT "community_reviews_comic_id_comics_id_fk" FOREIGN KEY ("comic_id") REFERENCES "public"."comics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reviews" ADD CONSTRAINT "community_reviews_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reviews" ADD CONSTRAINT "community_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reviews" ADD CONSTRAINT "community_reviews_chapter_binding_fk" FOREIGN KEY ("chapter_id","comic_id") REFERENCES "public"."chapters"("id","comic_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "community_reviews_work_user_unique" ON "community_reviews" USING btree ("user_id","comic_id") WHERE "community_reviews"."chapter_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "community_reviews_chapter_user_unique" ON "community_reviews" USING btree ("user_id","chapter_id") WHERE "community_reviews"."chapter_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "community_reviews_target_idx" ON "community_reviews" USING btree ("comic_id","chapter_id","created_at","id");--> statement-breakpoint
