// Segment definitions in marketing language.
// This is the single source of truth for how segments are named, described,
// and prioritized throughout the UI. Update here, the whole app reflects it.

export type SegmentKey =
  | "abandoned_cart"
  | "started_registration"
  | "high_intent_anonymous"
  | "engaged_browser"
  | "suppression_cooldown"
  | "suppression_refresh"
  | "low_engagement"
  | "ineligible"
  | "converted"
  | "unassigned";

export interface SegmentDefinition {
  key: SegmentKey;
  // Marketing-friendly name (shown in dashboard cards)
  displayName: string;
  // One-line plain-English summary
  summary: string;
  // Full description for "why this audience matters"
  whyItMatters: string;
  // Priority — lower number = higher priority (1 = top)
  priority: number;
  // Color theme key (maps to Tailwind brand colors)
  colorKey: "danger" | "warning" | "info" | "success" | "muted" | "accent" | "dim";
  // Activation channels typically used for this segment
  recommendedChannels: string[];
  // Suggested creative angle
  creativeAngle: string;
  // Whether this segment should be activated (false = suppress only)
  shouldActivate: boolean;
}

export const SEGMENTS: Record<SegmentKey, SegmentDefinition> = {
  abandoned_cart: {
    key: "abandoned_cart",
    displayName: "Abandoned Cart",
    summary: "Added tickets to cart but didn't complete purchase",
    whyItMatters:
      "Closest-to-revenue audience. These users have explicit purchase intent — they picked games, added tickets, then walked away. Recovery campaigns here typically deliver the highest ROAS in the funnel.",
    priority: 1,
    colorKey: "danger",
    recommendedChannels: ["Meta", "Google Ads", "Email"],
    creativeAngle: "Urgency + the exact game they abandoned. Optional discount.",
    shouldActivate: true,
  },
  started_registration: {
    key: "started_registration",
    displayName: "Started Registration",
    summary: "Began signing up but didn't finish",
    whyItMatters:
      "High-intent prospects already in your funnel. Tailoring the message to the exact step they dropped at (OTP, personal details, eligibility) typically lifts completion 2-3x vs generic 'finish registration' creative.",
    priority: 2,
    colorKey: "warning",
    recommendedChannels: ["Meta", "Google Ads", "Email"],
    creativeAngle: "Address the specific friction point. Reassurance over urgency.",
    shouldActivate: true,
  },
  high_intent_anonymous: {
    key: "high_intent_anonymous",
    displayName: "High Intent — Not Registered",
    summary: "Browsing jackpots and pricing repeatedly without signing up",
    whyItMatters:
      "Validates the brand before committing. Multiple sessions, deep page views, but hasn't taken the leap. Email capture and exit-intent typically convert 5-10% of this audience.",
    priority: 3,
    colorKey: "accent",
    recommendedChannels: ["Onsite Modal", "Meta", "Google Ads"],
    creativeAngle: "Social proof (winners) + low-friction entry point.",
    shouldActivate: true,
  },
  engaged_browser: {
    key: "engaged_browser",
    displayName: "Engaged Browser",
    summary: "Multiple meaningful page views but hasn't taken action yet",
    whyItMatters:
      "Top of the consideration funnel. They're learning about Emirates Draw but not yet ready to act. Awareness-led creative (jackpot size, recent winners) keeps them warm without wasting bid on bouncers.",
    priority: 4,
    colorKey: "info",
    recommendedChannels: ["Meta", "Google Ads"],
    creativeAngle: "How it works, jackpot size, low entry cost.",
    shouldActivate: true,
  },
  suppression_cooldown: {
    key: "suppression_cooldown",
    displayName: "Cooldown (Reduced Bid)",
    summary: "Seen the ads multiple times without converting — reduce spend",
    whyItMatters:
      "Avoid burning budget on users showing diminishing returns. -60% bid keeps you present without overpaying. After 14 days, they re-enter regular pools with refreshed creative.",
    priority: 5,
    colorKey: "muted",
    recommendedChannels: ["Meta (-60% bid)", "Google Ads (-60% bid)"],
    creativeAngle: "Test new creative angle when re-engaging.",
    shouldActivate: true,
  },
  suppression_refresh: {
    key: "suppression_refresh",
    displayName: "Refresh Window (Suppressed)",
    summary: "Fully suppressed for 14 days, then re-engaged with new creative",
    whyItMatters:
      "Prevents ad fatigue and wasted impressions. After 14 days of silence, users come back fresh and creative rotation gives them a new angle to consider.",
    priority: 6,
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
      "Saves the biggest chunk of wasted media spend. Users who bounce in under 30 seconds rarely convert no matter how many ads they see. Excluding them sharpens the audiences that remain.",
    priority: 7,
    colorKey: "dim",
    recommendedChannels: ["Excluded from active retargeting"],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
  ineligible: {
    key: "ineligible",
    displayName: "Ineligible (Geo Filtered)",
    summary: "Outside eligible regions — should never be in paid pools",
    whyItMatters:
      "Hard exclusion. Eligibility is enforced at registration anyway, but excluding ineligible users from media spend protects against acquisition cost on users who can't transact.",
    priority: 8,
    colorKey: "dim",
    recommendedChannels: ["Excluded from all paid media"],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
  converted: {
    key: "converted",
    displayName: "Converted (Customer)",
    summary: "Completed at least one purchase — move to retention",
    whyItMatters:
      "Belongs in known-user / CRM journeys, not anonymous acquisition pools. Excluded from acquisition spend, included in retention and upsell campaigns.",
    priority: 9,
    colorKey: "success",
    recommendedChannels: ["CRM / Email retention"],
    creativeAngle: "Repeat play, new game launches, jackpot alerts.",
    shouldActivate: false,
  },
  unassigned: {
    key: "unassigned",
    displayName: "Unassigned",
    summary: "No segment assigned yet — segmentation hasn't run or no qualifying activity",
    whyItMatters: "Run the segmentation engine to assign these users.",
    priority: 99,
    colorKey: "dim",
    recommendedChannels: [],
    creativeAngle: "Not active.",
    shouldActivate: false,
  },
};

// Sorted by priority — used for display order in dashboard
export const SEGMENTS_BY_PRIORITY = Object.values(SEGMENTS).sort(
  (a, b) => a.priority - b.priority
);
