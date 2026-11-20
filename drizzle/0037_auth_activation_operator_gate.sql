-- AUTH-01C2B4D2C4B3B3B: shared persisted default-OFF operator gate + inert reservation.
-- Append-only migration. No mail, no provider, no worker, no automatic enable.
-- Single lock order for future reservations: CONTROL -> USER -> TOKEN -> OUTBOX.
CREATE TABLE "activation_mail_dispatch_control" (
  "id" integer PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "generation" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "activation_mail_dispatch_control_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "activation_mail_dispatch_control_generation_check" CHECK ("generation" >= 0)
);
--> statement-breakpoint
INSERT INTO "activation_mail_dispatch_control" ("id", "enabled", "generation") VALUES (1, false, 0);
--> statement-breakpoint
ALTER TABLE "activation_mail_outbox" ADD COLUMN "dispatch_reservation_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "activation_mail_outbox" ADD COLUMN "dispatch_reservation_generation" integer;
--> statement-breakpoint
ALTER TABLE "activation_mail_outbox" ADD CONSTRAINT "activation_mail_outbox_dispatch_reservation_shape_check" CHECK (
  ("dispatch_reservation_at" IS NULL AND "dispatch_reservation_generation" IS NULL)
  OR (
    "dispatch_reservation_at" IS NOT NULL
    AND "dispatch_reservation_generation" > 0
    AND "dispatch_fence_at" IS NOT NULL
    AND "state" IN ('in_flight', 'accepted', 'rejected', 'uncertain')
    AND "attempt_count" = 1
    AND "claim_id" IS NOT NULL
    AND "dispatch_reservation_at" >= "dispatch_fence_at"
    AND "dispatch_reservation_at" < "expires_at"
    AND "updated_at" >= "dispatch_reservation_at"
  )
);
