-- AUTH-01C2B4D2C4B3B2: DB fence marker ONLY (not an email transport or authorization).
-- Append-only: 0035 and all historical migrations are immutable.
-- All checks are local to this row; USER -> TOKEN -> OUTBOX locking is in the service.
ALTER TABLE "activation_mail_outbox" ADD COLUMN "dispatch_fence_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "activation_mail_outbox" ADD CONSTRAINT "activation_mail_outbox_dispatch_fence_shape_check" CHECK (
  "dispatch_fence_at" IS NULL OR (
    "state" IN ('in_flight', 'accepted', 'rejected', 'uncertain')
    AND "attempt_count" = 1
    AND "claim_id" IS NOT NULL
    AND "claimed_at" IS NOT NULL
    AND "dispatch_fence_at" >= "claimed_at"
    AND "dispatch_fence_at" < "expires_at"
    AND "updated_at" >= "dispatch_fence_at"
  )
);
