"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import {
  SEGMENTS,
  SEGMENT_CATEGORIES,
  SegmentKey,
  ATTRIBUTES_LIST,
  getAttributeLabel,
} from "@/lib/segments";
import { Card, CardTitle, CardDescription, Badge } from "@/components/ui";
import { formatNumber, formatAed } from "@/lib/utils";
import { Send, Pause, Layers, Sparkles } from "lucide-react";

interface SegmentStats {
  user_count: number;
  known_users: number;
  anonymous_users: number;
  avg_sessions: number;
  avg_page_views: number;
  total_cart_value_aed: number | null;
}

export default function AudiencesPage() {
  const [stats, setStats] = useState<Record<string, SegmentStats>>({});
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Audiences</h1>
        <p className="text-brand-muted mt-1 max-w-3xl">
          Each visitor is assigned to exactly one primary audience based on
          priority. Sub-attributes (game affinity, price tier, recency) stack
          on top to enable personalized creative within each audience.
        </p>
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
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SegmentRow({
  segmentKey,
  stats,
  loading,
  isHighlighted,
}: {
  segmentKey: SegmentKey;
  stats?: SegmentStats;
  loading: boolean;
  isHighlighted?: boolean;
}) {
  const seg = SEGMENTS[segmentKey];
  const count = stats?.user_count ?? 0;

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

        <div className="flex-shrink-0 min-w-[180px] space-y-2">
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
        </div>
      </div>
    </Card>
  );
}
