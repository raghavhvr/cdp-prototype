"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import {
  SEGMENTS,
  SEGMENT_CATEGORIES,
  SegmentKey,
  ATTRIBUTES_LIST,
} from "@/lib/segments";
import { ChannelKey } from "@/lib/channels";
import { Card, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import { PushModal } from "@/components/PushModal";
import { formatNumber, formatAed } from "@/lib/utils";
import { Send, Pause, Layers, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";

interface SegmentStats {
  user_count: number;
  known_users: number;
  anonymous_users: number;
  avg_sessions: number;
  avg_page_views: number;
  total_cart_value_aed: number | null;
}

// Map segment recommendedChannels (which are display strings) to ChannelKeys
// for pre-selecting in the push modal. Best-effort match — falls back to []
function suggestChannelsForSegment(segmentKey: SegmentKey): ChannelKey[] {
  const seg = SEGMENTS[segmentKey];
  const suggested: ChannelKey[] = [];
  for (const ch of seg.recommendedChannels) {
    const lower = ch.toLowerCase();
    if (lower.includes("meta")) suggested.push("meta");
    if (lower.includes("google")) suggested.push("google_ads");
    if (lower.includes("snap")) suggested.push("snapchat");
    if (lower.includes("tiktok")) suggested.push("tiktok");
    if (lower.includes("linkedin")) suggested.push("linkedin");
    if (lower.includes("youtube")) suggested.push("youtube");
    if (lower.includes("sms")) suggested.push("sms");
    if (lower.includes("crm") || lower.includes("email")) {
      // Prefer crm for retention, marketing for acquisition
      suggested.push(seg.category === "lifecycle" ? "email_crm" : "email_marketing");
    }
    if (lower.includes("onsite") || lower.includes("modal")) suggested.push("onsite_modal");
  }
  return Array.from(new Set(suggested));
}

export default function AudiencesPage() {
  const [stats, setStats] = useState<Record<string, SegmentStats>>({});
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pushTarget, setPushTarget] = useState<{
    segment: SegmentKey;
    size: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlighted(hash);
        setTimeout(() => setHighlighted(null), 2000);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();

    async function load() {
      const { data } = await supabase.from("cdp_segment_sizes").select("*");
      const map: Record<string, SegmentStats> = {};
      data?.forEach((row: any) => {
        map[row.segment] = {
          user_count: row.user_count,
          known_users: row.known_users,
          anonymous_users: row.anonymous_users,
          avg_sessions: row.avg_sessions,
          avg_page_views: row.avg_page_views,
          total_cart_value_aed: row.total_cart_value_aed,
        };
      });
      setStats(map);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel("audiences-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cdp_user_profiles" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handlePush(params: {
    channels: ChannelKey[];
    campaignName: string;
    creativeId: string;
  }) {
    if (!pushTarget) return;
    const res = await fetch("/api/activate/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment: pushTarget.segment,
        channels: params.channels,
        campaignName: params.campaignName || null,
        creativeId: params.creativeId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error ?? "Push failed");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Audiences</h1>
          <p className="text-brand-muted mt-1 max-w-3xl">
            Each visitor is assigned to exactly one primary audience based on
            priority. Sub-attributes (game affinity, price tier, recency) stack
            on top to enable personalized creative within each audience.
          </p>
        </div>
        <Link href="/builder">
          <Button variant="secondary">
            <Wand2 className="w-4 h-4" />
            Build custom audience
          </Button>
        </Link>
      </div>

      {/* Attribute reference */}
      <Card>
        <CardTitle>
          <Sparkles className="w-5 h-5 inline mr-2 text-brand-accent" />
          Sub-Attributes
        </CardTitle>
        <CardDescription>
          Every user gets these attributes computed alongside their primary
          segment. Activation can combine segment + attributes for personalized
          creative — e.g., &ldquo;Abandoned Cart + Mega7 affinity + High value.&rdquo;
        </CardDescription>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ATTRIBUTES_LIST.map((attr) => (
            <div
              key={attr.key}
              className="bg-brand-elevated border border-brand-border rounded-md p-3"
            >
              <div className="text-sm font-medium text-brand-text">
                {attr.displayName}
              </div>
              <div className="text-xs text-brand-muted mt-0.5">
                {attr.description}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {attr.values.map((v) => (
                  <span
                    key={v.value}
                    className="text-xs text-brand-dim bg-brand-surface px-1.5 py-0.5 rounded"
                  >
                    {v.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Categories */}
      {Object.entries(SEGMENT_CATEGORIES).map(([key, category]) => (
        <div key={key} className="space-y-3">
          <div className="border-b border-brand-border pb-2">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-accent" />
              {category.name}
            </h2>
            <p className="text-sm text-brand-muted mt-1">
              {category.description}
            </p>
          </div>
          <div className="space-y-3">
            {category.segments.map((segKey) => (
              <SegmentRow
                key={segKey}
                segmentKey={segKey}
                stats={stats[segKey]}
                loading={loading}
                isHighlighted={highlighted === segKey}
                onPush={() =>
                  setPushTarget({
                    segment: segKey,
                    size: stats[segKey]?.user_count ?? 0,
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}

      {/* Push modal */}
      {pushTarget && (
        <PushModal
          open={true}
          onClose={() => setPushTarget(null)}
          audienceLabel={SEGMENTS[pushTarget.segment].displayName}
          audienceSize={pushTarget.size}
          suggestedChannels={suggestChannelsForSegment(pushTarget.segment)}
          onConfirm={handlePush}
        />
      )}
    </div>
  );
}

function SegmentRow({
  segmentKey,
  stats,
  loading,
  isHighlighted,
  onPush,
}: {
  segmentKey: SegmentKey;
  stats?: SegmentStats;
  loading: boolean;
  isHighlighted?: boolean;
  onPush: () => void;
}) {
  const seg = SEGMENTS[segmentKey];
  const count = stats?.user_count ?? 0;
  const canPush = seg.shouldActivate && count > 0;

  return (
    <Card
      id={segmentKey}
      className={`scroll-mt-24 transition-all duration-500 ${
        isHighlighted ? "border-brand-accent ring-2 ring-brand-accent/40" : ""
      }`}
    >
      <div className="flex items-start gap-6 flex-wrap">
        <div className="flex-shrink-0">
          <div className="text-xs text-brand-dim mb-1">PRIORITY</div>
          <Badge color={seg.colorKey} className="text-base px-3 py-1">
            P{seg.priority}
          </Badge>
        </div>

        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle>{seg.displayName}</CardTitle>
            {seg.shouldActivate ? (
              <Badge color="success">
                <Send className="w-3 h-3 inline mr-1" />
                Activates
              </Badge>
            ) : (
              <Badge color="dim">
                <Pause className="w-3 h-3 inline mr-1" />
                Suppress only
              </Badge>
            )}
          </div>
          <p className="text-sm text-brand-muted mt-1">{seg.summary}</p>
          <p className="text-sm text-brand-text mt-3 leading-relaxed">
            {seg.whyItMatters}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="text-brand-dim">Channels:</span>
            {seg.recommendedChannels.map((c) => (
              <span
                key={c}
                className="text-brand-muted bg-brand-elevated px-2 py-0.5 rounded"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="text-brand-dim">Creative angle:</span>
            <span className="text-brand-muted">{seg.creativeAngle}</span>
          </div>
        </div>

        <div className="flex-shrink-0 min-w-[200px] space-y-3">
          <div>
            <div className="text-xs text-brand-dim">USERS IN AUDIENCE</div>
            <div className="text-3xl font-semibold">
              {loading ? "—" : formatNumber(count)}
            </div>
          </div>
          {stats && stats.user_count > 0 && (
            <>
              <div className="text-xs text-brand-muted">
                Anon: {formatNumber(stats.anonymous_users)} ·{" "}
                Known: {formatNumber(stats.known_users)}
              </div>
              <div className="text-xs text-brand-muted">
                Avg sessions: {stats.avg_sessions ?? "—"} · Avg pages:{" "}
                {stats.avg_page_views ?? "—"}
              </div>
              {(stats.total_cart_value_aed ?? 0) > 0 && (
                <div className="text-xs text-brand-accent">
                  Cart value: {formatAed(stats.total_cart_value_aed)}
                </div>
              )}
            </>
          )}
          {canPush && (
            <Button onClick={onPush} size="sm" className="w-full">
              <Send className="w-3.5 h-3.5" />
              Push to channels
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
