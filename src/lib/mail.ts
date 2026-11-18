// Account emails (confirm your address, reset your password), sent through Resend from
// hello@musicvolu.me. Settings: RESEND_API_KEY and MAIL_FROM. Without a key (on your own
// computer) the email is printed in the server log instead, so you can click the link.
import "server-only";

type Mail = { to: string; subject: string; heading: string; body: string; button: string; link: string; footer: string };

export async function sendMail(m: Mail) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "musicvolu.me <hello@musicvolu.me>";
  const text = `${m.heading}\n\n${m.body}\n\n${m.button}: ${m.link}\n\n${m.footer}`;
  if (!key) {
    console.log(`\n[mail] To: ${m.to}\n[mail] Subject: ${m.subject}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [m.to], subject: m.subject, text, html: html(m) }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function html(m: Mail) {
  return `<!doctype html><html><body style="margin:0;background:#000;padding:40px 16px;font-family:Jost,Helvetica,Arial,sans-serif;color:#fff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px" cellspacing="0" cellpadding="0">
<tr><td style="font-size:28px;font-weight:700;padding-bottom:28px">musicvolu.me</td></tr>
<tr><td style="font-size:22px;font-weight:600;padding-bottom:10px">${esc(m.heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#bdbdbd;padding-bottom:26px">${esc(m.body)}</td></tr>
<tr><td><a href="${esc(m.link)}" style="display:inline-block;background:#fff;color:#000;text-decoration:none;font-size:15px;font-weight:500;padding:11px 26px;border-radius:99px">${esc(m.button)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#808080;padding-top:28px">${esc(m.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Absolute links in emails. SITE_URL is set in Coolify (https://musicvolu.me). */
export function siteUrl(path: string) {
  return `${(process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
