-- AUTH-01 / R1B2A: INERT encrypted password-recovery outbox storage.
-- Distinct from activation_mail_outbox; NO worker, claims, delivery, endpoint,
-- key storage, writes or dispatch permissions are introduced by this migration.
-- Apply ONLY on an explicitly approved disposable PG17 instance in QA.
CREATE TABLE "password_reset_mail_outbox" (
  "id" serial PRIMARY KEY NOT NULL,
  "password_reset_token_id" integer NOT NULL,
  "payload_ciphertext" text NOT NULL,
  "payload_nonce" varchar(16) NOT NULL,
  "payload_key_id" varchar(64) NOT NULL,
  "payload_digest" varchar(64) NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "state" varchar(16) DEFAULT 'ready' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "finalized_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_mail_outbox_token_unique" UNIQUE ("password_reset_token_id"),
  CONSTRAINT "password_reset_mail_outbox_idempotency_unique" UNIQUE ("idempotency_key"),
  CONSTRAINT "password_reset_mail_outbox_digest_check" CHECK ("payload_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "password_reset_mail_outbox_nonce_check" CHECK ("payload_nonce" ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT "password_reset_mail_outbox_key_id_check" CHECK ("payload_key_id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT "password_reset_mail_outbox_ciphertext_check" CHECK (length("payload_ciphertext") BETWEEN 32 AND 20000 AND "payload_ciphertext" ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT "password_reset_mail_outbox_idempotency_check" CHECK ("idempotency_key" ~ '^[A-Za-z0-9_-]{22,64}$'),
  CONSTRAINT "password_reset_mail_outbox_time_check" CHECK ("expires_at" > "created_at" AND "updated_at" >= "created_at" AND ("finalized_at" IS NULL OR "finalized_at" >= "created_at")),
  CONSTRAINT "password_reset_mail_outbox_state_check" CHECK (
    ("state" = 'ready' AND "finalized_at" IS NULL) OR
    ("state" = 'expired' AND "finalized_at" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "password_reset_mail_outbox" ADD CONSTRAINT "password_reset_mail_outbox_token_fk" FOREIGN KEY ("password_reset_token_id") REFERENCES "public"."password_reset_tokens"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "password_reset_mail_outbox_ready_expiry_idx" ON "password_reset_mail_outbox" USING btree ("expires_at") WHERE "state" = 'ready';
--> statement-breakpoint
CREATE INDEX "password_reset_mail_outbox_state_updated_idx" ON "password_reset_mail_outbox" USING btree ("state", "updated_at");
