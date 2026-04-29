"use client";

import { useState } from "react";
import { CHANNEL_GROUPS, CHANNELS, ChannelKey } from "@/lib/channels";
import { Button, Card, Badge } from "@/components/ui";
import { X, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface PushModalProps {
  open: boolean;
  onClose: () => void;
  /** What's being pushed — used in the header and confirm button label */
  audienceLabel: string;
  /** Estimated audience size to display */
  audienceSize: number;
  /** Pre-suggested channels (e.g., from segment recommendations) */
  suggestedChannels?: ChannelKey[];
  /** Callback receives chosen channels + metadata */
  onConfirm: (params: {
    channels: ChannelKey[];
    campaignName: string;
    creativeId: string;
  }) => Promise<void>;
}

export function PushModal({
  open,
  onClose,
  audienceLabel,
  audienceSize,
  suggestedChannels = [],
  onConfirm,
}: PushModalProps) {
  const [selected, setSelected] = useState<Set<ChannelKey>>(
    new Set(suggestedChannels)
  );
  const [campaignName, setCampaignName] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    audienceSize: number;
    channels: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function toggle(key: ChannelKey) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  async function handleSubmit() {
    if (!selected.size) {
      setError("Pick at least one channel.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        channels: Array.from(selected),
        campaignName: campaignName.trim(),
        creativeId: creativeId.trim(),
      });
      setSuccess({
        audienceSize,
        channels: Array.from(selected).map((c) => CHANNELS[c].label),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to push");
    }
    setSubmitting(false);
  }

  function handleClose() {
    setSelected(new Set(suggestedChannels));
    setCampaignName("");
    setCreativeId("");
    setSuccess(null);
    setError(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <Card
        className="w-full max-w-2xl mt-12 mb-12 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-brand-muted hover:text-brand-text"
        >
          <X className="w-5 h-5" />
        </button>

        {success ? (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-brand-success flex-shrink-0 mt-1" />
              <div>
                <div className="text-lg font-semibold">Audience activated</div>
                <p className="text-sm text-brand-muted mt-1">
                  Pushed <strong>{formatNumber(success.audienceSize)}</strong>{" "}
                  users to {success.channels.length} channel
                  {success.channels.length === 1 ? "" : "s"}: {success.channels.join(", ")}.
                </p>
                <p className="text-xs text-brand-dim mt-3">
                  In production, payloads go to Meta CAPI / Google Customer
                  Match / Snap Ads API / TikTok Events API. Here, the
                  Activations page shows what would have been sent.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button onClick={handleClose}>Close</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1 mb-4 pr-8">
              <div className="text-xs text-brand-dim uppercase tracking-wide">
                Push audience
              </div>
              <div className="text-xl font-semibold flex items-center gap-2 flex-wrap">
                <span>{audienceLabel}</span>
                <Badge color="accent" className="text-base">
                  {formatNumber(audienceSize)} users
                </Badge>
              </div>
            </div>

            {/* Channels */}
            <div className="space-y-3 mb-5">
              <div className="text-xs text-brand-dim uppercase tracking-wide">
                Pick channels
              </div>
              {Object.entries(CHANNEL_GROUPS).map(([groupKey, group]) => (
                <div key={groupKey}>
                  <div className="text-xs text-brand-muted mb-1.5">
                    {group.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.channels.map((channelKey) => {
                      const c = CHANNELS[channelKey];
                      const active = selected.has(channelKey);
                      return (
                        <button
                          key={channelKey}
                          onClick={() => toggle(channelKey)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                            active
                              ? "border-brand-accent bg-brand-accent/10 text-brand-text"
                              : "border-brand-border bg-brand-elevated text-brand-muted hover:text-brand-text hover:border-brand-accent/40"
                          }`}
                        >
                          <span>{c.emoji}</span>
                          <span>{c.label}</span>
                          {active && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-brand-accent" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Optional metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-xs text-brand-dim uppercase tracking-wide mb-1">
                  Campaign name (optional)
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Q2_AbandonCart_Recovery"
                  className="w-full bg-brand-elevated border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text placeholder-brand-dim focus:outline-none focus:border-brand-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-brand-dim uppercase tracking-wide mb-1">
                  Creative ID (optional)
                </label>
                <input
                  type="text"
                  value={creativeId}
                  onChange={(e) => setCreativeId(e.target.value)}
                  placeholder="e.g. mega7_urgency_v2"
                  className="w-full bg-brand-elevated border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text placeholder-brand-dim focus:outline-none focus:border-brand-accent"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-brand-danger/10 border border-brand-danger/30 text-sm text-brand-danger mb-4">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-brand-border">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                loading={submitting}
                disabled={!selected.size}
              >
                <Send className="w-4 h-4" />
                Push to {selected.size} channel
                {selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
