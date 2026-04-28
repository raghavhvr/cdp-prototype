-- ============================================================================
-- Emirates Draw CDP Prototype — Database Schema
-- ============================================================================
-- Run this entire file in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- It creates all tables, indexes, and helper functions needed by the prototype.
-- Safe to re-run: drops existing prototype tables before creating.
-- ============================================================================

-- Clean slate (only drops prototype-prefixed tables, safe for shared projects)
DROP TABLE IF EXISTS cdp_activations CASCADE;
DROP TABLE IF EXISTS cdp_segment_membership CASCADE;
DROP TABLE IF EXISTS cdp_identity_graph CASCADE;
DROP TABLE IF EXISTS cdp_user_profiles CASCADE;
DROP TABLE IF EXISTS cdp_events CASCADE;
DROP TYPE IF EXISTS cdp_segment_type CASCADE;
DROP TYPE IF EXISTS cdp_event_type CASCADE;
DROP TYPE IF EXISTS cdp_activation_channel CASCADE;
DROP TYPE IF EXISTS cdp_activation_status CASCADE;

-- ============================================================================
-- ENUMS — controlled vocabulary for event types and segments
-- ============================================================================

CREATE TYPE cdp_event_type AS ENUM (
  'page_view',
  'game_view',           -- viewed a specific game (Mega7, Easy6, etc.)
  'promo_view',          -- viewed a promotion page
  'results_view',
  'winners_view',
  'cart_add',
  'cart_view',
  'checkout_start',
  'purchase',
  'registration_start',
  'registration_step',   -- intermediate step (otp, details, eligibility)
  'registration_complete',
  'session_start',
  'session_end'
);

CREATE TYPE cdp_segment_type AS ENUM (
  'abandoned_cart',
  'started_registration',
  'high_intent_anonymous',
  'engaged_browser',
  'suppression_cooldown',
  'suppression_refresh',
  'low_engagement',
  'ineligible',
  'converted',
  'unassigned'
);

CREATE TYPE cdp_activation_channel AS ENUM (
  'meta',
  'google_ads',
  'onsite_modal',
  'email_crm',
  'third_party_dsp'
);

CREATE TYPE cdp_activation_status AS ENUM (
  'queued',
  'sent',
  'failed',
  'simulated'
);

-- ============================================================================
-- EVENTS — append-only log of every behavioral signal
-- ============================================================================

CREATE TABLE cdp_events (
  id BIGSERIAL PRIMARY KEY,
  anonymous_id TEXT NOT NULL,           -- cookie-based ID for anonymous users
  user_id TEXT,                          -- internal user ID once registered
  event_type cdp_event_type NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT NOT NULL,
  -- Context
  page_path TEXT,
  page_category TEXT,                    -- game, promo, results, winners, registration, cart, home, other
  game_name TEXT,                        -- mega7, easy6, fast5, raffle, null
  -- Registration progress
  registration_step TEXT,                -- otp, personal_details, eligibility, complete
  -- Cart / commerce
  cart_value_aed NUMERIC(10,2),
  -- Engagement signals
  scroll_depth_pct INTEGER,
  dwell_seconds INTEGER,
  -- Geo / eligibility
  country_code TEXT,
  is_eligible BOOLEAN DEFAULT TRUE,
  -- Free-form for prototyping
  metadata JSONB
);

CREATE INDEX idx_events_anonymous_id ON cdp_events(anonymous_id);
CREATE INDEX idx_events_user_id ON cdp_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_events_occurred_at ON cdp_events(occurred_at DESC);
CREATE INDEX idx_events_type_time ON cdp_events(event_type, occurred_at DESC);
CREATE INDEX idx_events_session ON cdp_events(session_id);

-- ============================================================================
-- IDENTITY GRAPH — links anonymous_ids to user_ids over time
-- ============================================================================

CREATE TABLE cdp_identity_graph (
  id BIGSERIAL PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(anonymous_id, user_id)
);

CREATE INDEX idx_identity_anon ON cdp_identity_graph(anonymous_id);
CREATE INDEX idx_identity_user ON cdp_identity_graph(user_id);

-- ============================================================================
-- USER PROFILES — derived state, one row per identity (anon or known)
-- ============================================================================

