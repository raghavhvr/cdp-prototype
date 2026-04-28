// Segment + attribute definitions in marketing language.
// Single source of truth for naming, grouping, prioritization, and activation
// metadata across the entire UI.

export type SegmentKey =
  // Conversion-ready (highest priority — closest to revenue)
  | "abandoned_cart_high_value"
  | "abandoned_cart_standard"
  | "reg_drop_otp"
  | "reg_drop_details"
  | "reg_drop_eligibility"
  | "started_registration"
  // Acquisition (drive registration / first purchase)
  | "high_intent_anonymous"
  | "promo_viewer"
  | "winner_validator"
  | "repeat_visitor_high"
  | "engaged_browser"
  // Suppression (reduce wasted spend)
  | "suppression_cooldown"
  | "suppression_refresh"
  | "low_engagement"
  | "ineligible"
  // Lifecycle (post-conversion)
  | "converted"
  | "lapsed_customer"
  | "unassigned"
  // Legacy — kept for backward compatibility with old data
  | "abandoned_cart"
  | "high_intent_anonymous_legacy";

export type SegmentCategory = "conversion" | "acquisition" | "suppression" | "lifecycle";

export interface SegmentDefinition {
  key: SegmentKey;
  displayName: string;
  summary: string;
  whyItMatters: string;
  priority: number;
  category: SegmentCategory;
  colorKey: "danger" | "warning" | "info" | "success" | "muted" | "accent" | "dim";
  recommendedChannels: string[];
  creativeAngle: string;
  shouldActivate: boolean;
}

