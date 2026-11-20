-- AUTH-01C2B1: storage only. No public routes, mail delivery, or migration execution.
-- A verification challenge is tied to the exact account email at issuance.
CREATE TABLE "email_verification_tokens" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "email_snapshot" varchar(320) NOT NULL,
    "token_hash" varchar(64) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash"),
    CONSTRAINT "email_verification_tokens_hash_sha256_check" CHECK ("email_verification_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "email_verification_tokens_expiry_check" CHECK ("email_verification_tokens"."expires_at" > "email_verification_tokens"."created_at"),
    CONSTRAINT "email_verification_tokens_one_terminal_state_check" CHECK (NOT ("email_verification_tokens"."consumed_at" IS NOT NULL AND "email_verification_tokens"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_tokens_one_open_per_user_idx" ON "email_verification_tokens" USING btree ("user_id") WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;
