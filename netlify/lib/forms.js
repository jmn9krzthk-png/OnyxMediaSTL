// Shared helpers for the public website forms: body parsing, spam checks, validation, responses.
import { adminDb } from "./supabase.js";

const MAX_BODY = 20_000; // bytes

// Accept JSON (sent by site.js) or a normal form post (if JavaScript is off).
export async function readBody(req) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "Too much data.");
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      throw new HttpError(400, "Could not read the form.");
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Trim, drop control characters, cap length. Returns "" for missing values.
export function clean(v, max = 200) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

export function cleanEmail(v) {
  const s = clean(v, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : "";
}

// Requires at least 10 digits; returns a tidy display format for US numbers.
export function cleanPhone(v) {
  const s = clean(v, 40);
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d.length >= 10 && d.length <= 15 ? s : "";
}

// Optional URL: adds https:// if missing; returns "" if empty, null if not a valid web address.
export function cleanUrl(v) {
  let s = clean(v, 300);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function pick(v, allowed, fallback = "") {
  const s = clean(v, 100);
  return allowed.includes(s) ? s : fallback;
}

// Spam signals. Returns a reason string if the submission looks like a bot, otherwise "".
export function spamReason(body, textFields = []) {
  if (clean(body["bot-field"])) return "honeypot";
  const t = Number(body.t);
  if (Number.isFinite(t) && t > 0) {
    const age = Date.now() - t;
    if (age < 3000) return "too-fast";
  }
  const text = textFields.map((f) => String(body[f] || "")).join(" ");
  if ((text.match(/https?:\/\//gi) || []).length > 3) return "too-many-links";
  if (/<a\s+href|\[url=/i.test(text)) return "html-links";
  return "";
}

// Today's date in St. Louis, as YYYY-MM-DD.
export function todayCentral() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function stamp() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Find the most recent lead with this email, or create one. A returning prospect gets a
// dated note and is put back on today's follow-up list instead of becoming a duplicate.
// Returns { lead, isNew, duplicate } — duplicate is true for an identical resubmission
// within the last 2 minutes (double-clicks, bots), which callers should not re-alert on.
export async function upsertLead({ name, business, email, phone, industry, source, note }) {
  const db = adminDb();
  const today = todayCentral();
  const { data: existing, error: findErr } = await db
    .from("leads")
    .select("id, name, business, phone, industry, notes, next_follow_up, updated_at")
    .ilike("email", email.replace(/[\\%_]/g, (c) => "\\" + c))
    .order("created_at", { ascending: false })
    .limit(1);
  if (findErr) throw findErr;

  const entry = `[${stamp()}] ${note}`;
  if (existing && existing.length) {
    const lead = existing[0];
    if (Date.now() - new Date(lead.updated_at).getTime() < 120_000 && (lead.notes || "").includes(note)) {
      return { lead, isNew: false, duplicate: true };
    }
    // Keep what they typed this time if it differs from what we have, so nothing is lost.
    const diffs = [];
    if (business && lead.business && business.toLowerCase() !== lead.business.toLowerCase()) diffs.push(`Business entered: ${business}`);
    if (phone && lead.phone && phone.replace(/\D/g, "") !== lead.phone.replace(/\D/g, "")) diffs.push(`Phone entered: ${phone}`);
    if (name && lead.name && name.toLowerCase() !== lead.name.toLowerCase()) diffs.push(`Name entered: ${name}`);
    const full = diffs.length ? `${entry}\n${diffs.join("\n")}` : entry;
    const patch = {
      notes: lead.notes ? `${full}\n\n${lead.notes}` : full,
      next_follow_up: !lead.next_follow_up || lead.next_follow_up > today ? today : lead.next_follow_up,
    };
    if (!lead.business && business) patch.business = business;
    if (!lead.phone && phone) patch.phone = phone;
    if (!lead.industry && industry) patch.industry = industry;
    const { data, error } = await db.from("leads").update(patch).eq("id", lead.id).select("id").single();
    if (error) throw error;
    return { lead: data, isNew: false, duplicate: false };
  }

  const { data, error } = await db
    .from("leads")
    .insert({ name, business: business || null, email, phone: phone || null, industry: industry || null,
              source, status: "new", notes: entry, next_follow_up: today })
    .select("id")
    .single();
  if (error) throw error;
  return { lead: data, isNew: true, duplicate: false };
}

// JSON for fetch() callers; a redirect for plain HTML form posts (JavaScript off).
export function respond(req, { ok, error, status = 200, redirect }) {
  const wantsJson = (req.headers.get("accept") || "").includes("application/json");
  if (!wantsJson && redirect && ok) {
    return new Response(null, { status: 303, headers: { Location: redirect } });
  }
  if (!wantsJson && !ok) {
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Form error</title><p style="font:18px Arial;padding:24px">${String(error).replace(/</g, "&lt;")}<br><br><a href="javascript:history.back()">Go back</a> or call/text 636.385.3995.</p>`,
      { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return Response.json(ok ? { ok: true } : { ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

// Wraps a form handler with method checks and error handling.
export function formHandler(fn) {
  return async (req) => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return respond(req, { ok: false, error: err.message, status: err.status });
      console.error("form error", err);
      return respond(req, { ok: false, status: 500,
        error: "Something went wrong on our end. Please call or text 636.385.3995, or email max@onyxmediastl.com." });
    }
  };
}
