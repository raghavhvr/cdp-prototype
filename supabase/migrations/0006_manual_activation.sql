-- ============================================================================
-- Migration 0006 — Manual Activation Support
-- ============================================================================
-- Adds: expanded channel list, trigger_source tracking, campaign metadata,
-- and a settings table for feature toggles (e.g., auto-fire on segmentation).
--
-- Run this AFTER 0005. Safe to re-run.
-- ============================================================================

-- Expand the channel enum to support more platforms
ALTER TYPE cdp_activation_channel ADD VALUE IF NOT EXISTS 'snapchat';
ALTER TYPE cdp_activation_channel ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE cdp_activation_channel ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE cdp_activation_channel ADD VALUE IF NOT EXISTS 'youtube';
ALTER TYPE cdp_activation_channel ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE cdp_activation_channel ADD VALUE IF NOT EXISTS 'email_marketing';

-- Track whether an activation was fired automatically by segmentation or
-- manually triggered by a marketer. Critical for distinguishing intent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdp_activations' AND column_name = 'trigger_source'
  ) THEN
    ALTER TABLE cdp_activations
      ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'auto'
      CHECK (trigger_source IN ('auto', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdp_activations' AND column_name = 'campaign_name'
  ) THEN
    ALTER TABLE cdp_activations ADD COLUMN campaign_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdp_activations' AND column_name = 'creative_id'
  ) THEN
    ALTER TABLE cdp_activations ADD COLUMN creative_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdp_activations' AND column_name = 'audience_size'
  ) THEN
    ALTER TABLE cdp_activations ADD COLUMN audience_size INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdp_activations' AND column_name = 'audience_filters'
  ) THEN
    ALTER TABLE cdp_activations ADD COLUMN audience_filters JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activations_trigger ON cdp_activations(trigger_source);

-- Settings table for feature toggles
CREATE TABLE IF NOT EXISTS cdp_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default toggle: auto-fire activations during segmentation runs (ON by default)
INSERT INTO cdp_settings (key, value)
VALUES ('auto_fire_activations', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS: allow read access to anon (so dashboard can display toggle state)
ALTER TABLE cdp_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cdp_settings' AND policyname = 'anon_read_settings'
  ) THEN
    CREATE POLICY "anon_read_settings" ON cdp_settings FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Helper function: read a setting with a default
