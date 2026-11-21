// POST /api/contact — the Contact page form. Saves a lead (source = website) and emails Max.
import { readBody, clean, cleanEmail, cleanPhone, cleanUrl, spamReason, upsertLead, respond, formHandler, HttpError } from "../lib/forms.js";
import { sendAlert } from "../lib/email.js";

export const config = { path: "/api/contact" };

export default formHandler(async (req) => {
  const body = await readBody(req);

  const reason = spamReason(body, ["message", "name", "company"]);
  if (reason) {
    console.warn("contact: dropped as spam:", reason);
    return respond(req, { ok: true, redirect: "/thank-you.html" }); // look normal to bots
  }

  const name = clean(body.name, 120);
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  if (!name || !email || !phone) {
    throw new HttpError(400, "Add your name, a 10-digit mobile number and a full email address.");
  }
  const website = cleanUrl(body.website);
  if (website === null) throw new HttpError(400, "That website address doesn't look right.");

  const business = clean(body.company, 160);
  const industry = clean(body.business_type, 80);
  const details = [
    ["Service", clean(body.need, 80)],
    ["Trucks or bays", clean(body.size, 40)],
    ["Monthly budget", clean(body.budget, 60)],
    ["Timeline", clean(body.timeline, 60)],
    ["Website", website],
    ["Wants more of", clean(body.message, 3000)],
  ];
  const note = "Contact form\n" + details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");

  const { lead, isNew, duplicate } = await upsertLead({ name, business, email, phone, industry, source: "website", note });

  if (!duplicate) {
    await sendAlert({ req,
      subject: `New lead: ${name}${business ? ` (${business})` : ""}`,
      heading: isNew ? "New contact form lead" : "Returning lead sent the contact form again",
      leadId: lead.id,
      replyTo: email,
      rows: [["Name", name], ["Business", business], ["Email", email], ["Phone", phone], ["Industry", industry], ...details],
    });
  }

  return respond(req, { ok: true, redirect: "/thank-you.html" });
});
