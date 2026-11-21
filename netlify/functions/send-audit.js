// POST /api/send-audit (admin only) — emails the prospect a 30-day download link to their audit PDF,
// marks the audit "sent", moves the lead to "audit_sent" and sets a follow-up in 3 days.
import { readBody, clean, respond, formHandler, HttpError } from "../lib/forms.js";
import { requireAdmin } from "../lib/auth.js";
import { adminDb } from "../lib/supabase.js";
import { sendEmail, prospectEmail, htmlToText, esc } from "../lib/email.js";
import { touchLead, firstName } from "../lib/pipeline.js";

export const config = { path: "/api/send-audit" };
const LINK_DAYS = 30;

export default formHandler(async (req) => {
  await requireAdmin(req);
  const body = await readBody(req);
  const auditId = clean(body.auditId, 40);
  const message = clean(body.message, 2000);
  const db = adminDb();

  const { data: audit, error } = await db.from("audit_requests").select("id, lead_id, audit_pdf_path").eq("id", auditId).maybeSingle();
  if (error) throw error;
  if (!audit) throw new HttpError(404, "Audit not found.");
  if (!audit.audit_pdf_path) throw new HttpError(400, "Upload the audit PDF first.");
  const { data: lead, error: lErr } = await db.from("leads").select("id, name, business, email, status").eq("id", audit.lead_id).single();
  if (lErr) throw lErr;
  if (!lead.email) throw new HttpError(400, "This lead has no email address. Add one with Edit contact.");

  const { data: signed, error: sErr } = await db.storage.from("audits").createSignedUrl(audit.audit_pdf_path, LINK_DAYS * 86400, { download: true });
  if (sErr) throw sErr;

  const biz = lead.business ? ` for <strong>${esc(lead.business)}</strong>` : "";
  const html = prospectEmail({
    paragraphs: [
      `Hi ${esc(firstName(lead.name))},`,
      `Your free content &amp; ads audit${biz} is ready. It covers your website, social pages, Google profile and ads, with the top things we'd fix or film first.`,
      ...(message ? [esc(message).replace(/\n/g, "<br>")] : []),
      `The download link works for ${LINK_DAYS} days. Want to walk through it together? Reply to this email or call or text 636.385.3995.`,
    ],
    button: { url: signed.signedUrl, label: "Download your audit (PDF)" },
  });
  const sent = await sendEmail({
    to: lead.email, replyTo: process.env.ALERT_EMAIL_TO || "max@onyxmediastl.com",
    subject: `Your content & ads audit${lead.business ? ` – ${lead.business}` : ""}`, html, text: htmlToText(html),
  });
  if (!sent) throw new HttpError(502, "The email didn't send. Check Resend, then try again.");

  const { error: uErr } = await db.from("audit_requests").update({ status: "sent" }).eq("id", audit.id);
  if (uErr) throw uErr;
  await touchLead(lead, { status: "audit_sent", followUpDays: 3, note: `Audit emailed to ${lead.email}` });
  return respond(req, { ok: true });
});