CREATE OR REPLACE FUNCTION cdp_get_setting(p_key TEXT, p_default JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v JSONB;
BEGIN
  SELECT value INTO v FROM cdp_settings WHERE key = p_key;
  RETURN COALESCE(v, p_default);
END;
$$;

-- ----------------------------------------------------------------
-- Update run_segmentation() to respect the auto-fire toggle
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_segmentation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s'
AS $$
DECLARE
  v_profiles_processed INTEGER;
  v_segment_changes INTEGER;
  v_segment_sizes JSONB;
  v_attribute_distribution JSONB;
  v_started_at TIMESTAMPTZ := NOW();
  v_auto_fire BOOLEAN := TRUE;
BEGIN
  -- Read the auto-fire toggle (defaults to true if missing)
  SELECT (cdp_get_setting('auto_fire_activations', 'true'::jsonb))::boolean
    INTO v_auto_fire;

  -- ----------------------------------------------------------------
  -- STEP 1: Single-pass aggregation (unchanged from 0005)
  -- ----------------------------------------------------------------
  CREATE TEMP TABLE _user_aggregates ON COMMIT DROP AS
  WITH event_stats AS (
    SELECT
      anonymous_id,
      MAX(user_id) AS user_id,
      MIN(occurred_at) AS first_seen_at,
      MAX(occurred_at) AS last_seen_at,
      MIN(occurred_at) FILTER (WHERE event_type = 'registration_complete') AS registered_at,
      MIN(occurred_at) FILTER (WHERE event_type = 'purchase') AS first_purchase_at,
      COUNT(DISTINCT session_id) AS total_sessions,
      COUNT(*) FILTER (WHERE event_type = 'page_view') AS total_page_views,
      COUNT(*) FILTER (WHERE event_type = 'game_view') AS total_game_views,
      COUNT(*) FILTER (WHERE event_type = 'cart_add') AS total_cart_adds,
      COUNT(*) FILTER (WHERE event_type = 'purchase') AS total_purchases,
      COUNT(*) FILTER (WHERE event_type IN ('results_view', 'winners_view')) AS validator_views,
      COUNT(*) FILTER (
        WHERE event_type = 'promo_view' OR page_category = 'promo'
      ) AS promo_views,
      COUNT(*) FILTER (
        WHERE event_type IN ('registration_start', 'registration_step')
      ) AS reg_progression_events,
      COUNT(*) FILTER (WHERE event_type = 'registration_complete') AS reg_completions,
      COALESCE(SUM(dwell_seconds), 0) AS total_dwell_seconds,
      COALESCE(MAX(scroll_depth_pct), 0) AS max_scroll_depth_pct,
      MAX(country_code) AS country_code,
      BOOL_AND(is_eligible) AS is_eligible
    FROM cdp_events
    GROUP BY anonymous_id
  ),
  recent_cart AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id, cart_value_aed, occurred_at AS cart_added_at
    FROM cdp_events
    WHERE event_type = 'cart_add' AND occurred_at > NOW() - INTERVAL '7 days'
    ORDER BY anonymous_id, occurred_at DESC
  ),
  recent_purchase AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id, occurred_at AS purchased_at
    FROM cdp_events
    WHERE event_type = 'purchase'
    ORDER BY anonymous_id, occurred_at DESC
  ),
  last_reg_step AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id, registration_step
    FROM cdp_events
    WHERE registration_step IS NOT NULL
    ORDER BY anonymous_id, occurred_at DESC
  ),
  preferred_games AS (
    SELECT DISTINCT ON (anonymous_id) anonymous_id, game_name AS preferred_game
    FROM (
      SELECT anonymous_id, game_name, COUNT(*) AS view_count
      FROM cdp_events
      WHERE game_name IS NOT NULL
      GROUP BY anonymous_id, game_name
    ) ranked
    ORDER BY anonymous_id, view_count DESC
  )
  SELECT
    es.anonymous_id, es.user_id, es.first_seen_at, es.last_seen_at,
    es.registered_at, es.first_purchase_at, es.total_sessions,
    es.total_page_views, es.total_game_views, es.total_cart_adds,
    es.total_purchases, es.validator_views, es.promo_views,
    es.reg_progression_events, es.reg_completions, es.total_dwell_seconds,
    es.max_scroll_depth_pct, es.country_code, es.is_eligible,
    COALESCE(rc.cart_value_aed, 0) AS current_cart_value_aed,
    (rc.cart_added_at IS NOT NULL
      AND (rp.purchased_at IS NULL OR rp.purchased_at < rc.cart_added_at)
    ) AS has_active_cart,
    (es.reg_progression_events > 0 AND es.reg_completions = 0) AS has_started_registration,
    lrs.registration_step AS registration_drop_off_step,
    pg.preferred_game
  FROM event_stats es
  LEFT JOIN recent_cart rc ON rc.anonymous_id = es.anonymous_id
  LEFT JOIN recent_purchase rp ON rp.anonymous_id = es.anonymous_id
  LEFT JOIN last_reg_step lrs ON lrs.anonymous_id = es.anonymous_id
  LEFT JOIN preferred_games pg ON pg.anonymous_id = es.anonymous_id;

  CREATE INDEX ON _user_aggregates (anonymous_id);

  -- ----------------------------------------------------------------
  -- STEP 2: Upsert profiles (unchanged from 0005)
  -- ----------------------------------------------------------------
  INSERT INTO cdp_user_profiles (
    identity_key, anonymous_id, user_id, is_known,
    first_seen_at, last_seen_at, registered_at, first_purchase_at,
    total_sessions, total_page_views, total_game_views,
    total_cart_adds, total_purchases,
    current_cart_value_aed, has_active_cart,
    has_started_registration, registration_drop_off_step,
    total_dwell_seconds, max_scroll_depth_pct,
    preferred_game, country_code, is_eligible
  )
  SELECT
    CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id ELSE 'anon:' || anonymous_id END,
    anonymous_id, user_id, user_id IS NOT NULL,
    first_seen_at, last_seen_at, registered_at, first_purchase_at,
    total_sessions, total_page_views, total_game_views,
    total_cart_adds, total_purchases,
    current_cart_value_aed, has_active_cart,
    has_started_registration, registration_drop_off_step,
    total_dwell_seconds, max_scroll_depth_pct,
    preferred_game, country_code, is_eligible
  FROM _user_aggregates
  ON CONFLICT (identity_key) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    registered_at = COALESCE(cdp_user_profiles.registered_at, EXCLUDED.registered_at),
    first_purchase_at = COALESCE(cdp_user_profiles.first_purchase_at, EXCLUDED.first_purchase_at),
    total_sessions = EXCLUDED.total_sessions,
    total_page_views = EXCLUDED.total_page_views,
    total_game_views = EXCLUDED.total_game_views,
    total_cart_adds = EXCLUDED.total_cart_adds,
    total_purchases = EXCLUDED.total_purchases,
    current_cart_value_aed = EXCLUDED.current_cart_value_aed,
    has_active_cart = EXCLUDED.has_active_cart,
    has_started_registration = EXCLUDED.has_started_registration,
    registration_drop_off_step = EXCLUDED.registration_drop_off_step,
    total_dwell_seconds = EXCLUDED.total_dwell_seconds,
    max_scroll_depth_pct = EXCLUDED.max_scroll_depth_pct,
    preferred_game = EXCLUDED.preferred_game,
    country_code = EXCLUDED.country_code,
    is_eligible = EXCLUDED.is_eligible,
    is_known = EXCLUDED.is_known,
    user_id = EXCLUDED.user_id,
    updated_at = NOW();

  -- ----------------------------------------------------------------
  -- STEP 3: Compute attributes
  -- ----------------------------------------------------------------
  UPDATE cdp_user_profiles p
  SET user_attributes = jsonb_build_object(
    'game_affinity', COALESCE(p.preferred_game, 'none'),
    'price_tier', CASE
      WHEN p.current_cart_value_aed >= 200 THEN 'high'
      WHEN p.current_cart_value_aed >= 75 THEN 'mid'
      WHEN p.current_cart_value_aed > 0 THEN 'low'
      ELSE 'unknown' END,
    'recency', CASE
      WHEN p.last_seen_at > NOW() - INTERVAL '3 days' THEN 'fresh'
      WHEN p.last_seen_at > NOW() - INTERVAL '14 days' THEN 'recent'
      ELSE 'stale' END,
    'visit_frequency', CASE
      WHEN p.total_sessions >= 3 THEN 'high'
      WHEN p.total_sessions >= 2 THEN 'multiple'
      ELSE 'single' END,
    'validator_behavior', CASE WHEN COALESCE(ua.validator_views, 0) > 0 THEN 'yes' ELSE 'no' END,
    'promo_engaged',      CASE WHEN COALESCE(ua.promo_views, 0) > 0      THEN 'yes' ELSE 'no' END,
    'engagement_depth', CASE
      WHEN p.total_dwell_seconds >= 300 OR p.max_scroll_depth_pct >= 75 THEN 'deep'
      WHEN p.total_dwell_seconds >= 60  OR p.max_scroll_depth_pct >= 40 THEN 'medium'
      ELSE 'shallow' END
  ),
  updated_at = NOW()
  FROM _user_aggregates ua
  WHERE p.anonymous_id = ua.anonymous_id;

  -- ----------------------------------------------------------------
  -- STEP 4: Priority-based segment assignment (unchanged from 0005)
  -- ----------------------------------------------------------------
  UPDATE cdp_user_profiles p
  SET
    previous_segment = current_segment,
    current_segment = CASE
      WHEN NOT p.is_eligible THEN 'ineligible'::cdp_segment_type
      WHEN p.total_purchases > 0 AND p.last_seen_at < NOW() - INTERVAL '30 days'
        THEN 'lapsed_customer'::cdp_segment_type
      WHEN p.total_purchases > 0 THEN 'converted'::cdp_segment_type
      WHEN p.has_active_cart AND p.current_cart_value_aed > 200
        THEN 'abandoned_cart_high_value'::cdp_segment_type
      WHEN p.has_active_cart THEN 'abandoned_cart_standard'::cdp_segment_type
      WHEN p.has_started_registration AND p.registration_drop_off_step = 'otp'
        THEN 'reg_drop_otp'::cdp_segment_type
      WHEN p.has_started_registration AND p.registration_drop_off_step = 'personal_details'
        THEN 'reg_drop_details'::cdp_segment_type
      WHEN p.has_started_registration AND p.registration_drop_off_step = 'eligibility'
        THEN 'reg_drop_eligibility'::cdp_segment_type
      WHEN p.has_started_registration THEN 'started_registration'::cdp_segment_type
      WHEN p.total_sessions >= 2 AND p.total_dwell_seconds >= 60
        AND p.total_game_views >= 1 AND NOT p.is_known
        THEN 'high_intent_anonymous'::cdp_segment_type
      WHEN p.total_purchases = 0 AND COALESCE(ua.promo_views, 0) > 0
        THEN 'promo_viewer'::cdp_segment_type
      WHEN p.total_purchases = 0 AND COALESCE(ua.validator_views, 0) >= 2
        THEN 'winner_validator'::cdp_segment_type
      WHEN p.total_sessions >= 3 AND p.total_purchases = 0
        AND NOT p.has_active_cart AND NOT p.has_started_registration
        THEN 'repeat_visitor_high'::cdp_segment_type
      WHEN p.total_sessions >= 8 AND p.last_seen_at < NOW() - INTERVAL '7 days'
        AND p.total_purchases = 0
        THEN 'suppression_refresh'::cdp_segment_type
      WHEN p.total_sessions >= 4 AND p.total_purchases = 0
        THEN 'suppression_cooldown'::cdp_segment_type
      WHEN p.total_page_views >= 2 AND p.total_dwell_seconds >= 45
        THEN 'engaged_browser'::cdp_segment_type
      WHEN p.total_page_views <= 1 OR p.total_dwell_seconds < 30
        THEN 'low_engagement'::cdp_segment_type
      ELSE 'unassigned'::cdp_segment_type
    END,
    segment_entered_at = CASE
      WHEN current_segment IS DISTINCT FROM (
        CASE
          WHEN NOT p.is_eligible THEN 'ineligible'::cdp_segment_type
          WHEN p.total_purchases > 0 AND p.last_seen_at < NOW() - INTERVAL '30 days'
            THEN 'lapsed_customer'::cdp_segment_type
          WHEN p.total_purchases > 0 THEN 'converted'::cdp_segment_type
          WHEN p.has_active_cart AND p.current_cart_value_aed > 200
            THEN 'abandoned_cart_high_value'::cdp_segment_type
          WHEN p.has_active_cart THEN 'abandoned_cart_standard'::cdp_segment_type
          WHEN p.has_started_registration AND p.registration_drop_off_step = 'otp'
            THEN 'reg_drop_otp'::cdp_segment_type
          WHEN p.has_started_registration AND p.registration_drop_off_step = 'personal_details'
            THEN 'reg_drop_details'::cdp_segment_type
          WHEN p.has_started_registration AND p.registration_drop_off_step = 'eligibility'
            THEN 'reg_drop_eligibility'::cdp_segment_type
          WHEN p.has_started_registration THEN 'started_registration'::cdp_segment_type
          WHEN p.total_sessions >= 2 AND p.total_dwell_seconds >= 60
            AND p.total_game_views >= 1 AND NOT p.is_known
            THEN 'high_intent_anonymous'::cdp_segment_type
          WHEN p.total_purchases = 0 AND COALESCE(ua.promo_views, 0) > 0
            THEN 'promo_viewer'::cdp_segment_type
          WHEN p.total_purchases = 0 AND COALESCE(ua.validator_views, 0) >= 2
            THEN 'winner_validator'::cdp_segment_type
          WHEN p.total_sessions >= 3 AND p.total_purchases = 0
            AND NOT p.has_active_cart AND NOT p.has_started_registration
            THEN 'repeat_visitor_high'::cdp_segment_type
          WHEN p.total_sessions >= 8 AND p.last_seen_at < NOW() - INTERVAL '7 days'
            AND p.total_purchases = 0
            THEN 'suppression_refresh'::cdp_segment_type
          WHEN p.total_sessions >= 4 AND p.total_purchases = 0
            THEN 'suppression_cooldown'::cdp_segment_type
          WHEN p.total_page_views >= 2 AND p.total_dwell_seconds >= 45
            THEN 'engaged_browser'::cdp_segment_type
          WHEN p.total_page_views <= 1 OR p.total_dwell_seconds < 30
            THEN 'low_engagement'::cdp_segment_type
          ELSE 'unassigned'::cdp_segment_type
        END
      ) THEN NOW()
      ELSE segment_entered_at
    END,
    updated_at = NOW()
  FROM _user_aggregates ua
  WHERE p.anonymous_id = ua.anonymous_id;

  -- ----------------------------------------------------------------
  -- STEP 5: Membership history
  -- ----------------------------------------------------------------
  UPDATE cdp_segment_membership
  SET is_current = FALSE, exited_at = NOW()
  WHERE is_current = TRUE
  AND identity_key IN (
    SELECT identity_key FROM cdp_user_profiles
    WHERE previous_segment IS DISTINCT FROM current_segment
  );

  INSERT INTO cdp_segment_membership (identity_key, segment, entered_at, is_current)
  SELECT identity_key, current_segment, NOW(), TRUE
  FROM cdp_user_profiles
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment != 'unassigned';

  -- ----------------------------------------------------------------
  -- STEP 6: Auto-fire activations (only if toggle is ON)
  -- ----------------------------------------------------------------
  IF v_auto_fire THEN
    WITH changed_users AS (
      SELECT identity_key, current_segment, user_attributes,
             current_cart_value_aed, registration_drop_off_step
      FROM cdp_user_profiles
      WHERE previous_segment IS DISTINCT FROM current_segment
      AND current_segment IN (
        'abandoned_cart_high_value', 'abandoned_cart_standard',
        'reg_drop_otp', 'reg_drop_details', 'reg_drop_eligibility',
        'started_registration', 'high_intent_anonymous',
        'promo_viewer', 'winner_validator', 'repeat_visitor_high',
        'engaged_browser'
      )
      LIMIT 2000
    )
    INSERT INTO cdp_activations (
      identity_key, segment, channel, status, trigger_source, payload
    )
    SELECT
      cu.identity_key, cu.current_segment,
      channel::cdp_activation_channel,
      'simulated'::cdp_activation_status,
      'auto',
      jsonb_build_object(
        'identity_key', cu.identity_key,
        'segment', cu.current_segment,
        'attributes', cu.user_attributes,
        'cart_value_aed', cu.current_cart_value_aed,
        'drop_off_step', cu.registration_drop_off_step,
        'sent_at', NOW()
      )
    FROM changed_users cu
    CROSS JOIN (VALUES ('meta'), ('google_ads')) AS channels(channel);

    INSERT INTO cdp_activations (
      identity_key, segment, channel, status, trigger_source, payload
    )
    SELECT
      identity_key, current_segment, 'onsite_modal'::cdp_activation_channel,
      'simulated'::cdp_activation_status, 'auto',
      jsonb_build_object('identity_key', identity_key,
        'attributes', user_attributes, 'trigger', 'exit_intent')
    FROM cdp_user_profiles
    WHERE previous_segment IS DISTINCT FROM current_segment
    AND current_segment IN ('high_intent_anonymous', 'winner_validator', 'promo_viewer')
    LIMIT 1000;

    INSERT INTO cdp_activations (
      identity_key, segment, channel, status, trigger_source, payload
    )
    SELECT
      identity_key, current_segment, 'email_crm'::cdp_activation_channel,
      'simulated'::cdp_activation_status, 'auto',
      jsonb_build_object('identity_key', identity_key,
        'attributes', user_attributes, 'campaign', 'win_back')
    FROM cdp_user_profiles
    WHERE previous_segment IS DISTINCT FROM current_segment
    AND current_segment = 'lapsed_customer'
    LIMIT 1000;
  END IF;

  -- ----------------------------------------------------------------
  -- STEP 7: Stats
  -- ----------------------------------------------------------------
  SELECT COUNT(*) INTO v_profiles_processed FROM cdp_user_profiles;
  SELECT COUNT(*) INTO v_segment_changes
    FROM cdp_user_profiles WHERE previous_segment IS DISTINCT FROM current_segment;

  SELECT jsonb_object_agg(current_segment, user_count) INTO v_segment_sizes
  FROM (SELECT current_segment, COUNT(*) AS user_count FROM cdp_user_profiles GROUP BY 1) sizes;

  SELECT jsonb_build_object(
    'game_affinity',   (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'game_affinity' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'price_tier',      (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'price_tier' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'recency',         (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'recency' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'visit_frequency', (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'visit_frequency' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t)
  ) INTO v_attribute_distribution;

  RETURN jsonb_build_object(
    'profiles_processed', v_profiles_processed,
    'segment_changes', v_segment_changes,
    'segment_sizes', v_segment_sizes,
    'attribute_distribution', v_attribute_distribution,
    'auto_fire_enabled', v_auto_fire,
    'duration_ms', EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION run_segmentation() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cdp_get_setting(TEXT, JSONB) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- Function: manual audience push
-- ----------------------------------------------------------------
-- Activates a filtered audience to multiple channels. Returns the count of
-- activations queued per channel.
CREATE OR REPLACE FUNCTION push_audience(
  p_segment TEXT,                  -- segment key, or NULL for "any segment"
  p_attribute_filters JSONB,       -- e.g. {"game_affinity":["mega7","easy6"], "price_tier":["high"]}
  p_channels TEXT[],               -- e.g. ARRAY['meta','snapchat','tiktok']
  p_campaign_name TEXT,
  p_creative_id TEXT,
  p_max_users INTEGER DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '60s'
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_audience_size INTEGER;
  v_filter_keys TEXT[];
  v_key TEXT;
  v_clauses TEXT := '';
  v_sql TEXT;
  v_channel TEXT;
BEGIN
  -- Build dynamic WHERE clause from JSONB attribute filters.
  -- Each top-level key becomes: user_attributes->>'KEY' = ANY(VALUES_ARRAY)
  IF p_attribute_filters IS NOT NULL AND p_attribute_filters != '{}'::jsonb THEN
    SELECT array_agg(k) INTO v_filter_keys
    FROM jsonb_object_keys(p_attribute_filters) AS k;

    FOREACH v_key IN ARRAY v_filter_keys LOOP
      v_clauses := v_clauses || format(
        ' AND user_attributes->>%L = ANY (SELECT jsonb_array_elements_text(%L::jsonb))',
        v_key,
        p_attribute_filters->v_key
      );
    END LOOP;
  END IF;

  -- Compute audience size first (for the activation payload)
  v_sql := format(
    'SELECT COUNT(*) FROM cdp_user_profiles WHERE TRUE %s %s',
    CASE
      WHEN p_segment IS NULL OR p_segment = '' THEN ''
      ELSE format(' AND current_segment = %L::cdp_segment_type', p_segment)
    END,
    v_clauses
  );
  EXECUTE v_sql INTO v_audience_size;

  -- Cap it to p_max_users
  v_audience_size := LEAST(v_audience_size, p_max_users);

  -- For each channel, insert one activation per matching user
  FOREACH v_channel IN ARRAY p_channels LOOP
    v_sql := format(
      'INSERT INTO cdp_activations (
        identity_key, segment, channel, status, trigger_source,
        campaign_name, creative_id, audience_size, audience_filters, payload
      )
      SELECT
        identity_key, current_segment,
        %L::cdp_activation_channel,
        ''sent''::cdp_activation_status,
        ''manual'',
        %L, %L, %s, %L::jsonb,
        jsonb_build_object(
          ''identity_key'', identity_key,
          ''segment'', current_segment,
          ''attributes'', user_attributes,
          ''campaign_name'', %L,
          ''creative_id'', %L,
          ''sent_at'', NOW()
        )
      FROM cdp_user_profiles
      WHERE TRUE %s %s
      LIMIT %s',
      v_channel,
      p_campaign_name, p_creative_id, v_audience_size,
      COALESCE(p_attribute_filters, '{}'::jsonb),
      p_campaign_name, p_creative_id,
      CASE
        WHEN p_segment IS NULL OR p_segment = '' THEN ''
        ELSE format(' AND current_segment = %L::cdp_segment_type', p_segment)
      END,
      v_clauses,
      p_max_users
    );
    EXECUTE v_sql;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END LOOP;

  RETURN jsonb_build_object(
    'audience_size', v_audience_size,
    'channels_pushed', p_channels,
    'campaign_name', p_campaign_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION push_audience(TEXT, JSONB, TEXT[], TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- Function: preview audience size given filters
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION preview_audience(
  p_segment TEXT,
  p_attribute_filters JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET statement_timeout = '30s'
AS $$
DECLARE
  v_count INTEGER;
  v_filter_keys TEXT[];
  v_key TEXT;
  v_clauses TEXT := '';
  v_sql TEXT;
  v_samples JSONB;
BEGIN
  IF p_attribute_filters IS NOT NULL AND p_attribute_filters != '{}'::jsonb THEN
    SELECT array_agg(k) INTO v_filter_keys
    FROM jsonb_object_keys(p_attribute_filters) AS k;

    FOREACH v_key IN ARRAY v_filter_keys LOOP
      v_clauses := v_clauses || format(
        ' AND user_attributes->>%L = ANY (SELECT jsonb_array_elements_text(%L::jsonb))',
        v_key,
        p_attribute_filters->v_key
      );
    END LOOP;
  END IF;

  v_sql := format(
    'SELECT COUNT(*) FROM cdp_user_profiles WHERE TRUE %s %s',
    CASE
      WHEN p_segment IS NULL OR p_segment = '' THEN ''
      ELSE format(' AND current_segment = %L::cdp_segment_type', p_segment)
    END,
    v_clauses
  );
  EXECUTE v_sql INTO v_count;

  v_sql := format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (
      SELECT identity_key, current_segment, user_attributes,
             total_sessions, total_page_views, current_cart_value_aed,
             preferred_game, country_code, last_seen_at
      FROM cdp_user_profiles
      WHERE TRUE %s %s
      ORDER BY last_seen_at DESC
      LIMIT 5
    ) t',
    CASE
      WHEN p_segment IS NULL OR p_segment = '' THEN ''
      ELSE format(' AND current_segment = %L::cdp_segment_type', p_segment)
    END,
    v_clauses
  );
  EXECUTE v_sql INTO v_samples;

  RETURN jsonb_build_object('count', v_count, 'samples', v_samples);
END;
$$;

GRANT EXECUTE ON FUNCTION preview_audience(TEXT, JSONB) TO anon, authenticated, service_role;

SELECT 'Migration 0006 applied: manual activation, expanded channels, settings' AS status;
