CREATE TABLE IF NOT EXISTS linus_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  actions TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_linus_conversations_user_id ON linus_conversations(user_id);
CREATE INDEX idx_linus_conversations_created_at ON linus_conversations(created_at DESC);
