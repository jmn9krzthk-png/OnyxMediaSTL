// POST /api/offer-accept — public. The prospect accepts a proposal. Records it, emails Max to
// prepare the invoice and contract, and confirms to the prospect. Nothing is charged here.
import { readBody, clean, spamReason, respond, formHandler, HttpError } from "../lib/forms.js";
import { adminDb } from "../lib/supabase.js";
import { sendAlert, sendEmail, prospectEmail, htmlToText, esc } from "../lib/email.js";
import { loadOffer, TOKEN_RE, offerSummary, money } from "../lib/offers.js";
import { touchLead, firstName } from "../lib/pipeline.js";

export const config = { path: "/api/offer-accept" };

export default formHandler(async (req) => {
  const body = await readBody(req);
  const token = clean(body.token, 64);
  if (!TOKEN_RE.test(token)) throw new HttpError(404, "This proposal link isn't valid.");
  if (spamReason(body, ["note"])) return respond(req, { ok: true });

  const name = clean(body.name, 120);
  if (!name) throw new HttpError(400, "Type your name to accept.");
  const note = clean(body.note, 2000) || null;

  const found = await loadOffer({ token });
  if (!found) throw new HttpError(404, "This proposal link isn't valid.");
  const { offer, lead, totals } = found;
  if (!offer.sent_at) throw new HttpError(400, "This proposal hasn't been sent yet.");
  if (offer.accepted_at) return respond(req, { ok: true }); // already accepted; nothing to do

  const prepay = offer.waive_setup_with_prepay && totals.setup > 0 ? clean(body.prepay, 5) === "yes" : null;
  const { data: updated, error } = await adminDb().from("package_offers")
    .update({ accepted_at: new Date().toISOString(), accepted_name: name, accepted_prepay: prepay, accepted_note: note })
    .eq("id", offer.id).is("accepted_at", null).select("id");
  if (error) throw error;
  if (!updated || !updated.length) return respond(req, { ok: true });

  const setupLine = prepay ? `Setup fee waived – first month (${money(totals.monthly)}) paid upfront`
    : prepay === false ? `Pays setup fee (${money(totals.setup)}) as normal` : "";
  await touchLead(lead, { followUpDays: 0, note: `Proposal ACCEPTED by ${name}. ${setupLine}`.trim() + (note ? `\nTheir note: ${note}` : "") });

  const first = firstName(lead.name);
  const html = prospectEmail({
    paragraphs: [
      `Hi ${esc(first)},`,
      `Thanks for accepting your proposal${lead.business ? ` for <strong>${esc(lead.business)}</strong>` : ""}. Here's what happens next:`,
      `1. I'll send your invoice (through Square) and your service agreement, usually within one business day.<br>2. Once the agreement is signed and the first invoice is paid, we schedule your kickoff and first shoot.`,
      `Nothing has been charged yet. Questions in the meantime? Just reply to this email.`,
    ],
  });
  await Promise.all([
    sendAlert({
      subject: `ACCEPTED: ${lead.business || lead.name} – send invoice & contract`,
      heading: `${name} accepted the proposal${lead.business ? ` for ${lead.business}` : ""}`,
      leadId: lead.id, replyTo: lead.email || undefined,
      rows: [["Accepted by", name], ["Proposal", offerSummary(found)], ["Setup choice", setupLine], ["Their note", note],
             ["Email", lead.email], ["Phone", lead.phone], ["Next", "Build the Square invoice and send the service agreement. Mark as won in admin once signed."]],
    }),
    lead.email ? sendEmail({ to: lead.email, replyTo: process.env.ALERT_EMAIL_TO || "max@onyxmediastl.com",
      subject: "Proposal accepted – next steps from Onyx Media", html, text: htmlToText(html) }) : null,
  ]);
  return respond(req, { ok: true });
});
