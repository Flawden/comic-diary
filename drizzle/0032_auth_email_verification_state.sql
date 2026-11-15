-- AUTH-01C2A: additive nullable attribute. Existing accounts remain UNVERIFIED.
-- No bulk update, backfill, email sender or public verification endpoint.
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
