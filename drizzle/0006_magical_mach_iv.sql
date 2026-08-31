CREATE TABLE "catalog_import_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_sha256" varchar(64) NOT NULL,
	"snapshot_sha256" varchar(64) NOT NULL,
	"community_id" integer NOT NULL,
	"candidate_id" varchar(160) NOT NULL,
	"album_id" integer NOT NULL,
	"comic_slug" varchar(160) NOT NULL,
	"canonical_sha256" varchar(64) NOT NULL,
	"applied_action" varchar(16) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_import_receipts_identity_unique" UNIQUE("candidate_sha256","candidate_id","canonical_sha256"),
	CONSTRAINT "catalog_import_receipts_action_check" CHECK ("catalog_import_receipts"."applied_action" IN ('create', 'update', 'unchanged'))
);