CREATE TABLE cdp_user_profiles (
  -- Primary identity: prefer user_id when known, otherwise anonymous_id
  identity_key TEXT PRIMARY KEY,         -- "anon:abc123" or "user:u_456"
  anonymous_id TEXT,
  user_id TEXT,
  is_known BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lifecycle timestamps
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ,
  first_purchase_at TIMESTAMPTZ,
  -- Behavioral counters
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_page_views INTEGER NOT NULL DEFAULT 0,
  total_game_views INTEGER NOT NULL DEFAULT 0,
  total_cart_adds INTEGER NOT NULL DEFAULT 0,
  total_purchases INTEGER NOT NULL DEFAULT 0,
  -- Most recent state
  current_cart_value_aed NUMERIC(10,2) DEFAULT 0,
  has_active_cart BOOLEAN NOT NULL DEFAULT FALSE,
  has_started_registration BOOLEAN NOT NULL DEFAULT FALSE,
  registration_drop_off_step TEXT,
  -- Engagement
  total_dwell_seconds INTEGER NOT NULL DEFAULT 0,
  max_scroll_depth_pct INTEGER NOT NULL DEFAULT 0,
  -- Game affinity (sub-attribute for V2)
  preferred_game TEXT,
  -- Geo
  country_code TEXT,
  is_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  -- Current segment assignment (priority-resolved)
  current_segment cdp_segment_type NOT NULL DEFAULT 'unassigned',
  segment_entered_at TIMESTAMPTZ,
  previous_segment cdp_segment_type,
  -- Audit
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_segment ON cdp_user_profiles(current_segment);
CREATE INDEX idx_profiles_last_seen ON cdp_user_profiles(last_seen_at DESC);
CREATE INDEX idx_profiles_anon ON cdp_user_profiles(anonymous_id);
CREATE INDEX idx_profiles_user ON cdp_user_profiles(user_id);

-- ============================================================================
-- SEGMENT MEMBERSHIP — historical record of segment assignments over time
-- ============================================================================

CREATE TABLE cdp_segment_membership (
  id BIGSERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL REFERENCES cdp_user_profiles(identity_key) ON DELETE CASCADE,
  segment cdp_segment_type NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_membership_identity ON cdp_segment_membership(identity_key);
CREATE INDEX idx_membership_segment ON cdp_segment_membership(segment) WHERE is_current;
CREATE INDEX idx_membership_current ON cdp_segment_membership(is_current) WHERE is_current;

-- ============================================================================
-- ACTIVATIONS — outbound signals to channels (Meta, Google, onsite, etc.)
-- ============================================================================

CREATE TABLE cdp_activations (
  id BIGSERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL,
  segment cdp_segment_type NOT NULL,
  channel cdp_activation_channel NOT NULL,
  status cdp_activation_status NOT NULL DEFAULT 'queued',
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  -- What was sent (for debugging / preview)
  payload JSONB,
  error_message TEXT
);

CREATE INDEX idx_activations_triggered ON cdp_activations(triggered_at DESC);
CREATE INDEX idx_activations_channel ON cdp_activations(channel);
CREATE INDEX idx_activations_status ON cdp_activations(status);

-- ============================================================================
-- HELPER VIEW: current segment sizes (for dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW cdp_segment_sizes AS
SELECT
  current_segment AS segment,
  COUNT(*) AS user_count,
  COUNT(*) FILTER (WHERE is_known) AS known_users,
  COUNT(*) FILTER (WHERE NOT is_known) AS anonymous_users,
  AVG(total_sessions)::NUMERIC(10,1) AS avg_sessions,
  AVG(total_page_views)::NUMERIC(10,1) AS avg_page_views,
  SUM(current_cart_value_aed)::NUMERIC(12,2) AS total_cart_value_aed
FROM cdp_user_profiles
GROUP BY current_segment;

-- ============================================================================
-- ENABLE REALTIME — allows the dashboard to subscribe to live updates
-- ============================================================================
-- After running this script, go to Supabase Dashboard → Database → Replication
-- and enable replication for: cdp_user_profiles, cdp_activations
-- That powers the live dashboard updates.
-- ============================================================================

-- Allow public read access for the prototype (loosen for production)
ALTER TABLE cdp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_segment_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdp_identity_graph ENABLE ROW LEVEL SECURITY;

-- Prototype policy: allow read access to anon role (for dashboard)
-- Writes go through API routes using the service role key
CREATE POLICY "anon_read_events" ON cdp_events FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_profiles" ON cdp_user_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_membership" ON cdp_segment_membership FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_activations" ON cdp_activations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_identity" ON cdp_identity_graph FOR SELECT TO anon USING (true);

-- Done.
SELECT 'CDP schema created successfully' AS status;
