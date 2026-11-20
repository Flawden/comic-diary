-- AUTH-01 / R1C2C3: INERT shared default-OFF recovery operator gate and one-shot reservation.
-- Append-only after 0042. NO provider, sender, worker, HTTP, secrets, automatic ON or production execution.
-- Apply ONLY on an expressly approved disposable PG17 CI/QA database.
-- Lock order for FUTURE gate transitions/reservations: CONTROL -> USER -> TOKEN -> OUTBOX.
CREATE TABLE "password_reset_mail_dispatch_control" (
  "id" integer PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "generation" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_mail_dispatch_control_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "password_reset_mail_dispatch_control_generation_check" CHECK (
    "generation" >= 0 AND ("enabled" = false OR "generation" > 0)
  )
);
--> statement-breakpoint
INSERT INTO "password_reset_mail_dispatch_control" ("id", "enabled", "generation")
VALUES (1, false, 0);
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD COLUMN "dispatch_reservation_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD COLUMN "dispatch_reservation_generation" integer;
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_dispatch_reservation_shape_check"
  CHECK (
    ("dispatch_reservation_at" IS NULL AND "dispatch_reservation_generation" IS NULL)
    OR (
      "dispatch_reservation_at" IS NOT NULL
      AND "dispatch_reservation_generation" IS NOT NULL
      AND "dispatch_reservation_generation" > 0
      AND "dispatch_fence_at" IS NOT NULL
      AND "state" IN ('in_flight', 'accepted', 'rejected', 'uncertain')
      AND "attempt_count" = 1
      AND "claim_id" IS NOT NULL
      AND "claimed_at" IS NOT NULL
      AND "dispatch_reservation_at" >= "dispatch_fence_at"
      AND "dispatch_reservation_at" >= "claimed_at"
      AND "dispatch_reservation_at" < "expires_at"
      AND "updated_at" >= "dispatch_reservation_at"
    )
  );
--> statement-breakpoint
-- SQL CHECK has a third UNKNOWN state; require timestamp iff generation is present.
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_dispatch_reservation_presence_check"
  CHECK (
    ("dispatch_reservation_at" IS NULL AND "dispatch_reservation_generation" IS NULL)
    OR ("dispatch_reservation_at" IS NOT NULL AND "dispatch_reservation_generation" IS NOT NULL)
  );
