import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Push a filtered audience (primary segment + attribute filters) to channels.
 * Body: {
 *   segment: string | null,
 *   filters: Record<string, string[]>,  // e.g. {"game_affinity":["mega7"], "price_tier":["high","mid"]}
 *   channels: string[],
 *   campaignName?: string,
 *   creativeId?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const segment = (body.segment as string | null) ?? null;
    const filters = (body.filters as Record<string, string[]>) || {};
    const channels = (body.channels as string[]) || [];
    const campaignName = (body.campaignName as string) || null;
    const creativeId = (body.creativeId as string) || null;

    if (!channels.length) {
      return NextResponse.json(
        { error: "at least one channel required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase.rpc("push_audience", {
      p_segment: segment ?? "",
      p_attribute_filters: filters,
      p_channels: channels,
      p_campaign_name: campaignName,
      p_creative_id: creativeId,
      p_max_users: 5000,
    });

    if (error) {
      console.error("push_audience error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
