-- AUTH-01C2B4A: stage only; do not run on production before the gated rollout.
-- Existing users remain verification_required_at = NULL (historical accounts).
-- Two statements deliberately separate adding the nullable column from setting
-- the DEFAULT for FUTURE registrations; never backfill old accounts.
ALTER TABLE "users" ADD COLUMN "verification_required_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "verification_required_at" SET DEFAULT now();
