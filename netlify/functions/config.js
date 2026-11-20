// GET /api/config — gives the admin page the Supabase URL and PUBLISHABLE key.
// The publishable key is designed to be public (row-level security protects the data);
// serving it from here keeps every key out of the repository. The secret key is never sent.
export const config = { path: "/api/config" };

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Supabase is not configured on this deploy." }, { status: 500 });
  }
  return Response.json({ supabaseUrl, supabaseKey }, { headers: { "Cache-Control": "no-store" } });
};
