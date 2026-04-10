CREATE TABLE IF NOT EXISTS user_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT DEFAULT 'user',
  track_ids TEXT[] DEFAULT '{}',
  total_duration REAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_playlists_user_id ON user_playlists(user_id);
