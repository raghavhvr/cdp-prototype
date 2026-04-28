import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel: extend max duration for segmentation runs at scale.
// Free tier caps at 60s, Pro at 300s. The DB function itself has its own 5min timeout.
export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.rpc("run_segmentation");

    if (error) {
      console.error("Segmentation error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
