-- Tag every magic link with which product issued it so the verify
-- endpoints can refuse to sign anyone into the wrong client.
ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS client TEXT;
UPDATE magic_links SET client = 'web' WHERE client IS NULL;
