// POST /api/send-offer (admin only) — emails the prospect a link to their proposal page,
// records sent_at, moves the lead to "proposal_sent" and sets a follow-up in 3 days.
import { readBody, clean, formHandler, HttpError } from "../lib/forms.js";
import { requireAdmin } from "../lib/auth.js";
import { adminDb } from "../lib/supabase.js";
import { sendEmail, prospectEmail, htmlToText, esc } from "../lib/email.js";
import { touchLead, firstName } from "../lib/pipeline.js";
import { loadOffer, offerUrl } from "../lib/offers.js";

export const config = { path: "/api/send-offer" };

export default formHandler(async (req) => {
  await requireAdmin(req);
  const body = await readBody(req);
  const found = await loadOffer({ id: clean(body.offerId, 40) });
  if (!found) throw new HttpError(404, "Proposal not found.");
  const { offer, lead, packages } = found;
  if (!packages.length) throw new HttpError(400, "This proposal has no packages.");
  if (!lead.email) throw new HttpError(400, "This lead has no email address. Add one with Edit contact.");
  const message = clean(body.message, 2000);
  const url = offerUrl(offer.public_token);

  const html = prospectEmail({
    paragraphs: [
      `Hi ${esc(firstName(lead.name))},`,
      `Thanks for talking with me. Here's the plan I put together${lead.business ? ` for <strong>${esc(lead.business)}</strong>` : ""}: what's included, the monthly price, and the setup.`,
      ...(message ? [esc(message).replace(/\n/g, "<br>")] : []),
      `If it looks right, click <strong>Accept</strong> on the page and I'll send over your invoice and service agreement. Nothing is charged until then.`,
    ],
    button: { url, label: "View your proposal" },
  });
  const sent = await sendEmail({
    to: lead.email, replyTo: process.env.ALERT_EMAIL_TO || "max@onyxmediastl.com",
    subject: `Your Onyx Media proposal${lead.business ? ` – ${lead.business}` : ""}`, html, text: htmlToText(html),
  });
  if (!sent) throw new HttpError(502, "The email didn't send. Check Resend, then try again.");

  const { error } = await adminDb().from("package_offers").update({ sent_at: new Date().toISOString() }).eq("id", offer.id);
  if (error) throw error;
  await touchLead(lead, { status: "proposal_sent", followUpDays: 3, note: `Proposal emailed to ${lead.email}` });
  return Response.json({ ok: true, url }, { headers: { "Cache-Control": "no-store" } });
});
