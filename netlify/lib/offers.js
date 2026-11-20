// Package offers (proposals): load an offer with its packages and work out the totals.
import { adminDb } from "./supabase.js";

export const TOKEN_RE = /^[a-f0-9]{64}$/;

export function siteUrl() {
  return (process.env.URL || "https://onyxmediastl.com").replace(/\/$/, "");
}

export function offerUrl(token) {
  return `${siteUrl()}/proposal.html?t=${token}`;
}

export function money(n) {
  const v = Number(n || 0);
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

// Find by { id } or { token }. Returns null if not found.
export async function loadOffer({ id, token }) {
  const db = adminDb();
  let q = db.from("package_offers").select("*");
  q = id ? q.eq("id", id) : q.eq("public_token", token);
  const { data: offer, error } = await q.maybeSingle();
  if (error) throw error;
  if (!offer) return null;

  const [{ data: lead, error: lErr }, { data: pk, error: pErr }] = await Promise.all([
    db.from("leads").select("id, name, business, email, phone, status, notes").eq("id", offer.lead_id).single(),
    offer.package_ids.length
      ? db.from("packages").select("id, name, category, monthly_price, setup_fee, deliverables").in("id", offer.package_ids)
      : Promise.resolve({ data: [] }),
  ]);
  if (lErr) throw lErr;
  if (pErr) throw pErr;

  // Keep the order Max picked; content first, then ads.
  const packages = (pk || []).sort((a, b) =>
    a.category === b.category ? offer.package_ids.indexOf(a.id) - offer.package_ids.indexOf(b.id) : a.category === "content" ? -1 : 1);
  const listMonthly = packages.reduce((s, p) => s + Number(p.monthly_price), 0);
  const listSetup = packages.reduce((s, p) => s + Number(p.setup_fee), 0);
  const monthly = offer.custom_monthly_price !== null ? Number(offer.custom_monthly_price) : listMonthly;
  const setup = offer.custom_setup_fee !== null ? Number(offer.custom_setup_fee) : listSetup;
  return { offer, lead, packages, totals: { listMonthly, listSetup, monthly, setup } };
}

// Plain-text summary used in emails to Max.
export function offerSummary({ packages, totals, offer }) {
  const lines = packages.map((p) => `• ${p.name}: ${money(p.monthly_price)}/mo` + (Number(p.setup_fee) ? ` + ${money(p.setup_fee)} setup` : ""));
  lines.push(`Monthly total: ${money(totals.monthly)}/mo` + (totals.monthly !== totals.listMonthly ? ` (custom; list ${money(totals.listMonthly)})` : ""));
  lines.push(`Setup: ${money(totals.setup)}` + (totals.setup !== totals.listSetup ? ` (custom; list ${money(totals.listSetup)})` : ""));
  if (offer.waive_setup_with_prepay && totals.setup > 0) lines.push("Setup waived if the first month is paid upfront");
  return lines.join("\n");
}
