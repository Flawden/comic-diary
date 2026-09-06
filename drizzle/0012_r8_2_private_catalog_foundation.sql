CREATE TYPE "public"."comic_visibility" AS ENUM('SHARED', 'PRIVATE');--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "visibility" "comic_visibility" DEFAULT 'SHARED' NOT NULL;--> statement-breakpoint
ALTER TABLE "comics" ADD COLUMN "owner_user_id" integer;--> statement-breakpoint
ALTER TABLE "comics" ADD CONSTRAINT "comics_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comics_owner_user_id_idx" ON "comics" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "comics" ADD CONSTRAINT "comics_visibility_owner_check" CHECK ((("comics"."visibility" = 'SHARED' AND "comics"."owner_user_id" IS NULL) OR ("comics"."visibility" = 'PRIVATE' AND "comics"."owner_user_id" IS NOT NULL)));
