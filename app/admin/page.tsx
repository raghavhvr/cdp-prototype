"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription, Button, Badge } from "@/components/ui";
import { Database, Play, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

interface RunResult {
  ok: boolean;
  message: string;
  details?: any;
}

export default function AdminPage() {
  const [userCount, setUserCount] = useState(1000);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);

  function addResult(r: RunResult) {
    setResults((prev) => [r, ...prev].slice(0, 5));
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCount }),
      });
      const data = await res.json();
      if (data.ok) {
        addResult({
          ok: true,
          message: `Generated ${data.eventsInserted.toLocaleString()} events for ${data.userCount} users`,
          details: data,
        });
      } else {
        addResult({ ok: false, message: data.error ?? "Failed", details: data });
      }
    } catch (err) {
      addResult({
        ok: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
    setGenerating(false);
  }

  async function handleSegment() {
    setRunning(true);
    try {
      const res = await fetch("/api/segment", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.result) {
        const r = data.result;
        addResult({
          ok: true,
          message: `Processed ${r.profiles_processed} profiles · ${r.segment_changes} segment changes · ${Math.round(r.duration_ms)}ms`,
          details: r.segment_sizes,
        });
      } else {
        addResult({ ok: false, message: data.error ?? "Failed", details: data });
      }
    } catch (err) {
      addResult({
        ok: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
    setRunning(false);
  }

  async function handleReset() {
    if (!confirm("This will delete all CDP data (events, profiles, activations). Continue?")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        addResult({ ok: true, message: "All CDP data cleared." });
      } else {
        addResult({ ok: false, message: data.error ?? "Failed" });
      }
    } catch (err) {
      addResult({
        ok: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
    setResetting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-brand-muted mt-1">
          Generate dummy data, run the segmentation engine, and reset. Use this
          to drive your demo.
        </p>
      </div>

      {/* Demo flow */}
      <Card className="border-brand-accent/30 bg-brand-accent/5">
        <CardTitle>Demo flow</CardTitle>
        <CardDescription>
          For a clean demo: <strong>1.</strong> Click Generate Dummy Data.{" "}
          <strong>2.</strong> Click Run Segmentation. <strong>3.</strong> Open
          the Audiences and Activations tabs to walk through results.
        </CardDescription>
      </Card>

      {/* Step 1 */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center font-semibold flex-shrink-0">
            1
          </div>
          <div className="flex-1">
            <CardTitle>
              <Database className="w-5 h-5 inline mr-2 text-brand-accent" />
              Generate Dummy Data
            </CardTitle>
            <CardDescription>
              Creates realistic events for synthetic users — bouncers, browsers,
              cart abandoners, registrants, customers — with proper funnel
              ratios.
            </CardDescription>
            <div className="mt-4 flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-brand-dim mb-1">
                  Number of users
                </label>
                <input
                  type="number"
                  value={userCount}
                  onChange={(e) => setUserCount(parseInt(e.target.value) || 1000)}
                  min={100}
                  max={5000}
                  step={100}
                  className="bg-brand-elevated border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text w-32"
                />
                <div className="text-xs text-brand-dim mt-1">100 – 5,000</div>
              </div>
              <Button onClick={handleGenerate} loading={generating}>
                Generate
              </Button>
              <span className="text-xs text-brand-dim">
                Generates ~5-15 events per user. ~10–30 seconds.
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Step 2 */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center font-semibold flex-shrink-0">
            2
          </div>
          <div className="flex-1">
            <CardTitle>
              <Play className="w-5 h-5 inline mr-2 text-brand-accent" />
              Run Segmentation
            </CardTitle>
            <CardDescription>
              Rebuilds user profiles from raw events, applies priority-based
              segment assignment, and queues activations for users entering
              activatable segments.
            </CardDescription>
            <div className="mt-4">
              <Button onClick={handleSegment} loading={running} variant="primary">
                Run Now
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Step 3 */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-danger/15 text-brand-danger flex items-center justify-center font-semibold flex-shrink-0">
            ↺
          </div>
          <div className="flex-1">
            <CardTitle>
              <RotateCcw className="w-5 h-5 inline mr-2 text-brand-danger" />
              Reset Demo Data
            </CardTitle>
            <CardDescription>
              Clears events, user profiles, segment memberships, and
              activations. Use when restarting a demo.
            </CardDescription>
            <div className="mt-4">
              <Button onClick={handleReset} loading={resetting} variant="danger">
                Reset Everything
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Results log */}
      {results.length > 0 && (
        <Card>
          <CardTitle>Recent runs</CardTitle>
          <div className="mt-3 space-y-2">
            {results.map((r, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 py-2 px-3 rounded-md bg-brand-elevated text-sm"
              >
                {r.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-brand-success mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-brand-danger mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <div className={r.ok ? "text-brand-text" : "text-brand-danger"}>
                    {r.message}
                  </div>
                  {r.details && (
                    <pre className="text-xs text-brand-dim mt-1 overflow-auto">
                      {JSON.stringify(r.details, null, 2).slice(0, 400)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
