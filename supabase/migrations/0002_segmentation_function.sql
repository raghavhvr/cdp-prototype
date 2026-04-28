-- ============================================================================
-- Segmentation Engine — Postgres function
-- ============================================================================
-- Encapsulates the full segmentation logic in a single function call.
-- Run this AFTER 0001_initial_schema.sql.
-- The Next.js app calls this via supabase.rpc('run_segmentation').
-- ============================================================================

CREATE OR REPLACE FUNCTION run_segmentation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profiles_processed INTEGER;
  v_segment_changes INTEGER;
  v_segment_sizes JSONB;
  v_started_at TIMESTAMPTZ := NOW();
BEGIN
  -- ----------------------------------------------------------------
  -- STEP 1: Rebuild user_profiles from events
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
    CASE WHEN MAX(user_id) IS NOT NULL THEN 'user:' || MAX(user_id) ELSE 'anon:' || anonymous_id END,
    anonymous_id,
    MAX(user_id),
    BOOL_OR(user_id IS NOT NULL),
    MIN(occurred_at),
    MAX(occurred_at),
    MIN(occurred_at) FILTER (WHERE event_type = 'registration_complete'),
    MIN(occurred_at) FILTER (WHERE event_type = 'purchase'),
    COUNT(DISTINCT session_id),
    COUNT(*) FILTER (WHERE event_type = 'page_view'),
    COUNT(*) FILTER (WHERE event_type = 'game_view'),
    COUNT(*) FILTER (WHERE event_type = 'cart_add'),
    COUNT(*) FILTER (WHERE event_type = 'purchase'),
    COALESCE(
      (SELECT cart_value_aed FROM cdp_events e2
        WHERE e2.anonymous_id = e.anonymous_id
        AND e2.event_type = 'cart_add'
        AND e2.occurred_at > NOW() - INTERVAL '7 days'
        ORDER BY e2.occurred_at DESC LIMIT 1),
      0
    ),
    -- Active cart: most recent cart_add in last 7 days, with no later purchase
    (
      SELECT EXISTS (
        SELECT 1 FROM cdp_events ec
        WHERE ec.anonymous_id = e.anonymous_id
        AND ec.event_type = 'cart_add'
        AND ec.occurred_at > NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM cdp_events ep
          WHERE ep.anonymous_id = ec.anonymous_id
          AND ep.event_type = 'purchase'
          AND ep.occurred_at >= ec.occurred_at
        )
      )
    ),
    -- Started registration but not completed
    (
      SELECT EXISTS (
        SELECT 1 FROM cdp_events er
        WHERE er.anonymous_id = e.anonymous_id
        AND er.event_type IN ('registration_start', 'registration_step')
      ) AND NOT EXISTS (
        SELECT 1 FROM cdp_events erc
        WHERE erc.anonymous_id = e.anonymous_id
        AND erc.event_type = 'registration_complete'
      )
    ),
    -- Last registration step they reached
    (
      SELECT registration_step FROM cdp_events ers
      WHERE ers.anonymous_id = e.anonymous_id
      AND ers.registration_step IS NOT NULL
      ORDER BY ers.occurred_at DESC LIMIT 1
    ),
    COALESCE(SUM(dwell_seconds), 0),
    COALESCE(MAX(scroll_depth_pct), 0),
    -- Preferred game = most-viewed game
    (
      SELECT game_name FROM cdp_events eg
      WHERE eg.anonymous_id = e.anonymous_id
      AND eg.game_name IS NOT NULL
      GROUP BY game_name
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),
    MAX(country_code),
    BOOL_AND(is_eligible)
  FROM cdp_events e
  GROUP BY anonymous_id
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
  -- STEP 2: Priority-based segment assignment
  -- ----------------------------------------------------------------
  UPDATE cdp_user_profiles
  SET
    previous_segment = current_segment,
    current_segment = computed.new_segment,
    segment_entered_at = CASE
      WHEN current_segment IS DISTINCT FROM computed.new_segment THEN NOW()
      ELSE segment_entered_at
    END,
    updated_at = NOW()
  FROM (
    SELECT
      identity_key,
      CASE
        -- P8: Ineligible (geo)
        WHEN NOT is_eligible THEN 'ineligible'::cdp_segment_type
        -- P9: Converted
        WHEN total_purchases > 0 THEN 'converted'::cdp_segment_type
        -- P1: Abandoned cart
        WHEN has_active_cart THEN 'abandoned_cart'::cdp_segment_type
        -- P2: Started registration but not completed
        WHEN has_started_registration THEN 'started_registration'::cdp_segment_type
        -- P3: High intent anonymous
        WHEN total_sessions >= 2
          AND total_dwell_seconds >= 60
          AND total_game_views >= 1
          AND NOT is_known
        THEN 'high_intent_anonymous'::cdp_segment_type
        -- P6: Refresh suppression (long-dormant frequent visitors)
        WHEN total_sessions >= 8
          AND last_seen_at < NOW() - INTERVAL '7 days'
          AND total_purchases = 0
          AND NOT has_started_registration
        THEN 'suppression_refresh'::cdp_segment_type
        -- P5: Cooldown (frequent visitor, no progression)
        WHEN total_sessions >= 4
          AND total_purchases = 0
          AND NOT has_started_registration
          AND NOT has_active_cart
        THEN 'suppression_cooldown'::cdp_segment_type
        -- P4: Engaged browser
        WHEN total_page_views >= 2 AND total_dwell_seconds >= 45
        THEN 'engaged_browser'::cdp_segment_type
        -- P7: Low engagement
        WHEN total_page_views <= 1 OR total_dwell_seconds < 30
        THEN 'low_engagement'::cdp_segment_type
        ELSE 'unassigned'::cdp_segment_type
      END AS new_segment
    FROM cdp_user_profiles
  ) AS computed
  WHERE cdp_user_profiles.identity_key = computed.identity_key;

  -- ----------------------------------------------------------------
  -- STEP 3: Track segment membership history (for users who changed)
  -- ----------------------------------------------------------------
  -- Close out previous memberships for users who changed segments
  UPDATE cdp_segment_membership
  SET is_current = FALSE, exited_at = NOW()
  WHERE is_current = TRUE
  AND identity_key IN (
    SELECT identity_key FROM cdp_user_profiles
    WHERE previous_segment IS DISTINCT FROM current_segment
  );

  -- Insert new memberships for users with new segment assignments
  INSERT INTO cdp_segment_membership (identity_key, segment, entered_at, is_current)
  SELECT identity_key, current_segment, NOW(), TRUE
  FROM cdp_user_profiles
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment != 'unassigned';

  -- ----------------------------------------------------------------
  -- STEP 4: Queue activations for users who entered an activatable segment
  -- ----------------------------------------------------------------
  INSERT INTO cdp_activations (identity_key, segment, channel, status, payload)
  SELECT
    identity_key,
    current_segment,
    channel::cdp_activation_channel,
    'simulated'::cdp_activation_status,
    jsonb_build_object(
      'identity_key', identity_key,
      'segment', current_segment,
      'preferred_game', preferred_game,
      'cart_value_aed', current_cart_value_aed,
      'drop_off_step', registration_drop_off_step,
      'sent_at', NOW()
    )
  FROM cdp_user_profiles
  CROSS JOIN (VALUES ('meta'), ('google_ads')) AS channels(channel)
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment IN ('abandoned_cart', 'started_registration', 'high_intent_anonymous', 'engaged_browser');

  -- Onsite modal activation for high intent
  INSERT INTO cdp_activations (identity_key, segment, channel, status, payload)
  SELECT
    identity_key,
    current_segment,
    'onsite_modal'::cdp_activation_channel,
    'simulated'::cdp_activation_status,
    jsonb_build_object('identity_key', identity_key, 'trigger', 'exit_intent')
  FROM cdp_user_profiles
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment = 'high_intent_anonymous';

  -- ----------------------------------------------------------------
  -- STEP 5: Compute return stats
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

  RETURN jsonb_build_object(
    'profiles_processed', v_profiles_processed,
    'segment_changes', v_segment_changes,
    'segment_sizes', v_segment_sizes,
    'duration_ms', EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000
  );
END;
$$;

-- Grant execute to anon and authenticated roles so the API routes can call it
GRANT EXECUTE ON FUNCTION run_segmentation() TO anon, authenticated, service_role;

-- Reset function for the "Reset Demo Data" button
CREATE OR REPLACE FUNCTION reset_cdp_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE cdp_activations RESTART IDENTITY;
  TRUNCATE cdp_segment_membership RESTART IDENTITY;
  TRUNCATE cdp_user_profiles CASCADE;
  TRUNCATE cdp_identity_graph RESTART IDENTITY;
  TRUNCATE cdp_events RESTART IDENTITY;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_cdp_data() TO anon, authenticated, service_role;

SELECT 'Segmentation function created successfully' AS status;