export const SEGMENTS: Record<SegmentKey, SegmentDefinition> = {
  // -------------------------------------------------------------------------
  // CONVERSION-READY — highest priority, closest to revenue
  // -------------------------------------------------------------------------
  abandoned_cart_high_value: {
    key: "abandoned_cart_high_value",
    displayName: "Abandoned Cart — High Value",
    summary: "Cart over AED 200, didn't complete purchase",
    whyItMatters:
      "These users had real money in the cart. Even small recovery rates here pay off. Higher bid ceilings justified — recovering one of these covers media spend across many lower-value retargeting attempts.",
    priority: 1,
    category: "conversion",
    colorKey: "danger",
    recommendedChannels: ["Meta", "Google Ads", "Email", "SMS"],
    creativeAngle: "Strong urgency + the exact game/bundle they had. Optional incentive.",
    shouldActivate: true,
  },
  abandoned_cart_standard: {
    key: "abandoned_cart_standard",
    displayName: "Abandoned Cart — Standard",
    summary: "Added tickets but didn't complete checkout",
    whyItMatters:
      "Standard cart abandonment recovery. Strong intent signal but lower individual transaction value than high-value carts — efficient retargeting at standard bids.",
    priority: 2,
    category: "conversion",
    colorKey: "danger",
    recommendedChannels: ["Meta", "Google Ads", "Email"],
    creativeAngle: "Recovery messaging with their specific game. Mild urgency.",
    shouldActivate: true,
  },
  reg_drop_otp: {
    key: "reg_drop_otp",
    displayName: "Registration Drop — OTP Step",
    summary: "Got stuck verifying their phone",
    whyItMatters:
      "OTP friction is technical, not a motivation problem. Reassurance creative ('didn't get the code? here's how') converts much better than generic 'finish registration' messaging.",
    priority: 3,
    category: "conversion",
    colorKey: "warning",
    recommendedChannels: ["Email", "Meta", "Onsite Modal"],
    creativeAngle: "Reassurance + 'Resend code' CTA. Avoid urgency.",
    shouldActivate: true,
  },
  reg_drop_details: {
    key: "reg_drop_details",
    displayName: "Registration Drop — Personal Details",
    summary: "Stalled at the personal details form",
    whyItMatters:
      "Form friction. Privacy concerns or just form length. Show how short the remaining flow is, address what data is used for, lean into trust signals.",
    priority: 4,
    category: "conversion",
    colorKey: "warning",
    recommendedChannels: ["Email", "Meta", "Onsite Modal"],
    creativeAngle: "'Just 2 more fields' + trust badges + privacy reassurance.",
    shouldActivate: true,
  },
  reg_drop_eligibility: {
    key: "reg_drop_eligibility",
    displayName: "Registration Drop — Eligibility",
    summary: "Got tripped up on country / age / eligibility",
    whyItMatters:
      "Eligibility confusion. Some are genuinely ineligible (different campaign needed), others just confused by the requirements. Clear FAQ-style messaging helps the latter convert.",
    priority: 5,
    category: "conversion",
    colorKey: "warning",
    recommendedChannels: ["Email", "Onsite Modal"],
    creativeAngle: "Eligibility clarity. Who can play and from where.",
    shouldActivate: true,
  },
  started_registration: {
    key: "started_registration",
    displayName: "Started Registration (Step Unknown)",
    summary: "Began signing up, drop-off step not captured",
    whyItMatters:
      "Fallback for users where we couldn't pin down the exact drop-off step. Generic 'finish registration' messaging is the right call here.",
    priority: 6,
    category: "conversion",
    colorKey: "warning",
    recommendedChannels: ["Email", "Meta", "Google Ads"],
    creativeAngle: "Generic completion nudge.",
    shouldActivate: true,
  },

  // -------------------------------------------------------------------------
  // ACQUISITION — drive first registration or first purchase
  // -------------------------------------------------------------------------
  high_intent_anonymous: {
    key: "high_intent_anonymous",
    displayName: "High Intent — Not Registered",
    summary: "Multiple sessions, deep engagement, no signup yet",
    whyItMatters:
      "Validating before committing. Email capture and exit-intent typically convert 5–10% of this audience. Game affinity attribute lets you personalize the creative they see.",
    priority: 7,
    category: "acquisition",
    colorKey: "accent",
    recommendedChannels: ["Onsite Modal", "Meta", "Google Ads"],
    creativeAngle: "Social proof (winners) + low-friction entry point.",
    shouldActivate: true,
  },
  promo_viewer: {
    key: "promo_viewer",
    displayName: "Promo Page Viewer",
    summary: "Viewed an active promotion but didn't act",
    whyItMatters:
      "Offer-driven intent. They saw the promo, considered it, didn't pull the trigger. Retargeting with the same promo + countdown urgency is the natural recovery play.",
    priority: 8,
    category: "acquisition",
    colorKey: "accent",
    recommendedChannels: ["Meta", "Google Ads"],
    creativeAngle: "The exact promo they viewed + countdown / urgency.",
    shouldActivate: true,
  },
  winner_validator: {
    key: "winner_validator",
    displayName: "Winner / Results Validator",
    summary: "Browsing winners and results — checking legitimacy",
    whyItMatters:
      "These users are doing trust due diligence. Credibility-led creative (recent winners, payout proof, reviews) outperforms jackpot-led creative for this audience. They convert when reassured the brand is legitimate.",
    priority: 9,
    category: "acquisition",
    colorKey: "info",
    recommendedChannels: ["Meta", "Google Ads", "Onsite Modal"],
    creativeAngle: "Real winner stories, payout proof, low-friction entry CTA.",
    shouldActivate: true,
  },
  repeat_visitor_high: {
    key: "repeat_visitor_high",
    displayName: "Repeat Visitor — High Frequency",
    summary: "3+ sessions, no progression yet",
    whyItMatters:
      "They keep coming back but won't commit. Time to switch tactic — from awareness to action-oriented. 'Ready to play?' messaging, lowest-friction entry point, urgency.",
    priority: 10,
    category: "acquisition",
    colorKey: "info",
    recommendedChannels: ["Meta", "Google Ads", "Onsite Modal"],
    creativeAngle: "Action-led. 'Ready to play?' + cheapest entry point.",
    shouldActivate: true,
  },
  engaged_browser: {
    key: "engaged_browser",
    displayName: "Engaged Browser",
    summary: "Multiple page views, decent dwell, no action yet",
    whyItMatters:
      "Top of consideration. Awareness creative (jackpot size, recent winners) keeps them warm without overspending on bouncers.",
    priority: 11,
    category: "acquisition",
    colorKey: "info",
    recommendedChannels: ["Meta", "Google Ads"],
    creativeAngle: "How it works + jackpot size + low entry cost.",
    shouldActivate: true,
  },

  // -------------------------------------------------------------------------
  // SUPPRESSION — reduce wasted spend
  // -------------------------------------------------------------------------
  suppression_cooldown: {
    key: "suppression_cooldown",
    displayName: "Cooldown (Reduced Bid)",
    summary: "Multiple impressions, no conversion — reduce spend",
    whyItMatters:
      "Diminishing returns audience. -60% bid keeps presence without overpaying. Re-evaluated after 14 days.",
    priority: 12,
    category: "suppression",
    colorKey: "muted",
    recommendedChannels: ["Meta (-60% bid)", "Google Ads (-60% bid)"],
    creativeAngle: "Test new creative angle on re-engagement.",
    shouldActivate: true,
  },
  suppression_refresh: {
    key: "suppression_refresh",
    displayName: "Refresh Window (Suppressed)",
    summary: "Fully suppressed for 14 days, then re-engaged with new creative",
    whyItMatters:
      "Prevents ad fatigue. After 14 days of silence, users come back fresh and creative rotation gives them a new reason to consider.",
    priority: 13,
    category: "suppression",
    colorKey: "muted",
    recommendedChannels: ["Suppressed across all paid channels"],
    creativeAngle: "On re-entry: completely different creative format.",
    shouldActivate: false,
  },
  low_engagement: {
    key: "low_engagement",
    displayName: "Low Engagement (Excluded)",
    summary: "Single-page bouncers — not worth retargeting spend",
    whyItMatters:
      "The biggest media spend savings live here. Users who bounce in under 30 seconds rarely convert no matter how many ads they see. Exclude them.",
    priority: 14,
    category: "suppression",
    colorKey: "dim",
    recommendedChannels: ["Excluded from active retargeting"],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
  ineligible: {
    key: "ineligible",
    displayName: "Ineligible (Geo Filtered)",
    summary: "Outside eligible regions — never include in paid pools",
    whyItMatters:
      "Hard exclusion. Eligibility enforced at registration anyway, but excluding upstream protects acquisition spend.",
    priority: 15,
    category: "suppression",
    colorKey: "dim",
    recommendedChannels: ["Excluded from all paid media"],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },

  // -------------------------------------------------------------------------
  // LIFECYCLE — post-conversion / win-back
  // -------------------------------------------------------------------------
  converted: {
    key: "converted",
    displayName: "Converted (Active Customer)",
    summary: "Has made at least one purchase — move to retention",
    whyItMatters:
      "Belongs in known-user / CRM journeys, not anonymous acquisition pools. Excluded from acquisition spend, included in retention and upsell campaigns.",
    priority: 16,
    category: "lifecycle",
    colorKey: "success",
    recommendedChannels: ["CRM / Email retention"],
    creativeAngle: "Repeat play, new game launches, jackpot alerts.",
    shouldActivate: false,
  },
  lapsed_customer: {
    key: "lapsed_customer",
    displayName: "Lapsed Customer",
    summary: "Previously bought, dormant 30+ days",
    whyItMatters:
      "Win-back territory. Customers who already trust you but haven't been back. Email-led win-back with a major event (record jackpot, new game launch) typically reactivates 5–15%.",
    priority: 17,
    category: "lifecycle",
    colorKey: "warning",
    recommendedChannels: ["Email / CRM", "Meta Custom Audience"],
    creativeAngle: "Win-back with major event hook (record jackpot, new game).",
    shouldActivate: true,
  },

  // -------------------------------------------------------------------------
  // FALLBACK + LEGACY (for old data — never displayed prominently)
  // -------------------------------------------------------------------------
  unassigned: {
    key: "unassigned",
    displayName: "Unassigned",
    summary: "No segment assigned yet",
    whyItMatters: "Run segmentation to assign these users.",
    priority: 99,
    category: "suppression",
    colorKey: "dim",
    recommendedChannels: [],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
  abandoned_cart: {
    key: "abandoned_cart",
    displayName: "Abandoned Cart (Legacy)",
    summary: "Legacy segment — re-run segmentation to migrate",
    whyItMatters: "Pre-migration data. New runs will assign to the value-tiered cart segments.",
    priority: 98,
    category: "conversion",
    colorKey: "danger",
    recommendedChannels: [],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
  high_intent_anonymous_legacy: {
    key: "high_intent_anonymous_legacy",
    displayName: "High Intent (Legacy)",
    summary: "Legacy segment",
    whyItMatters: "Pre-migration data.",
    priority: 97,
    category: "acquisition",
    colorKey: "muted",
    recommendedChannels: [],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
};

export const SEGMENTS_BY_PRIORITY = Object.values(SEGMENTS).sort(
  (a, b) => a.priority - b.priority
);

// Group segments by category for display
export const SEGMENT_CATEGORIES: Record<
  SegmentCategory,
  { name: string; description: string; segments: SegmentKey[] }
> = {
  conversion: {
    name: "Conversion-Ready",
    description:
      "Closest to revenue. Strong intent signals — cart, registration, or active commitment.",
    segments: SEGMENTS_BY_PRIORITY.filter(
      (s) => s.category === "conversion" && s.priority < 90
    ).map((s) => s.key),
  },
  acquisition: {
    name: "Acquisition",
    description: "Driving first registration or first purchase from anonymous traffic.",
    segments: SEGMENTS_BY_PRIORITY.filter(
      (s) => s.category === "acquisition" && s.priority < 90
    ).map((s) => s.key),
  },
  suppression: {
    name: "Suppression",
    description: "Reduce wasted spend on low-quality or saturated audiences.",
    segments: SEGMENTS_BY_PRIORITY.filter(
      (s) => s.category === "suppression" && s.priority < 90
    ).map((s) => s.key),
  },
  lifecycle: {
    name: "Lifecycle",
    description: "Post-conversion — retention, win-back, repeat purchase.",
    segments: SEGMENTS_BY_PRIORITY.filter(
      (s) => s.category === "lifecycle" && s.priority < 90
    ).map((s) => s.key),
  },
};

// =============================================================================
// USER ATTRIBUTES — sub-attributes that stack with the primary segment
// =============================================================================

export type AttributeKey =
  | "game_affinity"
  | "price_tier"
  | "recency"
  | "visit_frequency"
  | "validator_behavior"
  | "promo_engaged"
  | "engagement_depth";

export interface AttributeDefinition {
  key: AttributeKey;
  displayName: string;
  description: string;
  values: { value: string; label: string }[];
}

export const ATTRIBUTES: Record<AttributeKey, AttributeDefinition> = {
  game_affinity: {
    key: "game_affinity",
    displayName: "Game Affinity",
    description: "Which game the user has shown most interest in",
    values: [
      { value: "mega7", label: "Mega7" },
      { value: "easy6", label: "Easy6" },
      { value: "fast5", label: "FAST5" },
      { value: "raffle", label: "Raffle" },
      { value: "none", label: "No preference" },
    ],
  },
  price_tier: {
    key: "price_tier",
    displayName: "Price Tier",
    description: "Spending bracket based on cart engagement",
    values: [
      { value: "high", label: "High (AED 200+)" },
      { value: "mid", label: "Mid (AED 75–200)" },
      { value: "low", label: "Low (under AED 75)" },
      { value: "unknown", label: "Unknown" },
    ],
  },
  recency: {
    key: "recency",
    displayName: "Recency",
    description: "How recently the user was active",
    values: [
      { value: "fresh", label: "Fresh (≤3 days)" },
      { value: "recent", label: "Recent (≤14 days)" },
      { value: "stale", label: "Stale (>14 days)" },
    ],
  },
  visit_frequency: {
    key: "visit_frequency",
    displayName: "Visit Frequency",
    description: "Number of distinct sessions",
    values: [
      { value: "high", label: "High (3+)" },
      { value: "multiple", label: "Multiple (2)" },
      { value: "single", label: "Single (1)" },
    ],
  },
  validator_behavior: {
    key: "validator_behavior",
    displayName: "Trust Validator",
    description: "Has viewed winners or results pages (researching legitimacy)",
    values: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  promo_engaged: {
    key: "promo_engaged",
    displayName: "Promo Engaged",
    description: "Has viewed a promotional offer page",
    values: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  engagement_depth: {
    key: "engagement_depth",
    displayName: "Engagement Depth",
    description: "Composite of dwell time and scroll depth",
    values: [
      { value: "deep", label: "Deep" },
      { value: "medium", label: "Medium" },
      { value: "shallow", label: "Shallow" },
    ],
  },
};

export const ATTRIBUTES_LIST = Object.values(ATTRIBUTES);

// Helper: get a display label for an attribute value
export function getAttributeLabel(key: AttributeKey, value: string): string {
  const attr = ATTRIBUTES[key];
  if (!attr) return value;
  const match = attr.values.find((v) => v.value === value);
  return match?.label ?? value;
}
