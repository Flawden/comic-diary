CREATE TABLE user_appearance (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_filename varchar(64),
  selected_frame varchar(40),
  beta_participant boolean NOT NULL DEFAULT false,
  beta_frame_granted boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appearance_revision_positive CHECK (revision > 0),
  CONSTRAINT appearance_avatar_filename CHECK (avatar_filename IS NULL OR avatar_filename ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$'),
  CONSTRAINT appearance_beta_grant CHECK (NOT beta_frame_granted OR beta_participant),
  CONSTRAINT appearance_frame_grant CHECK (selected_frame IS NULL OR (selected_frame='beta_dragon_2026' AND beta_frame_granted))
);
--> statement-breakpoint
CREATE TABLE user_appearance_events (
  id serial PRIMARY KEY,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  target_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  beta_participant boolean NOT NULL,
  beta_frame_granted boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX appearance_events_target_idx ON user_appearance_events(target_user_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX appearance_avatar_unique ON user_appearance(avatar_filename);
