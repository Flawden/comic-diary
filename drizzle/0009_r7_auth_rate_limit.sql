CREATE TABLE "auth_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" varchar(80) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limits_scope_key_unique" UNIQUE("scope","key_hash"),
	CONSTRAINT "auth_rate_limits_key_hash_sha256_check" CHECK ("auth_rate_limits"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_rate_limits_request_count_positive_check" CHECK ("auth_rate_limits"."request_count" >= 1)
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limits_updated_at_idx" ON "auth_rate_limits" USING btree ("updated_at");