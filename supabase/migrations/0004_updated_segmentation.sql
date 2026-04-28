-- ============================================================================
-- Migration 0004 — Updated Segmentation Engine with Sub-Attributes
-- ============================================================================
-- Replaces run_segmentation() with an updated version that:
-- 1. Computes user_attributes (game affinity, price tier, recency, etc.)
-- 2. Uses attributes to drive more granular primary segment assignment
-- 3. Includes new segments (high-value abandoned cart, registration drop steps,
--    promo viewers, winner validators, repeat visitors, lapsed customers)
--
-- Run this AFTER 0003. Safe to re-run.
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
  v_attribute_distribution JSONB;
  v_started_at TIMESTAMPTZ := NOW();
BEGIN
  -- ----------------------------------------------------------------
  -- STEP 1: Rebuild user_profiles from events (unchanged from 0002)
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
    (
      SELECT registration_step FROM cdp_events ers
      WHERE ers.anonymous_id = e.anonymous_id
      AND ers.registration_step IS NOT NULL
      ORDER BY ers.occurred_at DESC LIMIT 1
    ),
    COALESCE(SUM(dwell_seconds), 0),
    COALESCE(MAX(scroll_depth_pct), 0),
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
  -- STEP 2: Compute user_attributes (sub-attributes)
  -- ----------------------------------------------------------------
  -- These are independent from the primary segment and stack with it.
  UPDATE cdp_user_profiles p
  SET user_attributes = jsonb_build_object(
    -- game_affinity: most-viewed game, or 'none'
    'game_affinity', COALESCE(p.preferred_game, 'none'),

    -- price_tier: derived from cart values they engaged with
    'price_tier', CASE
      WHEN p.current_cart_value_aed >= 200 THEN 'high'
      WHEN p.current_cart_value_aed >= 75 THEN 'mid'
      WHEN p.current_cart_value_aed > 0 THEN 'low'
      ELSE 'unknown'
    END,

    -- recency: how recently they were active
    'recency', CASE
      WHEN p.last_seen_at > NOW() - INTERVAL '3 days' THEN 'fresh'
      WHEN p.last_seen_at > NOW() - INTERVAL '14 days' THEN 'recent'
      ELSE 'stale'
    END,

    -- visit_frequency
    'visit_frequency', CASE
      WHEN p.total_sessions >= 3 THEN 'high'
      WHEN p.total_sessions >= 2 THEN 'multiple'
      ELSE 'single'
    END,

    -- validator_behavior: did they look at winners or results?
    'validator_behavior', CASE
      WHEN EXISTS (
        SELECT 1 FROM cdp_events ev
        WHERE ev.anonymous_id = p.anonymous_id
        AND ev.event_type IN ('results_view', 'winners_view')
      ) THEN 'yes' ELSE 'no'
    END,

    -- promo_engaged: did they view a promo page?
    'promo_engaged', CASE
      WHEN EXISTS (
        SELECT 1 FROM cdp_events ev
        WHERE ev.anonymous_id = p.anonymous_id
        AND (ev.event_type = 'promo_view' OR ev.page_category = 'promo')
      ) THEN 'yes' ELSE 'no'
    END,

    -- engagement_depth: composite of dwell + scroll
    'engagement_depth', CASE
      WHEN p.total_dwell_seconds >= 300 OR p.max_scroll_depth_pct >= 75 THEN 'deep'
      WHEN p.total_dwell_seconds >= 60 OR p.max_scroll_depth_pct >= 40 THEN 'medium'
      ELSE 'shallow'
    END
  ),
  updated_at = NOW();

  -- ----------------------------------------------------------------
  -- STEP 3: Priority-based PRIMARY segment assignment
  -- ----------------------------------------------------------------
  -- New, more granular logic. Cart abandonment splits by value.
  -- Registration drop splits by step. New segments for promo viewers,
  -- winner validators, repeat visitors, lapsed customers.
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
        -- P10: Ineligible (geo)
        WHEN NOT is_eligible THEN 'ineligible'::cdp_segment_type

        -- P11: Lapsed Customer (was a customer, now dormant)
        WHEN total_purchases > 0
          AND last_seen_at < NOW() - INTERVAL '30 days'
        THEN 'lapsed_customer'::cdp_segment_type

        -- P12: Converted (active customer, retention)
        WHEN total_purchases > 0 THEN 'converted'::cdp_segment_type

        -- P1: Abandoned Cart — High Value (>AED 200)
        WHEN has_active_cart AND current_cart_value_aed > 200
        THEN 'abandoned_cart_high_value'::cdp_segment_type

        -- P2: Abandoned Cart — Standard (≤AED 200)
        WHEN has_active_cart THEN 'abandoned_cart_standard'::cdp_segment_type

        -- P3: Registration drop at OTP step
        WHEN has_started_registration AND registration_drop_off_step = 'otp'
        THEN 'reg_drop_otp'::cdp_segment_type

        -- P4: Registration drop at personal details step
        WHEN has_started_registration AND registration_drop_off_step = 'personal_details'
        THEN 'reg_drop_details'::cdp_segment_type

        -- P5: Registration drop at eligibility step
        WHEN has_started_registration AND registration_drop_off_step = 'eligibility'
        THEN 'reg_drop_eligibility'::cdp_segment_type

        -- P5b: Registration started but step unknown / fallback
        WHEN has_started_registration THEN 'started_registration'::cdp_segment_type

        -- P6: High intent anonymous
        WHEN total_sessions >= 2
          AND total_dwell_seconds >= 60
          AND total_game_views >= 1
          AND NOT is_known
        THEN 'high_intent_anonymous'::cdp_segment_type

        -- P7: Promo Page Viewer (no purchase)
        WHEN total_purchases = 0
          AND EXISTS (
            SELECT 1 FROM cdp_events ev
            WHERE ev.anonymous_id = cdp_user_profiles.anonymous_id
            AND (ev.event_type = 'promo_view' OR ev.page_category = 'promo')
          )
        THEN 'promo_viewer'::cdp_segment_type

        -- P8: Winner / Results Validator (browsing for credibility)
        WHEN total_purchases = 0
          AND (
            SELECT COUNT(*) FROM cdp_events ev
            WHERE ev.anonymous_id = cdp_user_profiles.anonymous_id
            AND ev.event_type IN ('results_view', 'winners_view')
          ) >= 2
        THEN 'winner_validator'::cdp_segment_type

        -- P9: Repeat Visitor — High Frequency (3+ sessions, no progression)
        WHEN total_sessions >= 3
          AND total_purchases = 0
          AND NOT has_active_cart
          AND NOT has_started_registration
        THEN 'repeat_visitor_high'::cdp_segment_type

        -- P13: Refresh suppression (long-dormant frequent visitors)
        WHEN total_sessions >= 8
          AND last_seen_at < NOW() - INTERVAL '7 days'
          AND total_purchases = 0
        THEN 'suppression_refresh'::cdp_segment_type

        -- P14: Cooldown (frequent, no progression)
        WHEN total_sessions >= 4 AND total_purchases = 0
        THEN 'suppression_cooldown'::cdp_segment_type

        -- P15: Engaged browser (general)
        WHEN total_page_views >= 2 AND total_dwell_seconds >= 45
        THEN 'engaged_browser'::cdp_segment_type

        -- P16: Low engagement (bouncer)
        WHEN total_page_views <= 1 OR total_dwell_seconds < 30
        THEN 'low_engagement'::cdp_segment_type

        ELSE 'unassigned'::cdp_segment_type
      END AS new_segment
    FROM cdp_user_profiles
  ) AS computed
  WHERE cdp_user_profiles.identity_key = computed.identity_key;

  -- ----------------------------------------------------------------
  -- STEP 4: Track segment membership history
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
  -- STEP 5: Queue activations (now includes attributes in payload)
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
      'attributes', user_attributes,
      'cart_value_aed', current_cart_value_aed,
      'drop_off_step', registration_drop_off_step,
      'sent_at', NOW()
    )
  FROM cdp_user_profiles
  CROSS JOIN (VALUES ('meta'), ('google_ads')) AS channels(channel)
  WHERE previous_segment IS DISTINCT FROM current_segment
  AND current_segment IN (
    'abandoned_cart_high_value', 'abandoned_cart_standard',
    'reg_drop_otp', 'reg_drop_details', 'reg_drop_eligibility',
    'started_registration', 'high_intent_anonymous',
    'promo_viewer', 'winner_validator', 'repeat_visitor_high',
    'engaged_browser'
  );

  -- Onsite modal for high-intent anonymous users
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
  AND current_segment IN ('high_intent_anonymous', 'winner_validator', 'promo_viewer');

  -- Email/CRM activation for lapsed customers
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
  AND current_segment = 'lapsed_customer';

  -- ----------------------------------------------------------------
  -- STEP 6: Compute return stats
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

  -- Attribute distribution summary (for debugging / dashboard)
  SELECT jsonb_build_object(
    'game_affinity', (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'game_affinity' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'price_tier',    (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'price_tier' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'recency',       (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'recency' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t),
    'visit_frequency', (SELECT jsonb_object_agg(v, c) FROM (SELECT user_attributes->>'visit_frequency' AS v, COUNT(*) AS c FROM cdp_user_profiles GROUP BY 1) t)
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

SELECT 'Migration 0004 applied: segmentation engine updated with attributes' AS status;
