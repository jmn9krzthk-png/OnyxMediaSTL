// Server-only Supabase client. Uses the SECRET key, which bypasses row-level security,
// so this file must only ever be imported by Netlify Functions (never by browser code).
import { createClient } from "@supabase/supabase-js";

let client;

export function adminDb() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY is not set");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
