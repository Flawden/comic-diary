CREATE TABLE "password_reset_tokens" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "token_hash" varchar(64) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash"),
    CONSTRAINT "password_reset_tokens_hash_sha256_check" CHECK ("password_reset_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "password_reset_tokens_expiry_check" CHECK ("password_reset_tokens"."expires_at" > "password_reset_tokens"."created_at"),
    CONSTRAINT "password_reset_tokens_one_terminal_state_check" CHECK (NOT ("password_reset_tokens"."consumed_at" IS NOT NULL AND "password_reset_tokens"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_one_open_per_user_idx" ON "password_reset_tokens" USING btree ("user_id") WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;
