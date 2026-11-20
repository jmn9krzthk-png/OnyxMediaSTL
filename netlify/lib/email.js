// Transactional email through Resend (https://resend.com). RESEND_API_KEY lives in Netlify env vars.

const ALERT_TO = () => process.env.ALERT_EMAIL_TO || "max@onyxmediastl.com";
const FROM = () => process.env.EMAIL_FROM || "Onyx Media <hello@onyxmediastl.com>";

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Send one email. Never throws: a failed email must not lose a saved lead.
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("email skipped: RESEND_API_KEY is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM(),
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error("resend error", res.status, (await res.text()).slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("resend request failed", err);
    return false;
  }
}

// Alert to Max. `rows` is a list of [label, value]; empty values are skipped.
export function sendAlert({ subject, heading, rows, leadId, replyTo }) {
  const site = process.env.URL || "https://onyxmediastl.com";
  const link = leadId ? `${site}/admin/#lead=${leadId}` : `${site}/admin/`;
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0B0B0C;max-width:560px">
  <h2 style="margin:0 0 12px;font-size:20px">${esc(heading)}</h2>
  <table cellpadding="6" style="border-collapse:collapse;width:100%">
    ${shown.map(([k, v]) => `<tr><td style="color:#4F4D48;vertical-align:top;white-space:nowrap;border-bottom:1px solid #E3DED4">${esc(k)}</td><td style="border-bottom:1px solid #E3DED4;white-space:pre-wrap">${esc(v)}</td></tr>`).join("")}
  </table>
  <p style="margin:20px 0"><a href="${esc(link)}" style="background:#FFA502;color:#0B0B0C;padding:12px 18px;text-decoration:none;font-weight:bold">Open in admin</a></p>
</div>`;
  const text = `${heading}\n\n${shown.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nOpen in admin: ${link}`;
  return sendEmail({ to: ALERT_TO(), subject, html, text, replyTo });
}

// Branded email to a prospect or client. `paragraphs` are trusted HTML strings (escape user data with esc()).
export function prospectEmail({ paragraphs, button, footer }) {
  const btn = button
    ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#FFA502;color:#0B0B0C;padding:14px 20px;text-decoration:none;font-weight:bold;display:inline-block">${esc(button.label)}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#0B0B0C;max-width:560px">
  ${paragraphs.map((p) => `<p>${p}</p>`).join("\n  ")}
  ${btn}
  <p>Max Fisher<br>Onyx Media · St. Charles, MO<br>636.385.3995 · <a href="https://onyxmediastl.com">onyxmediastl.com</a></p>
  <p style="border-top:4px solid #FFA502;padding-top:8px;font-size:13px;color:#4F4D48">${footer || "Questions? Just reply to this email."}</p>
</div>`;
}

export function htmlToText(html) {
  return html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, "$2 ($1)").replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>/g, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/^[ \t]+/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
