ALTER TABLE users ADD COLUMN deleted_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_deleted_inert CHECK (deleted_at IS NULL OR (is_active = false AND password_hash IS NULL AND role='USER' AND display_name='Удалённый пользователь' AND email_verified_at IS NULL AND email ~ '^deleted-[a-f0-9-]+@account[.]invalid$'));
--> statement-breakpoint
CREATE TABLE account_lifecycle_events (
 id serial PRIMARY KEY,
 actor_user_id integer NOT NULL REFERENCES users(id),
 target_user_id integer NOT NULL REFERENCES users(id),
 action varchar(20) NOT NULL CONSTRAINT account_lifecycle_action CHECK (action IN ('BAN','UNBAN','DELETE','SELF_DELETE')),
 created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION account_deleted_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid integer;
BEGIN
 uid := (row_to_json(NEW)->>TG_ARGV[0])::integer;
 IF uid IS NULL THEN RETURN NEW; END IF;
 PERFORM id FROM users WHERE id=uid AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'deleted account cannot own new state' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lifecycle_session_guard BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION account_deleted_write_guard('user_id');
--> statement-breakpoint
CREATE TRIGGER lifecycle_diary_guard BEFORE INSERT OR UPDATE ON user_comics FOR EACH ROW EXECUTE FUNCTION account_deleted_write_guard('user_id');
--> statement-breakpoint
CREATE TRIGGER lifecycle_reads_guard BEFORE INSERT OR UPDATE ON user_chapter_reads FOR EACH ROW EXECUTE FUNCTION account_deleted_write_guard('user_id');
--> statement-breakpoint
CREATE TRIGGER lifecycle_appearance_guard BEFORE INSERT OR UPDATE ON user_appearance FOR EACH ROW EXECUTE FUNCTION account_deleted_write_guard('user_id');
--> statement-breakpoint
CREATE TRIGGER lifecycle_entitlements_guard BEFORE INSERT OR UPDATE ON user_entitlements FOR EACH ROW EXECUTE FUNCTION account_deleted_write_guard('user_id');
--> statement-breakpoint
CREATE TRIGGER lifecycle_private_guard BEFORE INSERT OR UPDATE ON comics FOR EACH ROW EXECUTE FUNCTION account_deleted_write_guard('owner_user_id');
