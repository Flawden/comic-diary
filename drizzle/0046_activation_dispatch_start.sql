ALTER TABLE "activation_mail_outbox" ADD COLUMN "dispatch_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_mail_outbox" ADD CONSTRAINT "activation_mail_outbox_dispatch_start_shape_check" CHECK (
      "activation_mail_outbox"."dispatch_started_at" IS NULL OR (
        "activation_mail_outbox"."state" IN ('in_flight', 'accepted', 'rejected', 'uncertain')
        AND "activation_mail_outbox"."attempt_count" = 1 AND "activation_mail_outbox"."claim_id" IS NOT NULL
        AND "activation_mail_outbox"."dispatch_reservation_at" IS NOT NULL
        AND "activation_mail_outbox"."dispatch_reservation_generation" IS NOT NULL
        AND "activation_mail_outbox"."dispatch_reservation_generation" > 0
        AND "activation_mail_outbox"."dispatch_started_at" >= "activation_mail_outbox"."dispatch_reservation_at"
        AND "activation_mail_outbox"."dispatch_started_at" < "activation_mail_outbox"."expires_at"
        AND "activation_mail_outbox"."updated_at" >= "activation_mail_outbox"."dispatch_started_at"
        AND ("activation_mail_outbox"."finalized_at" IS NULL OR "activation_mail_outbox"."finalized_at" >= "activation_mail_outbox"."dispatch_started_at")
      )
    );