-- AUTH-01C2B4D2C1: schema ONLY for a future durable activation-mail outbox.
-- The encrypted payload is NOT plaintext email/code; keys must never be stored here.
-- No rows are enqueued, no dispatcher/crypto is implemented, no sending is enabled.
CREATE TABLE "activation_mail_outbox" (
    "id" serial PRIMARY KEY NOT NULL,
    "verification_token_id" integer NOT NULL,
    "payload_ciphertext" text NOT NULL,
    "payload_nonce" varchar(16) NOT NULL,
    "payload_key_id" varchar(64) NOT NULL,
    "payload_digest" varchar(64) NOT NULL,
    "idempotency_key" varchar(64) NOT NULL,
    "state" varchar(16) DEFAULT 'ready' NOT NULL,
    "claim_id" varchar(64),
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "claimed_at" timestamp with time zone,
    "finalized_at" timestamp with time zone,
    "provider_message_id" varchar(256),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "activation_mail_outbox_token_unique" UNIQUE("verification_token_id"),
    CONSTRAINT "activation_mail_outbox_idempotency_unique" UNIQUE("idempotency_key"),
    CONSTRAINT "activation_mail_outbox_claim_unique" UNIQUE("claim_id"),
    CONSTRAINT "activation_mail_outbox_digest_check" CHECK ("activation_mail_outbox"."payload_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "activation_mail_outbox_nonce_check" CHECK ("activation_mail_outbox"."payload_nonce" ~ '^[A-Za-z0-9_-]{16}$'),
    CONSTRAINT "activation_mail_outbox_key_id_check" CHECK ("activation_mail_outbox"."payload_key_id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
    CONSTRAINT "activation_mail_outbox_ciphertext_check" CHECK (length("activation_mail_outbox"."payload_ciphertext") BETWEEN 32 AND 20000 AND "activation_mail_outbox"."payload_ciphertext" ~ '^[A-Za-z0-9_-]+$'),
    CONSTRAINT "activation_mail_outbox_idempotency_check" CHECK ("activation_mail_outbox"."idempotency_key" ~ '^[A-Za-z0-9_-]{22,64}$'),
    CONSTRAINT "activation_mail_outbox_claim_id_check" CHECK ("activation_mail_outbox"."claim_id" IS NULL OR "activation_mail_outbox"."claim_id" ~ '^[A-Za-z0-9_-]{22,64}$'),
    CONSTRAINT "activation_mail_outbox_time_check" CHECK ("activation_mail_outbox"."expires_at" > "activation_mail_outbox"."created_at" AND "activation_mail_outbox"."updated_at" >= "activation_mail_outbox"."created_at" AND ("activation_mail_outbox"."claimed_at" IS NULL OR "activation_mail_outbox"."claimed_at" < "activation_mail_outbox"."expires_at") AND ("activation_mail_outbox"."finalized_at" IS NULL OR "activation_mail_outbox"."finalized_at" >= "activation_mail_outbox"."created_at")),
    CONSTRAINT "activation_mail_outbox_state_shape_check" CHECK (
      ("state" = 'ready' AND "attempt_count" = 0 AND "claim_id" IS NULL AND "claimed_at" IS NULL AND "finalized_at" IS NULL AND "provider_message_id" IS NULL)
      OR ("state" = 'in_flight' AND "attempt_count" = 1 AND "claim_id" IS NOT NULL AND "claimed_at" IS NOT NULL AND "finalized_at" IS NULL AND "provider_message_id" IS NULL)
      OR ("state" IN ('accepted', 'rejected', 'uncertain') AND "attempt_count" = 1 AND "claim_id" IS NOT NULL AND "claimed_at" IS NOT NULL AND "finalized_at" IS NOT NULL)
      OR ("state" = 'expired' AND "attempt_count" = 0 AND "claim_id" IS NULL AND "claimed_at" IS NULL AND "finalized_at" IS NOT NULL AND "provider_message_id" IS NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "activation_mail_outbox" ADD CONSTRAINT "activation_mail_outbox_token_fk" FOREIGN KEY ("verification_token_id") REFERENCES "public"."email_verification_tokens"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "activation_mail_outbox_ready_expiry_idx" ON "activation_mail_outbox" USING btree ("expires_at") WHERE "state" = 'ready';
--> statement-breakpoint
CREATE INDEX "activation_mail_outbox_state_updated_idx" ON "activation_mail_outbox" USING btree ("state", "updated_at");
