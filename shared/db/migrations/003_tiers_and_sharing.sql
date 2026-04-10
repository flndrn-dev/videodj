-- Add tier and trial tracking to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(16) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

-- Add share_code to user_playlists
ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS share_code UUID;
CREATE INDEX IF NOT EXISTS idx_playlists_share_code ON user_playlists(share_code) WHERE share_code IS NOT NULL;

-- Add tier check constraint
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_tier_check CHECK (tier IN ('free', 'fun_user', 'dj_user'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
