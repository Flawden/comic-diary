CREATE TABLE "user_chapter_reads" (
	"user_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" varchar(16) DEFAULT 'EXPLICIT' NOT NULL,
	CONSTRAINT "user_chapter_reads_user_id_chapter_id_pk" PRIMARY KEY("user_id","chapter_id")
);
--> statement-breakpoint
ALTER TABLE "chapters" DROP CONSTRAINT "chapters_comic_display_code_unique";--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "kind" varchar(16) DEFAULT 'MAIN' NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "supersedes_chapter_id" integer;--> statement-breakpoint
ALTER TABLE "user_chapter_reads" ADD CONSTRAINT "user_chapter_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chapter_reads" ADD CONSTRAINT "user_chapter_reads_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_chapter_reads_chapter_idx" ON "user_chapter_reads" USING btree ("chapter_id");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_supersedes_chapter_id_chapters_id_fk" FOREIGN KEY ("supersedes_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_comic_display_code_active_unique" ON "chapters" USING btree ("comic_id","display_code") WHERE "chapters"."status" <> 'ARCHIVED';--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_supersedes_unique" ON "chapters" USING btree ("supersedes_chapter_id");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_kind_valid" CHECK ("chapters"."kind" IN ('MAIN', 'SPECIAL'));
--> statement-breakpoint
-- Preserve the old ordered-count interpretation once, for existing registries only.
INSERT INTO user_chapter_reads (user_id, chapter_id, read_at, origin)
SELECT uc.user_id, ranked.id, uc.updated_at, 'MIGRATED'
FROM user_comics uc JOIN (
  SELECT id, comic_id, row_number() OVER (PARTITION BY comic_id ORDER BY sort_order, id) AS position
  FROM chapters WHERE status = 'RELEASED'
) ranked ON ranked.comic_id = uc.comic_id AND ranked.position <= uc.current_chapter
ON CONFLICT DO NOTHING;
