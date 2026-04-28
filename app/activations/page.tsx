"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { SEGMENTS } from "@/lib/segments";
import { Card, CardTitle, CardDescription, Badge } from "@/components/ui";
import { formatNumber } from "@/lib/utils";
import { Send, ArrowRight } from "lucide-react";

interface Activation {
  id: number;
  identity_key: string;
  segment: string;
  channel: string;
  status: string;
  triggered_at: string;
  payload: any;
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: "Meta (Facebook + Instagram)",
  google_ads: "Google Ads",
  onsite_modal: "Onsite Modal",
  email_crm: "Email / CRM",
  third_party_dsp: "Third-party DSP",
};

const CHANNEL_COLORS: Record<string, "danger" | "warning" | "info" | "success" | "muted" | "accent" | "dim"> = {
  meta: "info",
  google_ads: "warning",
  onsite_modal: "accent",
  email_crm: "success",
  third_party_dsp: "muted",
};

export default function ActivationsPage() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [byChannel, setByChannel] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = supabaseBrowser();

    async function load() {
      const { data } = await supabase
        .from("cdp_activations")
        .select("*")
        .order("triggered_at", { ascending: false })
        .limit(100);

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
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Activations</h1>
        <p className="text-brand-muted mt-1">
          Live feed of audience signals being sent to advertising channels and
          onsite tools. In production, these would fire to Meta CAPI, Google Ads
          Customer Match, the onsite modal, and CRM email triggers.
        </p>
        <p className="text-brand-dim text-xs mt-2">
          All activations here are <span className="text-brand-warning">simulated</span> —
          payloads show what <em>would</em> be sent to each channel.
        </p>
      </div>

      {/* Channel counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
          <Card key={key}>
            <Badge color={CHANNEL_COLORS[key]}>{label.split(" ")[0]}</Badge>
            <div className="text-2xl font-semibold mt-2">
              {loading ? "—" : formatNumber(byChannel[key] ?? 0)}
            </div>
            <div className="text-xs text-brand-dim">activations</div>
          </Card>
        ))}
      </div>

      {/* Live feed */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-brand-accent" />
          Live Activity
        </CardTitle>
        <CardDescription>
          Real-time feed of segment signals firing to channels
        </CardDescription>

        {loading && (
          <div className="text-brand-muted text-sm py-6">Loading…</div>
        )}
        {!loading && activations.length === 0 && (
          <div className="text-brand-muted text-sm py-6">
            No activations yet. Run segmentation from the Admin page to trigger
            them.
          </div>
        )}

        <div className="mt-4 space-y-2 max-h-[600px] overflow-y-auto">
          {activations.map((a) => {
            const seg = SEGMENTS[a.segment as keyof typeof SEGMENTS];
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-brand-elevated text-sm"
              >
                <span className="text-xs text-brand-dim font-mono w-20 flex-shrink-0">
                  {new Date(a.triggered_at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="font-mono text-xs text-brand-muted truncate w-32 flex-shrink-0">
                  {a.identity_key}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-brand-dim flex-shrink-0" />
                {seg && (
                  <Badge color={seg.colorKey} className="flex-shrink-0">
                    {seg.displayName}
                  </Badge>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-brand-dim flex-shrink-0" />
                <Badge
                  color={CHANNEL_COLORS[a.channel] ?? "muted"}
                  className="flex-shrink-0"
                >
                  {CHANNEL_LABELS[a.channel] ?? a.channel}
                </Badge>
                <span className="ml-auto text-xs text-brand-dim flex items-center gap-2">
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
                  {a.payload?.attributes?.recency && (
                    <span className="bg-brand-elevated px-1.5 py-0.5 rounded">
                      ⏱ {a.payload.attributes.recency}
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
