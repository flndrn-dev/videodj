CREATE TABLE IF NOT EXISTS fix_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_pattern TEXT NOT NULL,
  error_count INTEGER DEFAULT 1,
  severity TEXT DEFAULT 'error',
  component TEXT,
  llm_analysis TEXT,
  proposed_fix TEXT,
  proposed_fix_type TEXT DEFAULT 'config',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  auto_promoted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fix_proposals_status ON fix_proposals(status);
