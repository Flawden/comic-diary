-- Database foundation only. Old rows and INSERTs retain pending activation semantics.
-- No user/session updates, backfill of verification, sender, or feature enablement.
ALTER TABLE "email_verification_tokens" ADD COLUMN "purpose" varchar(32) DEFAULT 'pending_activation' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_purpose_check"
  CHECK ("email_verification_tokens"."purpose" IN ('pending_activation', 'legacy_email_verification'));
