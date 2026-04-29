"use client";

import { useEffect, useState } from "react";
import {
  SEGMENTS,
  SEGMENTS_BY_PRIORITY,
  SegmentKey,
  ATTRIBUTES,
  ATTRIBUTES_LIST,
  AttributeKey,
  getAttributeLabel,
} from "@/lib/segments";
import { ChannelKey } from "@/lib/channels";
import {
  Card,
  CardTitle,
  CardDescription,
  Badge,
  Button,
} from "@/components/ui";
import { PushModal } from "@/components/PushModal";
import { formatNumber, formatAed } from "@/lib/utils";
import { Wand2, Users, Send, RotateCcw, Filter } from "lucide-react";

type Filters = Partial<Record<AttributeKey, string[]>>;

interface PreviewResult {
  count: number;
  samples: any[];
}

export default function BuilderPage() {
  const [segment, setSegment] = useState<SegmentKey | "any">("any");
  const [filters, setFilters] = useState<Filters>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);

  // Refresh preview whenever filters or segment change. Debounced.
  useEffect(() => {
    const handle = setTimeout(() => {
      runPreview();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, filters]);

  async function runPreview() {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/audience/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: segment === "any" ? null : segment,
          filters,
        }),
      });
      const data = await res.json();
      if (data.ok && data.result) {
        setPreview({
          count: data.result.count ?? 0,
          samples: data.result.samples ?? [],
        });
      }
    } catch (err) {
      console.error(err);
    }
    setPreviewLoading(false);
  }

  function toggleFilter(attrKey: AttributeKey, value: string) {
    setFilters((prev) => {
      const current = prev[attrKey] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const updated = { ...prev };
      if (next.length === 0) delete updated[attrKey];
      else updated[attrKey] = next;
      return updated;
    });
  }

  function clearAll() {
    setSegment("any");
    setFilters({});
  }

  async function handlePush(params: {
    channels: ChannelKey[];
    campaignName: string;
    creativeId: string;
  }) {
    const res = await fetch("/api/activate/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment: segment === "any" ? null : segment,
        filters,
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

  const audienceLabel = (() => {
    const parts: string[] = [];
    if (segment !== "any") parts.push(SEGMENTS[segment].displayName);
    else parts.push("Any segment");
    const filterCount = Object.keys(filters).length;
    if (filterCount > 0) parts.push(`+ ${filterCount} filter${filterCount > 1 ? "s" : ""}`);
    return parts.join(" ");
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <Wand2 className="w-7 h-7 text-brand-accent" />
          Audience Builder
        </h1>
        <p className="text-brand-muted mt-1 max-w-3xl">
          Combine a primary segment with sub-attributes to build a focused
          audience for campaigns. The matching count updates as you go — push
          to channels when ready.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Primary segment */}
          <Card>
            <CardTitle>
              <Filter className="w-5 h-5 inline mr-2 text-brand-accent" />
              Primary Segment
            </CardTitle>
            <CardDescription>
              Pick a segment to start with, or leave as &ldquo;Any segment&rdquo; to
              filter on attributes only.
            </CardDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setSegment("any")}
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  segment === "any"
                    ? "border-brand-accent bg-brand-accent/10 text-brand-text"
                    : "border-brand-border bg-brand-elevated text-brand-muted hover:text-brand-text"
                }`}
              >
                Any segment
              </button>
              {SEGMENTS_BY_PRIORITY.filter(
                (s) => s.priority < 90 && s.shouldActivate
              ).map((s) => {
                const active = segment === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSegment(s.key)}
                    className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                      active
                        ? "border-brand-accent bg-brand-accent/10 text-brand-text"
                        : "border-brand-border bg-brand-elevated text-brand-muted hover:text-brand-text"
                    }`}
                  >
                    {s.displayName}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Attribute filters */}
          {ATTRIBUTES_LIST.map((attr) => {
            const selected = filters[attr.key] ?? [];
            return (
              <Card key={attr.key}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-base">
                      {attr.displayName}
                    </CardTitle>
                    <CardDescription>{attr.description}</CardDescription>
                  </div>
                  {selected.length > 0 && (
                    <Badge color="accent">
                      {selected.length} selected
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {attr.values.map((v) => {
                    const active = selected.includes(v.value);
                    return (
                      <button
                        key={v.value}
                        onClick={() => toggleFilter(attr.key, v.value)}
                        className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                          active
                            ? "border-brand-accent bg-brand-accent/10 text-brand-text"
                            : "border-brand-border bg-brand-elevated text-brand-muted hover:text-brand-text"
                        }`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={clearAll}>
              <RotateCcw className="w-3.5 h-3.5" />
              Clear all
            </Button>
          </div>
        </div>

        {/* Preview column */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="sticky top-24">
            <div className="text-xs text-brand-dim uppercase tracking-wide">
              Matching audience
            </div>
            <div className="text-4xl font-semibold mt-1">
              {previewLoading ? "…" : formatNumber(preview?.count ?? 0)}
            </div>
            <div className="text-xs text-brand-muted mt-1">users match your filters</div>

            <Button
              onClick={() => setPushOpen(true)}
              disabled={!preview || preview.count === 0}
              className="w-full mt-4"
            >
              <Send className="w-4 h-4" />
              Push to channels
            </Button>

            {/* Active filters summary */}
            {(segment !== "any" || Object.keys(filters).length > 0) && (
              <div className="mt-5 pt-5 border-t border-brand-border">
                <div className="text-xs text-brand-dim uppercase tracking-wide mb-2">
                  Active filters
                </div>
                <div className="space-y-2">
                  {segment !== "any" && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-brand-dim w-20 flex-shrink-0">Segment</span>
                      <Badge color={SEGMENTS[segment].colorKey}>
                        {SEGMENTS[segment].displayName}
                      </Badge>
                    </div>
                  )}
                  {Object.entries(filters).map(([key, values]) => {
                    const attr = ATTRIBUTES[key as AttributeKey];
                    return (
                      <div
                        key={key}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="text-brand-dim w-20 flex-shrink-0">
                          {attr.displayName}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {values.map((v) => (
                            <span
                              key={v}
                              className="bg-brand-elevated text-brand-text px-1.5 py-0.5 rounded"
                            >
                              {getAttributeLabel(key as AttributeKey, v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sample users */}
            {preview && preview.samples.length > 0 && (
              <div className="mt-5 pt-5 border-t border-brand-border">
                <div className="text-xs text-brand-dim uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Sample users
                </div>
                <div className="space-y-2">
                  {preview.samples.slice(0, 5).map((s, i) => (
                    <div
                      key={i}
                      className="text-xs bg-brand-elevated rounded p-2"
                    >
                      <div className="font-mono text-brand-muted truncate">
                        {s.identity_key}
                      </div>
                      <div className="text-brand-dim mt-0.5">
                        {s.total_sessions}s · {s.total_page_views}pv
                        {s.preferred_game && ` · ${s.preferred_game}`}
                        {s.country_code && ` · ${s.country_code}`}
                        {(s.current_cart_value_aed ?? 0) > 0 &&
                          ` · ${formatAed(s.current_cart_value_aed)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <PushModal
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        audienceLabel={audienceLabel}
        audienceSize={preview?.count ?? 0}
        onConfirm={handlePush}
      />
    </div>
  );
}
