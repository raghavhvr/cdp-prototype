import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateDataset } from "@/lib/dummy-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userCount = Math.min(Math.max(parseInt(body.userCount) || 1000, 100), 5000);

    const events = generateDataset(userCount);
    const supabase = supabaseAdmin();

    // Insert in chunks to avoid hitting payload limits
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      const { error } = await supabase.from("cdp_events").insert(chunk);
      if (error) {
        console.error("Insert error:", error);
        return NextResponse.json(
          { error: error.message, inserted },
          { status: 500 }
        );
      }
      inserted += chunk.length;
    }

    return NextResponse.json({
      ok: true,
      userCount,
      eventsGenerated: events.length,
      eventsInserted: inserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
