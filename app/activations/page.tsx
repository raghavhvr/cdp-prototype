"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { SEGMENTS } from "@/lib/segments";
import { CHANNELS, getChannelLabel, getChannelEmoji } from "@/lib/channels";
import { Card, CardTitle, CardDescription, Badge } from "@/components/ui";
import { formatNumber } from "@/lib/utils";
import { Send, ArrowRight, Zap, Hand } from "lucide-react";

interface Activation {
  id: number;
  identity_key: string;
  segment: string;
  channel: string;
  status: string;
  triggered_at: string;
  trigger_source: string | null;
  campaign_name: string | null;
  creative_id: string | null;
  audience_size: number | null;
  payload: any;
}

type FilterMode = "all" | "manual" | "auto";

export default function ActivationsPage() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [byChannel, setByChannel] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<FilterMode>("manual");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = supabaseBrowser();

    async function load() {
      let query = supabase
        .from("cdp_activations")
        .select("*")
        .order("triggered_at", { ascending: false })
        .limit(200);

      if (filter !== "all") {
        query = query.eq("trigger_source", filter);
      }

      const { data } = await query;
      const list = (data as Activation[]) ?? [];
      setActivations(list);

      const counts: Record<string, number> = {};
      list.forEach((a) => {
        counts[a.channel] = (counts[a.channel] || 0) + 1;
      });
      setByChannel(counts);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel("activations-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cdp_activations" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Activations</h1>
        <p className="text-brand-muted mt-1 max-w-3xl">
          Live feed of audience signals being sent to advertising channels and
          onsite tools. In production, these would fire to Meta CAPI, Snap
          Ads API, TikTok Events API, Google Ads Customer Match, and CRM
          email triggers.
        </p>
        <p className="text-brand-dim text-xs mt-2">
          All activations here are <span className="text-brand-warning">simulated</span> —
          payloads show what <em>would</em> be sent to each channel.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-brand-elevated rounded-md w-fit">
        <FilterTab
          active={filter === "manual"}
          onClick={() => setFilter("manual")}
          icon={<Hand className="w-3.5 h-3.5" />}
          label="Manual"
        />
        <FilterTab
          active={filter === "auto"}
          onClick={() => setFilter("auto")}
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Auto"
        />
        <FilterTab
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
        />
      </div>

      {/* Channel counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(CHANNELS).map(([key, ch]) => {
          const count = byChannel[key] ?? 0;
          if (count === 0) return null;
          return (
            <Card key={key} className="!p-3">
              <div className="text-xs text-brand-muted">
                {ch.emoji} {ch.shortLabel}
              </div>
              <div className="text-xl font-semibold mt-0.5">
                {loading ? "—" : formatNumber(count)}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Live feed */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-brand-accent" />
          {filter === "manual"
            ? "Manual Pushes"
            : filter === "auto"
            ? "Auto-Fired Activations"
            : "All Activity"}
        </CardTitle>
        <CardDescription>
          {filter === "manual"
            ? "Audiences pushed deliberately from the Audiences page or Builder"
            : filter === "auto"
            ? "Activations fired automatically when users entered new segments"
            : "Combined feed"}
        </CardDescription>

        {loading && (
          <div className="text-brand-muted text-sm py-6">Loading…</div>
        )}
        {!loading && activations.length === 0 && (
          <div className="text-brand-muted text-sm py-6">
            {filter === "manual"
              ? "No manual pushes yet. Go to the Audiences page or Builder and click 'Push to channels' to trigger one."
              : "No activations yet. Run segmentation from the Admin page."}
          </div>
        )}

        <div className="mt-4 space-y-1.5 max-h-[600px] overflow-y-auto">
          {activations.map((a) => {
            const seg = SEGMENTS[a.segment as keyof typeof SEGMENTS];
            const isManual = a.trigger_source === "manual";
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 py-2 px-3 rounded-md text-sm ${
                  isManual
                    ? "bg-brand-accent/5 border border-brand-accent/20 hover:bg-brand-accent/10"
                    : "hover:bg-brand-elevated"
                }`}
              >
                {isManual ? (
                  <Hand
                    className="w-3.5 h-3.5 text-brand-accent flex-shrink-0"
                    aria-label="Manual push"
                  />
                ) : (
                  <Zap
                    className="w-3.5 h-3.5 text-brand-muted flex-shrink-0"
                    aria-label="Auto-fired"
                  />
                )}
                <span className="text-xs text-brand-dim font-mono w-20 flex-shrink-0">
                  {new Date(a.triggered_at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                {seg && (
                  <Badge color={seg.colorKey} className="flex-shrink-0">
                    {seg.displayName}
                  </Badge>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-brand-dim flex-shrink-0" />
                <span className="flex-shrink-0 text-brand-text">
                  {getChannelEmoji(a.channel)} {getChannelLabel(a.channel)}
                </span>
                {isManual && a.campaign_name && (
                  <span className="text-xs text-brand-accent bg-brand-accent/10 px-1.5 py-0.5 rounded flex-shrink-0">
                    📋 {a.campaign_name}
                  </span>
                )}
                {isManual && a.audience_size && (
                  <span className="text-xs text-brand-muted flex-shrink-0">
                    · {formatNumber(a.audience_size)} users
                  </span>
                )}
                <span className="ml-auto text-xs text-brand-dim flex items-center gap-1.5">
                  {a.payload?.attributes?.game_affinity &&
                    a.payload.attributes.game_affinity !== "none" && (
                      <span className="bg-brand-elevated px-1.5 py-0.5 rounded">
                        🎮 {a.payload.attributes.game_affinity}
                      </span>
                    )}
                  {a.payload?.attributes?.price_tier &&
                    a.payload.attributes.price_tier !== "unknown" && (
                      <span className="bg-brand-elevated px-1.5 py-0.5 rounded">
                        💰 {a.payload.attributes.price_tier}
                      </span>
                    )}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
        active
          ? "bg-brand-surface text-brand-text"
          : "text-brand-muted hover:text-brand-text"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
