"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { SEGMENTS, SEGMENTS_BY_PRIORITY, SegmentKey } from "@/lib/segments";
import { Card, CardTitle, Badge, Button } from "@/components/ui";
import { formatNumber, formatAed } from "@/lib/utils";
import { Send, Eye, Pause } from "lucide-react";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Audiences</h1>
        <p className="text-brand-muted mt-1">
          Each visitor is assigned to exactly one audience based on priority.
          Higher priority wins — so a user who abandons a cart is in
          &ldquo;Abandoned Cart,&rdquo; not also in &ldquo;Engaged Browser.&rdquo;
        </p>
      </div>

      <div className="space-y-4">
        {SEGMENTS_BY_PRIORITY.filter((s) => s.key !== "unassigned").map((seg) => (
          <SegmentRow
            key={seg.key}
            segmentKey={seg.key}
            stats={stats[seg.key]}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

function SegmentRow({
  segmentKey,
  stats,
  loading,
}: {
  segmentKey: SegmentKey;
  stats?: SegmentStats;
  loading: boolean;
}) {
  const seg = SEGMENTS[segmentKey];
  const count = stats?.user_count ?? 0;

  return (
    <Card>
      <div className="flex items-start gap-6 flex-wrap">
        {/* Priority badge */}
        <div className="flex-shrink-0">
          <div className="text-xs text-brand-dim mb-1">PRIORITY</div>
          <Badge color={seg.colorKey} className="text-base px-3 py-1">
            P{seg.priority}
          </Badge>
        </div>

        {/* Name + description */}
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

        {/* Stats */}
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
                Anonymous: {formatNumber(stats.anonymous_users)} ·{" "}
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
