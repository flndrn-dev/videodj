-- Add profile_data JSONB column to users for KYC / personal info
-- Stores: phone, dob, country, city, address1, address2, postalCode
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}';

-- Add updated_at if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
