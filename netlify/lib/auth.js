// Admin-only Netlify Functions: verify the caller's Supabase session and admin role.
// The browser sends its access token as "Authorization: Bearer <token>".
import { adminDb } from "./supabase.js";
import { HttpError } from "./forms.js";

export async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Your session expired. Sign in again.");
  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) throw new HttpError(401, "Your session expired. Sign in again.");
  const { data: prof, error: pErr } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (pErr) throw pErr;
  if (!prof || prof.role !== "admin") throw new HttpError(403, "Admins only.");
  return data.user;
}
