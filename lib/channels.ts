// Channel definitions for activation UI.
// Keep in sync with cdp_activation_channel enum in migrations.

export type ChannelKey =
  | "meta"
  | "google_ads"
  | "snapchat"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "sms"
  | "email_marketing"
  | "email_crm"
  | "onsite_modal"
  | "third_party_dsp";

export type ChannelGroup = "paid_social" | "paid_search" | "owned" | "onsite";

export interface ChannelDefinition {
  key: ChannelKey;
  label: string;
  group: ChannelGroup;
  shortLabel: string;
  emoji: string; // for compact UI surfaces
}

export const CHANNELS: Record<ChannelKey, ChannelDefinition> = {
  meta: {
    key: "meta",
    label: "Meta (Facebook + Instagram)",
    shortLabel: "Meta",
    group: "paid_social",
    emoji: "📘",
  },
  snapchat: {
    key: "snapchat",
    label: "Snapchat Ads",
    shortLabel: "Snap",
    group: "paid_social",
    emoji: "👻",
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok Ads",
    shortLabel: "TikTok",
    group: "paid_social",
    emoji: "🎵",
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn Ads",
    shortLabel: "LinkedIn",
    group: "paid_social",
    emoji: "💼",
  },
  google_ads: {
    key: "google_ads",
    label: "Google Ads",
    shortLabel: "Google",
    group: "paid_search",
    emoji: "🔍",
  },
  youtube: {
    key: "youtube",
    label: "YouTube Ads",
    shortLabel: "YouTube",
    group: "paid_search",
    emoji: "▶️",
  },
  email_marketing: {
    key: "email_marketing",
    label: "Email Marketing",
    shortLabel: "Email",
    group: "owned",
    emoji: "✉️",
  },
  email_crm: {
    key: "email_crm",
    label: "CRM Email Trigger",
    shortLabel: "CRM",
    group: "owned",
    emoji: "📨",
  },
  sms: {
    key: "sms",
    label: "SMS",
    shortLabel: "SMS",
    group: "owned",
    emoji: "💬",
  },
  onsite_modal: {
    key: "onsite_modal",
    label: "Onsite Modal",
    shortLabel: "Onsite",
    group: "onsite",
    emoji: "🪟",
  },
  third_party_dsp: {
    key: "third_party_dsp",
    label: "Third-party DSP",
    shortLabel: "DSP",
    group: "paid_search",
    emoji: "📡",
  },
};

export const CHANNEL_GROUPS: Record<ChannelGroup, { name: string; channels: ChannelKey[] }> = {
  paid_social: {
    name: "Paid Social",
    channels: ["meta", "snapchat", "tiktok", "linkedin"],
  },
  paid_search: {
    name: "Paid Search & Display",
    channels: ["google_ads", "youtube", "third_party_dsp"],
  },
  owned: {
    name: "Owned (Email, SMS)",
    channels: ["email_marketing", "email_crm", "sms"],
  },
  onsite: {
    name: "Onsite",
    channels: ["onsite_modal"],
  },
};

export const CHANNELS_LIST = Object.values(CHANNELS);

export function getChannelLabel(key: string): string {
  return CHANNELS[key as ChannelKey]?.label ?? key;
}

export function getChannelShortLabel(key: string): string {
  return CHANNELS[key as ChannelKey]?.shortLabel ?? key;
}

export function getChannelEmoji(key: string): string {
  return CHANNELS[key as ChannelKey]?.emoji ?? "📌";
}
