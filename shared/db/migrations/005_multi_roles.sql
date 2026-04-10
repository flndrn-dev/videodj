-- Add multi-role support + bookkeeper role
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT '{}';
UPDATE users SET roles = ARRAY[role::text] WHERE roles = '{}' OR roles IS NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role::text = ANY(ARRAY['admin','support_agent','beta_tester','subscriber','bookkeeper']));
