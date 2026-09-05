CREATE TYPE "public"."administrative_audit_action" AS ENUM('CATEGORY_CREATE', 'CATEGORY_UPDATE', 'COMIC_CREATE', 'COMIC_UPDATE', 'VK_IMPORT_APPLY', 'ACCOUNT_ROLE_CHANGE', 'ACCOUNT_ACTIVE_CHANGE', 'ACCOUNT_ENTITLEMENTS_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."administrative_audit_target" AS ENUM('CATEGORY', 'COMIC', 'IMPORT_BATCH', 'USER');--> statement-breakpoint
CREATE TABLE "administrative_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer NOT NULL,
	"actor_role" "user_role" NOT NULL,
	"action" "administrative_audit_action" NOT NULL,
	"target_type" "administrative_audit_target" NOT NULL,
	"target_id" integer,
	"target_key" varchar(320) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "administrative_audit_events" ADD CONSTRAINT "administrative_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "administrative_audit_events_occurred_at_idx" ON "administrative_audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "administrative_audit_events_actor_user_id_idx" ON "administrative_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "administrative_audit_events_target_idx" ON "administrative_audit_events" USING btree ("target_type","target_key");