ALTER TABLE "activation_mail_dispatch_control" ADD COLUMN "pilot_id" varchar(36);--> statement-breakpoint
ALTER TABLE "activation_mail_dispatch_control" ADD COLUMN "pilot_user_id" integer;--> statement-breakpoint
ALTER TABLE "activation_mail_dispatch_control" ADD COLUMN "pilot_outbox_id" integer;--> statement-breakpoint
ALTER TABLE "activation_mail_dispatch_control" ADD COLUMN "pilot_armed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_mail_dispatch_control" ADD COLUMN "pilot_dispatch_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_mail_dispatch_control" ADD COLUMN "pilot_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_mail_dispatch_control" ADD CONSTRAINT "activation_mail_pilot_shape_check" CHECK ((
    ("activation_mail_dispatch_control"."pilot_id" IS NULL AND "activation_mail_dispatch_control"."pilot_user_id" IS NULL AND "activation_mail_dispatch_control"."pilot_outbox_id" IS NULL AND "activation_mail_dispatch_control"."pilot_armed_at" IS NULL AND "activation_mail_dispatch_control"."pilot_dispatch_used_at" IS NULL AND "activation_mail_dispatch_control"."pilot_closed_at" IS NULL)
    OR ("activation_mail_dispatch_control"."pilot_id" IS NOT NULL AND "activation_mail_dispatch_control"."pilot_id" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AND "activation_mail_dispatch_control"."pilot_user_id" IS NOT NULL AND "activation_mail_dispatch_control"."pilot_user_id" = 1 AND "activation_mail_dispatch_control"."pilot_armed_at" IS NOT NULL
      AND ("activation_mail_dispatch_control"."pilot_outbox_id" IS NULL OR "activation_mail_dispatch_control"."pilot_outbox_id" > 0)
      AND ("activation_mail_dispatch_control"."pilot_dispatch_used_at" IS NULL OR ("activation_mail_dispatch_control"."pilot_outbox_id" IS NOT NULL AND "activation_mail_dispatch_control"."pilot_dispatch_used_at" >= "activation_mail_dispatch_control"."pilot_armed_at"))
      AND ("activation_mail_dispatch_control"."pilot_closed_at" IS NULL OR "activation_mail_dispatch_control"."pilot_closed_at" >= "activation_mail_dispatch_control"."pilot_armed_at"))
  ));--> statement-breakpoint
CREATE FUNCTION auth_activation_pilot_write_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.pilot_id IS NOT NULL AND (NEW.pilot_id IS DISTINCT FROM OLD.pilot_id OR NEW.pilot_user_id IS DISTINCT FROM OLD.pilot_user_id OR NEW.pilot_armed_at IS DISTINCT FROM OLD.pilot_armed_at))
    OR (OLD.pilot_outbox_id IS NOT NULL AND NEW.pilot_outbox_id IS DISTINCT FROM OLD.pilot_outbox_id)
    OR (OLD.pilot_dispatch_used_at IS NOT NULL AND NEW.pilot_dispatch_used_at IS DISTINCT FROM OLD.pilot_dispatch_used_at)
    OR (OLD.pilot_closed_at IS NOT NULL AND NEW.pilot_closed_at IS DISTINCT FROM OLD.pilot_closed_at)
  THEN RAISE EXCEPTION 'activation pilot fields are write-once' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER auth_activation_pilot_write_once BEFORE UPDATE ON activation_mail_dispatch_control
FOR EACH ROW EXECUTE FUNCTION auth_activation_pilot_write_once();
