-- Durable at-most-once network handoff. Existing migrations remain immutable.
-- A committed start is never cleared, including after crash or uncertain outcome.
ALTER TABLE "password_reset_mail_outbox"
  ADD COLUMN "dispatch_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_dispatch_start_check" CHECK (
    "dispatch_started_at" IS NULL OR (
      "dispatch_reservation_at" IS NOT NULL
      AND "dispatch_reservation_generation" IS NOT NULL
      AND "dispatch_started_at" >= "dispatch_reservation_at"
      AND "dispatch_started_at" < "expires_at"
      AND "updated_at" >= "dispatch_started_at"
      AND "state" IN ('in_flight', 'accepted', 'rejected', 'uncertain')
    )
  );
