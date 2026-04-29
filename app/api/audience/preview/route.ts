import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview audience: returns the matching count and 5 sample users.
 * Body: { segment: string | null, filters: Record<string, string[]> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const segment = (body.segment as string | null) ?? null;
    const filters = (body.filters as Record<string, string[]>) || {};

    const supabase = supabaseAdmin();
    const { data, error } = await supabase.rpc("preview_audience", {
      p_segment: segment ?? "",
      p_attribute_filters: filters,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
