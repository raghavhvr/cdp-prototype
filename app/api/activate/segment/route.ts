import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Push an entire segment to one or more channels.
 * Body: { segment: string, channels: string[], campaignName?: string, creativeId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const segment = body.segment as string;
    const channels = (body.channels as string[]) || [];
    const campaignName = (body.campaignName as string) || null;
    const creativeId = (body.creativeId as string) || null;

    if (!segment) {
      return NextResponse.json({ error: "segment required" }, { status: 400 });
    }
    if (!channels.length) {
      return NextResponse.json(
        { error: "at least one channel required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Use the push_audience SQL function: empty filters = whole segment
    const { data, error } = await supabase.rpc("push_audience", {
      p_segment: segment,
      p_attribute_filters: {},
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
