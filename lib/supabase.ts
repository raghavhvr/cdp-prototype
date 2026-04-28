import { createClient } from "@supabase/supabase-js";

// Browser client — uses publishable key, respects RLS, safe to use in client components
export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

// Server client — uses secret key, bypasses RLS
// Only call this from API routes or server components, NEVER from client code
export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
