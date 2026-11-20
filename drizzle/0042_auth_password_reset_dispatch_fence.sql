-- AUTH-01 / R1C2C2: add an INERT at-most-once recovery-dispatch fence marker.
-- NO sender, gate enable, provider, secrets, retry or production DB execution.
-- Apply ONLY on an explicitly approved disposable PostgreSQL 17 CI/QA database.
-- 0040 and 0041 remain immutable; old READY/EXPIRED rows are unaffected.
ALTER TABLE "password_reset_mail_outbox"
  ADD COLUMN "dispatch_fence_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_dispatch_fence_check"
  CHECK (
    "dispatch_fence_at" IS NULL
    OR (
      "state" IN ('in_flight', 'accepted', 'rejected', 'uncertain')
      AND "claim_id" IS NOT NULL
      AND "claimed_at" IS NOT NULL
      AND "dispatch_fence_at" >= "claimed_at"
      AND "dispatch_fence_at" >= "created_at"
      AND "updated_at" >= "dispatch_fence_at"
      AND "dispatch_fence_at" < "expires_at"
    )
  );
