-- ============================================================================
-- Migration 0005 — Performance-Optimized Segmentation
-- ============================================================================
-- Replaces run_segmentation() with a version that handles larger datasets
-- (5K+ users, 25K+ events) without hitting statement timeouts.
--
-- Two key changes:
-- 1. Increases statement timeout for this function to 5 minutes (safe — function
--    runs on demand from admin panel, not in a hot path).
-- 2. Replaces correlated subqueries with single-pass aggregations using CTEs.
--    This turns O(users × events) work into O(events) work.
--
-- Run this AFTER 0004. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION run_segmentation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s'  -- 5 minutes, plenty of headroom
AS $$
DECLARE
  v_profiles_processed INTEGER;
  v_segment_changes INTEGER;
  v_segment_sizes JSONB;
  v_attribute_distribution JSONB;
  v_started_at TIMESTAMPTZ := NOW();
BEGIN
  -- ----------------------------------------------------------------
  -- STEP 1: Single-pass aggregation of all event-derived metrics
  -- ----------------------------------------------------------------
  -- This CTE computes everything we need from cdp_events in one scan,
  -- producing one row per anonymous_id with all aggregates pre-computed.
  -- Subsequent steps read from this temp table, NOT cdp_events directly.
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
  -- Most recent cart_add value (within 7 days) per user
  recent_cart AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id,
      cart_value_aed,
      occurred_at AS cart_added_at
    FROM cdp_events
    WHERE event_type = 'cart_add'
    AND occurred_at > NOW() - INTERVAL '7 days'
    ORDER BY anonymous_id, occurred_at DESC
  ),
  -- Most recent purchase per user (any time)
  recent_purchase AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id,
      occurred_at AS purchased_at
    FROM cdp_events
    WHERE event_type = 'purchase'
    ORDER BY anonymous_id, occurred_at DESC
  ),
  -- Most recent registration step per user
  last_reg_step AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id,
      registration_step
    FROM cdp_events
    WHERE registration_step IS NOT NULL
    ORDER BY anonymous_id, occurred_at DESC
  ),
  -- Most-viewed game per user (preferred_game)
  preferred_games AS (
    SELECT DISTINCT ON (anonymous_id)
      anonymous_id,
      game_name AS preferred_game
    FROM (
      SELECT anonymous_id, game_name, COUNT(*) AS view_count
      FROM cdp_events
      WHERE game_name IS NOT NULL
      GROUP BY anonymous_id, game_name
    ) ranked
    ORDER BY anonymous_id, view_count DESC
  )
  SELECT
    es.anonymous_id,
    es.user_id,
    es.first_seen_at,
    es.last_seen_at,
    es.registered_at,
    es.first_purchase_at,
    es.total_sessions,
    es.total_page_views,
    es.total_game_views,
    es.total_cart_adds,
    es.total_purchases,
    es.validator_views,
    es.promo_views,
    es.reg_progression_events,
    es.reg_completions,
    es.total_dwell_seconds,
    es.max_scroll_depth_pct,
    es.country_code,
    es.is_eligible,
    -- Cart state: active if added in last 7d AND no purchase since cart_add
    COALESCE(rc.cart_value_aed, 0) AS current_cart_value_aed,
    (
      rc.cart_added_at IS NOT NULL
      AND (rp.purchased_at IS NULL OR rp.purchased_at < rc.cart_added_at)
    ) AS has_active_cart,
    -- Started registration but didn't finish
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
  -- STEP 2: Upsert profiles from aggregates (single batch)
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
    anonymous_id,
    user_id,
    user_id IS NOT NULL,
    first_seen_at,
    last_seen_at,
    registered_at,
    first_purchase_at,
    total_sessions,
    total_page_views,
    total_game_views,
    total_cart_adds,
    total_purchases,
    current_cart_value_aed,
    has_active_cart,
    has_started_registration,
    registration_drop_off_step,
    total_dwell_seconds,
    max_scroll_depth_pct,
    preferred_game,
    country_code,
    is_eligible
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
  -- STEP 3: Compute attributes — uses pre-aggregated values, fast
  -- ----------------------------------------------------------------
  UPDATE cdp_user_profiles p
  SET user_attributes = jsonb_build_object(
    'game_affinity', COALESCE(p.preferred_game, 'none'),
    'price_tier', CASE
      WHEN p.current_cart_value_aed >= 200 THEN 'high'
      WHEN p.current_cart_value_aed >= 75 THEN 'mid'
      WHEN p.current_cart_value_aed > 0 THEN 'low'
      ELSE 'unknown'
    END,
    'recency', CASE
      WHEN p.last_seen_at > NOW() - INTERVAL '3 days' THEN 'fresh'
      WHEN p.last_seen_at > NOW() - INTERVAL '14 days' THEN 'recent'
      ELSE 'stale'
    END,
    'visit_frequency', CASE
      WHEN p.total_sessions >= 3 THEN 'high'
      WHEN p.total_sessions >= 2 THEN 'multiple'
      ELSE 'single'
    END,
    'validator_behavior', CASE
      WHEN COALESCE(ua.validator_views, 0) > 0 THEN 'yes'
      ELSE 'no'
    END,
    'promo_engaged', CASE
      WHEN COALESCE(ua.promo_views, 0) > 0 THEN 'yes'
      ELSE 'no'
    END,
    'engagement_depth', CASE
      WHEN p.total_dwell_seconds >= 300 OR p.max_scroll_depth_pct >= 75 THEN 'deep'
      WHEN p.total_dwell_seconds >= 60 OR p.max_scroll_depth_pct >= 40 THEN 'medium'
      ELSE 'shallow'
    END
  ),
  updated_at = NOW()
  FROM _user_aggregates ua
  WHERE p.anonymous_id = ua.anonymous_id;

  -- ----------------------------------------------------------------
  -- STEP 4: Priority-based segment assignment (uses pre-aggregated flags)
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
      WHEN p.total_sessions >= 2
        AND p.total_dwell_seconds >= 60
        AND p.total_game_views >= 1
        AND NOT p.is_known
        THEN 'high_intent_anonymous'::cdp_segment_type
      WHEN p.total_purchases = 0 AND COALESCE(ua.promo_views, 0) > 0
        THEN 'promo_viewer'::cdp_segment_type
      WHEN p.total_purchases = 0 AND COALESCE(ua.validator_views, 0) >= 2
        THEN 'winner_validator'::cdp_segment_type
      WHEN p.total_sessions >= 3
        AND p.total_purchases = 0
        AND NOT p.has_active_cart
        AND NOT p.has_started_registration
        THEN 'repeat_visitor_high'::cdp_segment_type
      WHEN p.total_sessions >= 8
        AND p.last_seen_at < NOW() - INTERVAL '7 days'
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
  -- STEP 5: Track segment membership history (only changed users)
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
  -- STEP 6: Queue activations (only changed users, capped to avoid blowup)
  -- ----------------------------------------------------------------
  -- Cap activations per run at 2000 to keep the queue manageable in demos.
  -- In production this would be batched and rate-limited differently.
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
  INSERT INTO cdp_activations (identity_key, segment, channel, status, payload)
  SELECT
    cu.identity_key,
    cu.current_segment,
    channel::cdp_activation_channel,
    'simulated'::cdp_activation_status,
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

  INSERT INTO cdp_activations (identity_key, segment, channel, status, payload)
  SELECT
    identity_key, current_segment, 'onsite_modal'::cdp_activation_channel,
    'simulated'::cdp_activation_status,
    jsonb_build_object(
      'identity_key', identity_key,
      'attributes', user_attributes,
      'trigger', 'exit_intent'
    )
  FROM cdp_user_profiles
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment IN ('high_intent_anonymous', 'winner_validator', 'promo_viewer')
  LIMIT 1000;

  INSERT INTO cdp_activations (identity_key, segment, channel, status, payload)
  SELECT
    identity_key, current_segment, 'email_crm'::cdp_activation_channel,
    'simulated'::cdp_activation_status,
    jsonb_build_object(
      'identity_key', identity_key,
      'attributes', user_attributes,
      'campaign', 'win_back'
    )
  FROM cdp_user_profiles
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment = 'lapsed_customer'
  LIMIT 1000;

  -- ----------------------------------------------------------------
  -- STEP 7: Stats
  -- ----------------------------------------------------------------
  SELECT COUNT(*) INTO v_profiles_processed FROM cdp_user_profiles;

  SELECT COUNT(*) INTO v_segment_changes
  FROM cdp_user_profiles
  WHERE previous_segment IS DISTINCT FROM current_segment;

  SELECT jsonb_object_agg(current_segment, user_count)
  INTO v_segment_sizes
  FROM (
    SELECT current_segment, COUNT(*) AS user_count
    FROM cdp_user_profiles
    GROUP BY current_segment
  ) sizes;

  SELECT jsonb_build_object(
    'game_affinity',    (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'game_affinity' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'price_tier',       (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'price_tier' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'recency',          (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'recency' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'visit_frequency',  (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'visit_frequency' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t)
  ) INTO v_attribute_distribution;

  RETURN jsonb_build_object(
    'profiles_processed', v_profiles_processed,
    'segment_changes', v_segment_changes,
    'segment_sizes', v_segment_sizes,
    'attribute_distribution', v_attribute_distribution,
    'duration_ms', EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION run_segmentation() TO anon, authenticated, service_role;

SELECT 'Migration 0005 applied: segmentation engine optimized for scale' AS status;
