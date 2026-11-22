CREATE TABLE site_access_policy (
 id integer PRIMARY KEY CHECK (id=1),
 public_registration boolean NOT NULL DEFAULT false,
 beta_only boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO site_access_policy(id) VALUES (1);
--> statement-breakpoint
CREATE TABLE site_access_events (
 id serial PRIMARY KEY,
 actor_user_id integer NOT NULL REFERENCES users(id),
 public_registration boolean NOT NULL,
 beta_only boolean NOT NULL,
 revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE beta_registration_invitations ADD COLUMN grants_beta boolean NOT NULL DEFAULT false;
