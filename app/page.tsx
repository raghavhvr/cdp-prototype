"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { SEGMENTS, SEGMENTS_BY_PRIORITY, SegmentKey } from "@/lib/segments";
import { Card, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import { formatNumber } from "@/lib/utils";
import { ArrowRight, Database, Users, Send, Settings, Activity } from "lucide-react";

export default function HomePage() {
  const [segmentSizes, setSegmentSizes] = useState<Record<string, number>>({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [recentActivations, setRecentActivations] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = supabaseBrowser();

    async function loadStats() {
      const [{ data: profiles }, { count: events }, { count: activations }] =
        await Promise.all([
          supabase.from("cdp_user_profiles").select("current_segment"),
          supabase.from("cdp_events").select("*", { count: "exact", head: true }),
          supabase
            .from("cdp_activations")
            .select("*", { count: "exact", head: true })
            .gte("triggered_at", new Date(Date.now() - 86400000).toISOString()),
        ]);

      const sizes: Record<string, number> = {};
      profiles?.forEach((p) => {
        const seg = p.current_segment as string;
        sizes[seg] = (sizes[seg] || 0) + 1;
      });

      setSegmentSizes(sizes);
      setTotalUsers(profiles?.length ?? 0);
      setTotalEvents(events ?? 0);
      setRecentActivations(activations ?? 0);
      setLoading(false);
    }

    loadStats();

    // Subscribe to live updates on user profiles
    const channel = supabase
      .channel("home-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cdp_user_profiles" },
        () => loadStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero / Intro */}
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-brand-text">
          Customer Data Platform — Prototype
        </h1>
        <p className="text-brand-muted max-w-3xl">
          A working demonstration of unified user segmentation: every visitor is
          tracked, profiled, and assigned to one priority-based audience. From
          there, the right message goes to the right channel — Meta, Google,
          onsite, or email. This prototype uses dummy data; production would plug
          into GTM-fired events from the live site.
        </p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Users in Database"
          value={loading ? "—" : formatNumber(totalUsers)}
          sub="Unique identities tracked"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Events Captured"
          value={loading ? "—" : formatNumber(totalEvents)}
          sub="Behavioral signals processed"
          icon={<Activity className="w-5 h-5" />}
        />
        <StatCard
          label="Activations (24h)"
          value={loading ? "—" : formatNumber(recentActivations)}
          sub="Audience signals sent"
          icon={<Send className="w-5 h-5" />}
        />
        <StatCard
          label="Active Segments"
          value={loading ? "—" : formatNumber(Object.keys(segmentSizes).length)}
          sub="Unique audiences in use"
          icon={<Database className="w-5 h-5" />}
        />
      </div>

      {/* Empty state CTA */}
      {!loading && totalUsers === 0 && (
        <Card className="border-brand-accent/40 bg-brand-accent/5">
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-accent" />
            Get started
          </CardTitle>
          <CardDescription>
            No data yet. Head to the Admin page to generate dummy users and run
            segmentation. Takes about 30 seconds.
          </CardDescription>
          <div className="mt-4">
            <Link href="/admin">
              <Button>
                Go to Admin <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Segment overview */}
      {!loading && totalUsers > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Audience Snapshot</h2>
              <p className="text-sm text-brand-muted">
                Current distribution across priority-based segments
              </p>
            </div>
            <Link href="/audiences">
              <Button variant="secondary" size="sm">
                View all <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SEGMENTS_BY_PRIORITY.filter((s) => s.key !== "unassigned").map(
              (seg) => (
                <SegmentMiniCard
                  key={seg.key}
                  segmentKey={seg.key}
                  count={segmentSizes[seg.key] || 0}
                  totalUsers={totalUsers}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-brand-muted">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
          <div className="text-xs text-brand-dim mt-1">{sub}</div>
        </div>
        <div className="text-brand-accent">{icon}</div>
      </div>
    </Card>
  );
}

function SegmentMiniCard({
  segmentKey,
  count,
  totalUsers,
}: {
  segmentKey: SegmentKey;
  count: number;
  totalUsers: number;
}) {
  const seg = SEGMENTS[segmentKey];
  const pct = totalUsers > 0 ? (count / totalUsers) * 100 : 0;

  return (
    <Card className="hover:border-brand-accent/40 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <Badge color={seg.colorKey}>P{seg.priority}</Badge>
        <div className="text-2xl font-semibold">{formatNumber(count)}</div>
      </div>
      <div className="font-medium text-brand-text">{seg.displayName}</div>
      <div className="text-xs text-brand-muted mt-1">{seg.summary}</div>
      <div className="mt-3 h-1.5 bg-brand-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-accent transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="text-xs text-brand-dim mt-1">{pct.toFixed(1)}% of users</div>
    </Card>
  );
}
