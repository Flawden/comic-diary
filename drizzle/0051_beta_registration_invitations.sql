CREATE TABLE "beta_invitation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"actor_user_id" integer NOT NULL,
	"action" varchar(16) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invitation_event_action_check" CHECK ("beta_invitation_events"."action" IN ('CREATED','REVOKED'))
);
--> statement-breakpoint
CREATE TABLE "beta_registration_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"secret_hash" varchar(64) NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"pending_user_id" integer,
	"claimed_at" timestamp (3) with time zone,
	"activated_at" timestamp (3) with time zone,
	CONSTRAINT "beta_invitations_secret_hash_unique" UNIQUE("secret_hash"),
	CONSTRAINT "beta_invitations_id_user_unique" UNIQUE("id","pending_user_id"),
	CONSTRAINT "beta_invitations_hash_check" CHECK ("beta_registration_invitations"."secret_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "beta_invitations_expiry_check" CHECK ("beta_registration_invitations"."expires_at" > "beta_registration_invitations"."created_at"),
	CONSTRAINT "beta_invitations_shape_check" CHECK (("beta_registration_invitations"."pending_user_id" IS NULL) = ("beta_registration_invitations"."claimed_at" IS NULL) AND ("beta_registration_invitations"."activated_at" IS NULL OR "beta_registration_invitations"."claimed_at" IS NOT NULL) AND ("beta_registration_invitations"."claimed_at" IS NULL OR "beta_registration_invitations"."claimed_at" >= "beta_registration_invitations"."created_at") AND ("beta_registration_invitations"."revoked_at" IS NULL OR "beta_registration_invitations"."revoked_at" >= "beta_registration_invitations"."created_at") AND ("beta_registration_invitations"."activated_at" IS NULL OR "beta_registration_invitations"."activated_at" >= "beta_registration_invitations"."claimed_at"))
);
--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD COLUMN "invitation_id" integer;--> statement-breakpoint
ALTER TABLE "beta_invitation_events" ADD CONSTRAINT "beta_invitation_events_invitation_id_beta_registration_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."beta_registration_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invitation_events" ADD CONSTRAINT "beta_invitation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_registration_invitations" ADD CONSTRAINT "beta_registration_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_registration_invitations" ADD CONSTRAINT "beta_registration_invitations_pending_user_id_users_id_fk" FOREIGN KEY ("pending_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_invitations_email_idx" ON "beta_registration_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "beta_invitations_pending_user_idx" ON "beta_registration_invitations" USING btree ("pending_user_id");--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_invitation_user_fk" FOREIGN KEY ("invitation_id","user_id") REFERENCES "public"."beta_registration_invitations"("id","pending_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verification_invitation_idx" ON "email_verification_tokens" USING btree ("invitation_id");--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_invitation_purpose_check" CHECK ("email_verification_tokens"."invitation_id" IS NULL OR "email_verification_tokens"."purpose" = 'pending_activation');
--> statement-breakpoint
CREATE FUNCTION beta_invitation_write_once_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash OR NEW.email IS DISTINCT FROM OLD.email OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR (OLD.pending_user_id IS NOT NULL AND NEW.pending_user_id IS DISTINCT FROM OLD.pending_user_id) OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at) OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at) OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
  RAISE EXCEPTION 'immutable invitation state' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER beta_invitation_write_once BEFORE UPDATE ON beta_registration_invitations FOR EACH ROW EXECUTE FUNCTION beta_invitation_write_once_guard();
--> statement-breakpoint
CREATE FUNCTION beta_invitation_token_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.invitation_id IS DISTINCT FROM OLD.invitation_id OR (NEW.invitation_id IS NOT NULL AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.purpose IS DISTINCT FROM OLD.purpose)) THEN
  RAISE EXCEPTION 'immutable invitation token binding' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER beta_invitation_token_binding BEFORE UPDATE ON email_verification_tokens FOR EACH ROW EXECUTE FUNCTION beta_invitation_token_binding_guard();
