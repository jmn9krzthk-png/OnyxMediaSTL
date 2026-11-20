// POST /api/audit — the "free content & ads audit" form. Creates (or reuses) a lead,
// adds an audit_request, emails the prospect a confirmation and emails Max an alert.
import { readBody, clean, cleanEmail, cleanPhone, cleanUrl, pick, spamReason, upsertLead, respond, formHandler, HttpError } from "../lib/forms.js";
import { sendAlert, sendEmail, esc } from "../lib/email.js";
import { adminDb } from "../lib/supabase.js";

export const config = { path: "/api/audit" };

// Keep in sync with AD_SPEND_OPTIONS in tools/build_site.py
const AD_SPEND = ["Not running ads", "Under $500", "$500–$1,500", "$1,500–$3,000", "$3,000–$7,000", "$7,000+"];
const SUCCESS = "/audit-thank-you.html";

export default formHandler(async (req) => {
  const body = await readBody(req);

  const reason = spamReason(body, ["biggest_goal", "name", "business"]);
  if (reason) {
    console.warn("audit: dropped as spam:", reason);
    return respond(req, { ok: true, redirect: SUCCESS });
  }

  const name = clean(body.name, 120);
  const business = clean(body.business, 160);
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  if (!name || !business || !email || !phone) {
    throw new HttpError(400, "Add your name, business name, a 10-digit mobile number and a full email address.");
  }

  const urls = {};
  for (const [field, label] of [["website", "Website"], ["facebook_url", "Facebook"], ["instagram_url", "Instagram"], ["google_business_url", "Google Business Profile"]]) {
    const u = cleanUrl(body[field]);
    if (u === null) throw new HttpError(400, `The ${label} link doesn't look right. Paste the full address, or leave it blank.`);
    urls[field] = u || null;
  }
  if (!urls.website && !urls.facebook_url && !urls.instagram_url && !urls.google_business_url) {
    throw new HttpError(400, "Add at least one link (website, Facebook, Instagram or Google) so we have something to audit.");
  }

  const runsAdsRaw = clean(body.runs_ads, 5).toLowerCase();
  const runs_ads = runsAdsRaw === "yes" ? true : runsAdsRaw === "no" ? false : null;
  const monthly_ad_spend = pick(body.monthly_ad_spend, AD_SPEND) || null;
  const biggest_goal = clean(body.biggest_goal, 2000) || null;
  const industry = clean(body.industry, 80);

  const note = "Requested a free content & ads audit" + (biggest_goal ? `\nGoal: ${biggest_goal}` : "");
  const { lead, isNew, duplicate } = await upsertLead({ name, business, email, phone, industry, source: "website", note });

  if (duplicate) return respond(req, { ok: true, redirect: SUCCESS });

  const { error } = await adminDb().from("audit_requests").insert({
    lead_id: lead.id, ...urls, runs_ads, monthly_ad_spend, biggest_goal, status: "requested",
  });
  if (error) throw error;

  const first = name.split(/\s+/)[0];
  await Promise.all([
    sendAlert({ req,
      subject: `Audit request: ${business}`,
      heading: isNew ? "New audit request" : "Audit request from an existing lead",
      leadId: lead.id,
      replyTo: email,
      rows: [
        ["Name", name], ["Business", business], ["Email", email], ["Phone", phone], ["Industry", industry],
        ["Website", urls.website], ["Facebook", urls.facebook_url], ["Instagram", urls.instagram_url],
        ["Google Business", urls.google_business_url],
        ["Runs ads now", runs_ads === null ? "" : runs_ads ? "Yes" : "No"], ["Monthly ad spend", monthly_ad_spend],
        ["Biggest goal", biggest_goal],
      ],
    }),
    sendEmail({
      to: email,
      replyTo: process.env.ALERT_EMAIL_TO || "max@onyxmediastl.com",
      subject: "We got your audit request – Onyx Media",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#0B0B0C;max-width:560px">
  <p>Hi ${esc(first)},</p>
  <p>Thanks for requesting a free content &amp; ads audit for <strong>${esc(business)}</strong>. Here's what happens next:</p>
  <ol>
    <li>We review your website, social pages, Google Business Profile and any ads you're running.</li>
    <li>We compare you with a few competitors in your area.</li>
    <li>Within 3 business days, you'll get a short audit with the top things we'd fix or film first.</li>
  </ol>
  <p>Want to talk sooner? Just reply to this email, or call or text <a href="tel:+16363853995">636.385.3995</a>.</p>
  <p>Max Fisher<br>Onyx Media · St. Charles, MO<br><a href="https://onyxmediastl.com">onyxmediastl.com</a></p>
  <p style="border-top:4px solid #FFA502;padding-top:8px;font-size:13px;color:#4F4D48">You're getting this because you requested an audit at onyxmediastl.com.</p>
</div>`,
      text: `Hi ${first},\n\nThanks for requesting a free content & ads audit for ${business}. Here's what happens next:\n\n1. We review your website, social pages, Google Business Profile and any ads you're running.\n2. We compare you with a few competitors in your area.\n3. Within 3 business days, you'll get a short audit with the top things we'd fix or film first.\n\nWant to talk sooner? Reply to this email, or call or text 636.385.3995.\n\nMax Fisher\nOnyx Media · St. Charles, MO\nhttps://onyxmediastl.com`,
    }),
  ]);

  return respond(req, { ok: true, redirect: SUCCESS });
});
