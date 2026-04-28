"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { SEGMENTS } from "@/lib/segments";
import { Card, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import { formatNumber, formatAed } from "@/lib/utils";
import { Search, User as UserIcon, Clock } from "lucide-react";

interface Profile {
  identity_key: string;
  anonymous_id: string | null;
  user_id: string | null;
  is_known: boolean;
  first_seen_at: string;
  last_seen_at: string;
  total_sessions: number;
  total_page_views: number;
  total_game_views: number;
  total_cart_adds: number;
  total_purchases: number;
  current_cart_value_aed: number | null;
  has_active_cart: boolean;
  has_started_registration: boolean;
  registration_drop_off_step: string | null;
  total_dwell_seconds: number;
  preferred_game: string | null;
  country_code: string | null;
  is_eligible: boolean;
  current_segment: string;
}

interface Event {
  id: number;
  event_type: string;
  occurred_at: string;
  page_path: string | null;
  page_category: string | null;
  game_name: string | null;
  registration_step: string | null;
  cart_value_aed: number | null;
  dwell_seconds: number | null;
}

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    setLoading(true);
    const supabase = supabaseBrowser();
    const { data } = await supabase
      .from("cdp_user_profiles")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(100);
    setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  }

  async function loadEvents(profile: Profile) {
    setSelected(profile);
    const supabase = supabaseBrowser();
    let query = supabase.from("cdp_events").select("*");

    if (profile.user_id && profile.anonymous_id) {
      query = query.or(
        `user_id.eq.${profile.user_id},anonymous_id.eq.${profile.anonymous_id}`
      );
    } else if (profile.user_id) {
      query = query.eq("user_id", profile.user_id);
    } else if (profile.anonymous_id) {
      query = query.eq("anonymous_id", profile.anonymous_id);
    }

    const { data } = await query
      .order("occurred_at", { ascending: false })
      .limit(50);
    setEvents((data as Event[]) ?? []);
  }

  const filtered = profiles.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.identity_key.toLowerCase().includes(s) ||
      (p.anonymous_id?.toLowerCase().includes(s) ?? false) ||
      (p.user_id?.toLowerCase().includes(s) ?? false) ||
      p.current_segment.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">User Lookup</h1>
        <p className="text-brand-muted mt-1">
          Search any user and see the full picture — their events, segment, and
          why they ended up in that audience.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: list */}
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input
              type="text"
              placeholder="Search by ID or segment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-brand-surface border border-brand-border rounded-md pl-9 pr-3 py-2 text-sm text-brand-text placeholder-brand-dim focus:outline-none focus:border-brand-accent"
            />
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {loading && (
              <div className="text-brand-muted text-sm p-4">Loading users…</div>
            )}
            {!loading && filtered.length === 0 && (
              <Card>
                <CardDescription>
                  No users yet. Generate dummy data from the Admin page.
                </CardDescription>
              </Card>
            )}
            {filtered.map((p) => {
              const seg = SEGMENTS[p.current_segment as keyof typeof SEGMENTS];
              const isSelected = selected?.identity_key === p.identity_key;
              return (
                <button
                  key={p.identity_key}
                  onClick={() => loadEvents(p)}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${
                    isSelected
                      ? "bg-brand-elevated border-brand-accent/50"
                      : "bg-brand-surface border-brand-border hover:border-brand-accent/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-brand-muted truncate">
                      {p.identity_key}
                    </span>
                    {p.is_known ? (
                      <Badge color="success">Known</Badge>
                    ) : (
                      <Badge color="dim">Anon</Badge>
                    )}
                  </div>
                  {seg && (
                    <Badge color={seg.colorKey} className="mt-2">
                      {seg.displayName}
                    </Badge>
                  )}
                  <div className="text-xs text-brand-dim mt-2">
                    {p.total_sessions} sessions · {p.total_page_views} pages
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column: profile detail */}
        <div className="lg:col-span-2">
          {!selected && (
            <Card>
              <CardTitle>Select a user</CardTitle>
              <CardDescription>
                Click any user from the list to see their full profile and event
                history.
              </CardDescription>
            </Card>
          )}

          {selected && (
            <div className="space-y-4">
              <UserDetail profile={selected} />
              <EventTimeline events={events} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserDetail({ profile }: { profile: Profile }) {
  const seg = SEGMENTS[profile.current_segment as keyof typeof SEGMENTS];

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-brand-accent" />
            {profile.identity_key}
          </CardTitle>
          <CardDescription>
            First seen{" "}
            {new Date(profile.first_seen_at).toLocaleDateString()} · Last seen{" "}
            {new Date(profile.last_seen_at).toLocaleDateString()}
          </CardDescription>
        </div>
        {seg && (
          <div className="text-right">
            <div className="text-xs text-brand-dim">CURRENT SEGMENT</div>
            <Badge color={seg.colorKey} className="text-sm mt-1">
              {seg.displayName}
            </Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Stat label="Sessions" value={formatNumber(profile.total_sessions)} />
        <Stat label="Page Views" value={formatNumber(profile.total_page_views)} />
        <Stat label="Game Views" value={formatNumber(profile.total_game_views)} />
        <Stat
          label="Dwell"
          value={`${Math.round(profile.total_dwell_seconds / 60)}m`}
        />
        <Stat label="Cart Adds" value={formatNumber(profile.total_cart_adds)} />
        <Stat label="Purchases" value={formatNumber(profile.total_purchases)} />
        <Stat
          label="Cart Value"
          value={
            profile.current_cart_value_aed
              ? formatAed(profile.current_cart_value_aed)
              : "—"
          }
        />
        <Stat label="Country" value={profile.country_code ?? "—"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {profile.is_known && <Badge color="success">Registered user</Badge>}
        {profile.has_active_cart && <Badge color="danger">Active cart</Badge>}
        {profile.has_started_registration && (
          <Badge color="warning">
            Reg dropped at: {profile.registration_drop_off_step ?? "?"}
          </Badge>
        )}
        {!profile.is_eligible && <Badge color="dim">Ineligible</Badge>}
        {profile.preferred_game && (
          <Badge color="info">Likes: {profile.preferred_game}</Badge>
        )}
      </div>

      {seg && (
        <div className="mt-4 pt-4 border-t border-brand-border">
          <div className="text-xs text-brand-dim mb-1">WHY THIS SEGMENT</div>
          <p className="text-sm text-brand-muted">{seg.whyItMatters}</p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-brand-dim uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function EventTimeline({ events }: { events: Event[] }) {
  return (
    <Card>
      <CardTitle>
        <Clock className="w-5 h-5 inline mr-2 text-brand-accent" />
        Event History
      </CardTitle>
      <CardDescription>Last 50 events, most recent first</CardDescription>

      {events.length === 0 ? (
        <div className="text-brand-muted text-sm py-6">No events found.</div>
      ) : (
        <div className="mt-4 space-y-1 max-h-[400px] overflow-y-auto">
          {events.map((e) => (
            <div
              key={e.id}
              className="text-xs font-mono flex items-center gap-3 py-1.5 px-2 rounded hover:bg-brand-elevated"
            >
              <span className="text-brand-dim flex-shrink-0 w-32">
                {new Date(e.occurred_at).toLocaleString("en-GB", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-brand-accent flex-shrink-0 w-40 truncate">
                {e.event_type}
              </span>
              <span className="text-brand-muted truncate">
                {e.page_category}
                {e.game_name && ` · ${e.game_name}`}
                {e.registration_step && ` · step: ${e.registration_step}`}
                {e.cart_value_aed && ` · ${formatAed(e.cart_value_aed)}`}
                {e.dwell_seconds && ` · ${e.dwell_seconds}s`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
