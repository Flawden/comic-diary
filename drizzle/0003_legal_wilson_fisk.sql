ALTER TABLE "user_comics" ADD COLUMN "rating_plot" integer;--> statement-breakpoint
ALTER TABLE "user_comics" ADD COLUMN "rating_characters" integer;--> statement-breakpoint
ALTER TABLE "user_comics" ADD COLUMN "rating_art" integer;--> statement-breakpoint
ALTER TABLE "user_comics" ADD COLUMN "rating_depth" integer;--> statement-breakpoint
ALTER TABLE "user_comics" ADD COLUMN "rating_world" integer;--> statement-breakpoint
ALTER TABLE "user_comics" ADD COLUMN "personal_note" text;--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_rating_plot_range" CHECK ("user_comics"."rating_plot" IS NULL OR ("user_comics"."rating_plot" >= 1 AND "user_comics"."rating_plot" <= 5));--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_rating_characters_range" CHECK ("user_comics"."rating_characters" IS NULL OR ("user_comics"."rating_characters" >= 1 AND "user_comics"."rating_characters" <= 5));--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_rating_art_range" CHECK ("user_comics"."rating_art" IS NULL OR ("user_comics"."rating_art" >= 1 AND "user_comics"."rating_art" <= 5));--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_rating_depth_range" CHECK ("user_comics"."rating_depth" IS NULL OR ("user_comics"."rating_depth" >= 1 AND "user_comics"."rating_depth" <= 5));--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_rating_world_range" CHECK ("user_comics"."rating_world" IS NULL OR ("user_comics"."rating_world" >= 1 AND "user_comics"."rating_world" <= 5));