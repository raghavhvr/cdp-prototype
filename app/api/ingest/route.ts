import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single-event ingestion endpoint.
 * In production this would be hit by GTM with real user behavior.
 * In the prototype it lets you simulate live events from the UI.
 */
export async function POST(req: NextRequest) {
  try {
    const event = await req.json();

    // Basic validation
    if (!event.anonymous_id || !event.event_type || !event.session_id) {
      return NextResponse.json(
        { error: "Missing required fields: anonymous_id, event_type, session_id" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { error } = await supabase.from("cdp_events").insert({
      anonymous_id: event.anonymous_id,
      user_id: event.user_id ?? null,
      event_type: event.event_type,
      occurred_at: event.occurred_at ?? new Date().toISOString(),
      session_id: event.session_id,
      page_path: event.page_path ?? null,
      page_category: event.page_category ?? null,
      game_name: event.game_name ?? null,
      registration_step: event.registration_step ?? null,
      cart_value_aed: event.cart_value_aed ?? null,
      scroll_depth_pct: event.scroll_depth_pct ?? null,
      dwell_seconds: event.dwell_seconds ?? null,
      country_code: event.country_code ?? null,
      is_eligible: event.is_eligible ?? true,
      metadata: event.metadata ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
