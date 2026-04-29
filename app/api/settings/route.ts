import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.from("cdp_settings").select("*");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const settings: Record<string, unknown> = {};
    data?.forEach((row: any) => {
      settings[row.key] = row.value;
    });
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const key = body.key as string;
    const value = body.value;
    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("cdp_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
