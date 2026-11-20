-- AUTH-01 / R1C2B1: additive recovery outbox durable claim lifecycle.
-- NO sender, provider, scheduler, secrets, existing row mutation or production execution.
-- Apply only in explicitly approved disposable PostgreSQL 17 CI/QA.
-- Keep 0040 immutable; existing ready/expired rows remain valid.
ALTER TABLE "password_reset_mail_outbox"
  ADD COLUMN "claim_id" varchar(64),
  ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox" DROP CONSTRAINT "password_reset_mail_outbox_state_check";
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_state_check" CHECK (
    ("state" = 'ready' AND "claim_id" IS NULL AND "claimed_at" IS NULL AND "attempt_count" = 0 AND "finalized_at" IS NULL)
    OR ("state" = 'expired' AND "claim_id" IS NULL AND "claimed_at" IS NULL AND "attempt_count" = 0 AND "finalized_at" IS NOT NULL)
    OR ("state" = 'in_flight' AND "claim_id" IS NOT NULL AND "claimed_at" IS NOT NULL AND "attempt_count" = 1 AND "finalized_at" IS NULL)
    OR ("state" IN ('accepted', 'rejected', 'uncertain') AND "claim_id" IS NOT NULL AND "claimed_at" IS NOT NULL AND "attempt_count" = 1 AND "finalized_at" IS NOT NULL)
  );
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_claim_id_check"
  CHECK ("claim_id" IS NULL OR "claim_id" ~ '^[A-Za-z0-9_-]{32}$');
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_claim_times_check"
  CHECK ("claimed_at" IS NULL OR ("claimed_at" >= "created_at" AND "updated_at" >= "claimed_at" AND ("finalized_at" IS NULL OR "finalized_at" >= "claimed_at")));
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox"
  ADD CONSTRAINT "password_reset_mail_outbox_claim_unique" UNIQUE ("claim_id");
