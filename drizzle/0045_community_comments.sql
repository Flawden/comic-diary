CREATE TABLE "community_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"comic_id" integer NOT NULL,
	"chapter_id" integer,
	"author_user_id" integer,
	"parent_id" integer,
	"request_id" uuid NOT NULL,
	"request_digest" varchar(64) NOT NULL,
	"body" text,
	"spoiler" boolean DEFAULT false NOT NULL,
	"status" varchar(24) DEFAULT 'VISIBLE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "community_comments_request_unique" UNIQUE("author_user_id","request_id"),
	CONSTRAINT "community_comments_status_check" CHECK ("community_comments"."status" IN ('VISIBLE','REMOVED_BY_AUTHOR','HIDDEN_BY_MODERATOR')),
	CONSTRAINT "community_comments_body_check" CHECK (("community_comments"."status" = 'REMOVED_BY_AUTHOR' AND "community_comments"."body" IS NULL AND "community_comments"."deleted_at" IS NOT NULL) OR ("community_comments"."status" <> 'REMOVED_BY_AUTHOR' AND char_length("community_comments"."body") BETWEEN 1 AND 2000 AND "community_comments"."body" IS NOT NULL AND "community_comments"."deleted_at" IS NULL)),
	CONSTRAINT "community_comments_parent_check" CHECK ("community_comments"."parent_id" IS NULL OR "community_comments"."parent_id" <> "community_comments"."id"),
	CONSTRAINT "community_comments_digest_check" CHECK ("community_comments"."request_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "community_comments_time_check" CHECK ("community_comments"."updated_at" >= "community_comments"."created_at" AND ("community_comments"."edited_at" IS NULL OR "community_comments"."edited_at" >= "community_comments"."created_at") AND ("community_comments"."deleted_at" IS NULL OR "community_comments"."deleted_at" >= "community_comments"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "community_comment_restrictions" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"blocked_until" timestamp (3) with time zone,
	"reason" varchar(500) DEFAULT '' NOT NULL,
	"moderator_user_id" integer,
	"last_post_at" timestamp (3) with time zone,
	"post_window_at" timestamp (3) with time zone,
	"post_count" integer DEFAULT 0 NOT NULL,
	"report_window_at" timestamp (3) with time zone,
	"report_count" integer DEFAULT 0 NOT NULL,
	"edit_window_at" timestamp (3) with time zone,
	"edit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_controls_counts_check" CHECK ("community_comment_restrictions"."post_count" >= 0 AND "community_comment_restrictions"."report_count" >= 0 AND "community_comment_restrictions"."edit_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "community_comment_moderation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"action" varchar(16) NOT NULL,
	"comment_id" integer,
	"report_id" integer,
	"target_user_id" integer,
	"reason" varchar(500) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_events_action_check" CHECK ("community_comment_moderation_events"."action" IN ('HIDE','RESTORE','RESOLVE','REJECT','RESTRICT','UNRESTRICT'))
);
--> statement-breakpoint
CREATE TABLE "community_comment_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" integer NOT NULL,
	"reporter_user_id" integer,
	"reason" varchar(16) NOT NULL,
	"note" varchar(300),
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"moderator_user_id" integer,
	CONSTRAINT "community_reports_reporter_unique" UNIQUE("comment_id","reporter_user_id"),
	CONSTRAINT "community_reports_reason_check" CHECK ("community_comment_reports"."reason" IN ('SPAM','INSULT','SPOILER','OTHER')),
	CONSTRAINT "community_reports_status_check" CHECK ("community_comment_reports"."status" IN ('OPEN','RESOLVED','REJECTED')),
	CONSTRAINT "community_reports_resolution_check" CHECK (("community_comment_reports"."status" = 'OPEN' AND "community_comment_reports"."resolved_at" IS NULL) OR ("community_comment_reports"."status" <> 'OPEN' AND "community_comment_reports"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_comic_id_comics_id_fk" FOREIGN KEY ("comic_id") REFERENCES "public"."comics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parent_id_community_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."community_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_restrictions" ADD CONSTRAINT "community_comment_restrictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_restrictions" ADD CONSTRAINT "community_comment_restrictions_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_moderation_events" ADD CONSTRAINT "community_comment_moderation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_reports" ADD CONSTRAINT "community_comment_reports_comment_id_community_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."community_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_reports" ADD CONSTRAINT "community_comment_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comment_reports" ADD CONSTRAINT "community_comment_reports_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_comments_target_cursor_idx" ON "community_comments" USING btree ("comic_id","chapter_id","created_at","id");--> statement-breakpoint
CREATE INDEX "community_comments_parent_idx" ON "community_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "community_events_cursor_idx" ON "community_comment_moderation_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "community_events_actor_idx" ON "community_comment_moderation_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "community_reports_queue_idx" ON "community_comment_reports" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "community_reports_reporter_idx" ON "community_comment_reports" USING btree ("reporter_user_id");