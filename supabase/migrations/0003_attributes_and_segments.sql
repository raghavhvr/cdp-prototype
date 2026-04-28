-- ============================================================================
-- Migration 0003 — Sub-Attributes and Expanded Segments
-- ============================================================================
-- Adds new segment types, a user_attributes JSONB column, and indexes.
-- Run this AFTER 0001 and 0002. Safe to re-run (uses IF NOT EXISTS).
-- ============================================================================

-- Add new segment types to the existing enum.
-- Postgres doesn't support adding enum values inside a transaction normally,
-- so each is a separate ALTER TYPE statement.
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'abandoned_cart_high_value';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'abandoned_cart_standard';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'reg_drop_otp';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'reg_drop_details';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'reg_drop_eligibility';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'promo_viewer';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'winner_validator';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'repeat_visitor_high';
ALTER TYPE cdp_segment_type ADD VALUE IF NOT EXISTS 'lapsed_customer';

-- Add user_attributes JSONB column for flexible sub-attributes.
-- JSONB lets us add new attributes later without schema migrations.
ALTER TABLE cdp_user_profiles
  ADD COLUMN IF NOT EXISTS user_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- GIN index lets us query attributes efficiently
CREATE INDEX IF NOT EXISTS idx_profiles_attributes ON cdp_user_profiles USING GIN (user_attributes);

-- Status check
SELECT 'Migration 0003 applied: new segments + user_attributes column added' AS status;
