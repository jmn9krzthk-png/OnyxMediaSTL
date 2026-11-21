// POST /api/lp-audit — free audit form on the Google Ads landing pages (/lp/*).
// Same pipeline as /api/audit: Supabase leads + audit_requests, Resend alert to Max and a
// confirmation to the prospect. Adds ad attribution (lead source, gclid, UTMs, landing page).
import { readBody, clean, cleanEmail, cleanPhone, cleanUrl, spamReason, upsertLead, respond, formHandler, HttpError } from "../lib/forms.js";
import { sendAlert, sendEmail, prospectEmail, htmlToText, esc } from "../lib/email.js";
import { adminDb } from "../lib/supabase.js";

export const config = { path: "/api/lp-audit" };

// The only accepted landing pages. service_interest is derived here, never trusted from the form.
const PAGES = {
  "lp-paid-ads":     { service: "paid_ads",     slug: "paid-ads",     label: "Paid ads landing page" },
  "lp-social-media": { service: "social_media", slug: "social-media", label: "Social media landing page" },
};

// Tracking values: printable, capped. gclid is restricted to the characters Google uses.
const tracked = (v, max = 200) => clean(v, max).replace(/[^\x20-\x7E]/g, "") || null;
const gclidOf = (v) => { const s = clean(v, 300); return /^[A-Za-z0-9_-]+$/.test(s) ? s : null; };
const pageUrl = (v) => { const s = clean(v, 1000); return /^https?:\/\/\S+$/i.test(s) ? s : null; };

export default formHandler(async (req) => {
  const body = await readBody(req);
  const page = PAGES[clean(body.lead_source, 40)];
  if (!page) throw new HttpError(400, "Could not read the form. Please call or text 636.385.3995.");
  const SUCCESS = `/lp/thank-you?s=${page.slug}`;

  const reason = spamReason(body, ["name", "business"]);
  if (reason) {
    console.warn("lp-audit: dropped as spam:", reason);
    return respond(req, { ok: true, redirect: SUCCESS });
  }

  const name = clean(body.name, 120);
  const business = clean(body.business, 160);
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  if (!name || !business || !email || !phone) {
    throw new HttpError(400, "Add your name, business name, a 10-digit phone number and a full email address.");
  }

  // One optional link: a Facebook page goes in facebook_url, anything else in website.
  const link = cleanUrl(body.link);
  if (link === null) throw new HttpError(400, "The website or Facebook link doesn't look right. Paste the full address, or leave it blank.");
  let website = null, facebook_url = null;
  if (link) {
    const host = new URL(link).hostname.replace(/^(www|m|web)\./i, "").toLowerCase();
    if (host === "facebook.com" || host === "fb.com") facebook_url = link; else website = link;
  }

  const attribution = {
    lead_source: clean(body.lead_source, 40),
    service_interest: page.service,
    gclid: gclidOf(body.gclid),
    utm_source: tracked(body.utm_source),
    utm_medium: tracked(body.utm_medium),
    utm_campaign: tracked(body.utm_campaign),
    utm_term: tracked(body.utm_term),
    utm_content: tracked(body.utm_content),
    landing_page: pageUrl(body.landing_page),
    referrer: pageUrl(body.referrer),
  };

  const note = `Requested a free audit from the ${page.label.toLowerCase()} (${attribution.lead_source})`;
  const { lead, isNew, duplicate } = await upsertLead({ name, business, email, phone, industry: "", source: "website", note });
  if (duplicate) return respond(req, { ok: true, redirect: SUCCESS });

  const { error } = await adminDb().from("audit_requests").insert({
    lead_id: lead.id, website, facebook_url, status: "requested", ...attribution,
  });
  if (error) throw error;

  const first = name.split(/\s+/)[0];
  const confirmation = prospectEmail({
    paragraphs: [
      `Hi ${esc(first)},`,
      `Thanks for requesting a free audit for <strong>${esc(business)}</strong>. Here's what happens next:`,
      `1. Max reaches out within 1 business day to set up your free 30-minute call.<br>` +
      `2. On the call, we review your current ${page.service === "paid_ads" ? "ads" : "posting"} and your local competition.<br>` +
      `3. We launch, usually the following week.`,
      `Want to talk sooner? Reply to this email, or call or text <a href="tel:+16363853995">636.385.3995</a>.`,
    ],
    footer: "You're getting this because you requested a free audit at onyxmediastl.com.",
  });

  await Promise.all([
    sendAlert({ req,
      subject: `Audit request [${attribution.lead_source}]: ${business}`,
      heading: isNew ? "New audit request" : "Audit request from an existing lead",
      leadId: lead.id,
      replyTo: email,
      rows: [
        ["Lead source", attribution.lead_source], ["Service interest", page.service === "paid_ads" ? "Paid ads" : "Social media"],
        ["Name", name], ["Business", business], ["Email", email], ["Phone", phone],
        ["Website", website], ["Facebook", facebook_url],
        ["gclid", attribution.gclid], ["UTM source", attribution.utm_source], ["UTM medium", attribution.utm_medium],
        ["UTM campaign", attribution.utm_campaign], ["UTM term", attribution.utm_term], ["UTM content", attribution.utm_content],
        ["Landing page", attribution.landing_page], ["Referrer", attribution.referrer],
      ],
    }),
    sendEmail({
      to: email,
      replyTo: process.env.ALERT_EMAIL_TO || "max@onyxmediastl.com",
      subject: "We got your audit request – Onyx Media",
      html: confirmation,
      text: htmlToText(confirmation),
    }),
  ]);

  return respond(req, { ok: true, redirect: SUCCESS });
});
