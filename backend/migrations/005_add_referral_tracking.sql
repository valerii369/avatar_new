-- Add referral tracking support to users table
-- Allows tracking which user referred a new user

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for efficient lookups of referrals
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Seed AVATAR100 promo code with max_uses=3
INSERT INTO promo_codes (code, energy_reward, max_uses, active)
VALUES ('AVATAR100', 100, 3, TRUE)
ON CONFLICT (code) DO NOTHING;
