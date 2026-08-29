CREATE TYPE "public"."reading_status" AS ENUM('WANT_TO_READ', 'READING', 'COMPLETED', 'ON_HOLD');--> statement-breakpoint
CREATE TABLE "user_comics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"comic_id" integer NOT NULL,
	"status" "reading_status" DEFAULT 'WANT_TO_READ' NOT NULL,
	"current_chapter" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_comics_user_id_comic_id_unique" UNIQUE("user_id","comic_id"),
	CONSTRAINT "user_comics_current_chapter_non_negative" CHECK ("user_comics"."current_chapter" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_comics" ADD CONSTRAINT "user_comics_comic_id_comics_id_fk" FOREIGN KEY ("comic_id") REFERENCES "public"."comics"("id") ON DELETE cascade ON UPDATE no action;