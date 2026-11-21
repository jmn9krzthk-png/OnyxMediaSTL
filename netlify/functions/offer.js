// GET /api/offer?t=<token> — public. Returns what the proposal page needs, nothing more.
// The first real view (not an admin preview) is recorded and Max gets an email.
import { adminDb } from "../lib/supabase.js";
import { sendAlert } from "../lib/email.js";
import { loadOffer, TOKEN_RE, offerSummary } from "../lib/offers.js";
import { firstName } from "../lib/pipeline.js";

export const config = { path: "/api/offer" };
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  const params = new URL(req.url).searchParams;
  const token = params.get("t") || "";
  const notFound = () => Response.json({ ok: false, error: "This proposal link isn't valid. Please contact Max at 636.385.3995." }, { status: 404, headers });
  if (!TOKEN_RE.test(token)) return notFound();
  try {
    const found = await loadOffer({ token });
    if (!found) return notFound();
    const { offer, lead, packages, totals } = found;

    if (!params.has("preview") && offer.sent_at && !offer.viewed_at) {
      const { data: updated } = await adminDb().from("package_offers").update({ viewed_at: new Date().toISOString() })
        .eq("id", offer.id).is("viewed_at", null).select("id");
      if (updated && updated.length) {
        await sendAlert({ req,
          subject: `${lead.name} opened your proposal`,
          heading: `${lead.name}${lead.business ? ` (${lead.business})` : ""} just opened your proposal`,
          leadId: lead.id, replyTo: lead.email || undefined,
          rows: [["Proposal", offerSummary(found)], ["Phone", lead.phone], ["Email", lead.email]],
        });
      }
    }

    return Response.json({
      ok: true,
      firstName: firstName(lead.name),
      business: lead.business || "",
      packages: packages.map((p) => ({ name: p.name, category: p.category, monthly: Number(p.monthly_price), setup: Number(p.setup_fee), deliverables: p.deliverables })),
      notes: offer.custom_notes || "",
      totals,
      waiveSetupWithPrepay: !!offer.waive_setup_with_prepay && totals.setup > 0,
      sentAt: offer.sent_at,
      accepted: offer.accepted_at ? { at: offer.accepted_at, name: offer.accepted_name, prepay: offer.accepted_prepay } : null,
    }, { headers });
  } catch (err) {
    console.error("offer load failed", err);
    return Response.json({ ok: false, error: "Couldn't load this proposal. Please try again or call 636.385.3995." }, { status: 500, headers });
  }
};
