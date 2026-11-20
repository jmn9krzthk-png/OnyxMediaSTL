// Lead pipeline helpers shared by the admin functions.
import { adminDb } from "./supabase.js";
import { stamp } from "./forms.js";

const ORDER = ["new", "contacted", "audit_sent", "meeting_set", "proposal_sent", "won"];

// Today + n days in St. Louis, as YYYY-MM-DD.
export function centralDatePlus(n) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Move a lead forward (never backward, never off "won"), set its next follow-up and add a dated note.
export async function touchLead(lead, { status, followUpDays, note }) {
  const patch = {};
  if (status) {
    const cur = ORDER.indexOf(lead.status), next = ORDER.indexOf(status);
    if (lead.status === "lost" || (lead.status !== "won" && next > cur)) patch.status = status;
  }
  if (followUpDays !== undefined && lead.status !== "won") patch.next_follow_up = centralDatePlus(followUpDays);
  if (note) {
    const { data } = await adminDb().from("leads").select("notes").eq("id", lead.id).single();
    const entry = `[${stamp()}] ${note}`;
    patch.notes = data && data.notes ? `${entry}\n\n${data.notes}` : entry;
  }
  if (!Object.keys(patch).length) return;
  const { error } = await adminDb().from("leads").update(patch).eq("id", lead.id);
  if (error) throw error;
}

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}
