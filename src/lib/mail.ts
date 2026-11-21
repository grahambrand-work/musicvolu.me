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

// The buttons as pictures (public/email/*.png, white pill, black text, drawn at 2x). Mail apps
// in dark mode recolour HTML buttons however they're built, but never pictures (Graham,
// 2026-11-19: the button must be white). Width and height are the 1x size. A new button label
// needs its picture made first; until then it falls back to the HTML button.
const BUTTON_IMAGES: Record<string, { file: string; w: number; h: number }> = {
  "Confirm my email": { file: "confirm-my-email.png", w: 168, h: 42 },
  "Choose a new password": { file: "choose-a-new-password.png", w: 212, h: 42 },
};

function buttonImage(m: Mail) {
  const b = BUTTON_IMAGES[m.button];
  if (!b) return null;
  return `<a href="${esc(m.link)}" style="display:inline-block;text-decoration:none"><img src="${esc(siteUrl(`/email/${b.file}`))}" width="${b.w}" height="${b.h}" alt="${esc(m.button)}" style="display:block;border:0;outline:none;width:${b.w}px;height:${b.h}px;background:#fff;border-radius:99px;color:#000;font-size:15px"></a>`;
}

function html(m: Mail) {
  // Black background set on the body AND the tables (Gmail and Outlook drop the body's), and
  // marked dark-only so mail apps in light mode don't flip it to white. The button's cell is
  // white too (the dark rule would otherwise paint it black around the link). Mail apps in dark
  // mode still repaint colours: the white is also a gradient image (Gmail leaves images alone),
  // Outlook.com's dark mode is overridden by [data-ogsb]/[data-ogsc], and in Gmail (u+.body) the
  // two blend-mode spans flip its inverted text back to black.
  return `<!doctype html><html style="background:#000"><head><meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark only}body,table,td{background:#000!important}td.btn,a.btn{background:#fff!important;color:#000!important}[data-ogsb] .btn,[data-ogsc] .btn{background:#fff!important;color:#000!important}u+.body .gm-s{background:#000;mix-blend-mode:screen;display:inline-block}u+.body .gm-d{background:#000;mix-blend-mode:difference;display:inline-block}</style></head>
<body class="body" bgcolor="#000000" style="margin:0;padding:0;background:#000;font-family:Jost,Helvetica,Arial,sans-serif;color:#fff">
<table role="presentation" width="100%" bgcolor="#000000" style="background:#000" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#000000" style="background:#000;padding:40px 16px">
<table role="presentation" width="100%" bgcolor="#000000" style="max-width:440px;background:#000" cellspacing="0" cellpadding="0">
<tr><td style="font-size:28px;font-weight:700;color:#fff;padding-bottom:28px">musicvolu.me</td></tr>
<tr><td style="font-size:22px;font-weight:600;color:#fff;padding-bottom:10px">${esc(m.heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#bdbdbd;padding-bottom:26px">${esc(m.body)}</td></tr>
<tr><td>${buttonImage(m) ?? `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td class="btn" bgcolor="#ffffff" style="background:#fff;background-image:linear-gradient(#ffffff,#ffffff);border-radius:99px"><a class="btn" href="${esc(m.link)}" style="display:inline-block;background:#fff;background-image:linear-gradient(#ffffff,#ffffff);color:#000;text-decoration:none;font-size:15px;font-weight:500;padding:11px 26px;border-radius:99px"><span class="gm-s"><span class="gm-d">${esc(m.button)}</span></span></a></td></tr></table>`}</td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#808080;padding-top:28px">${esc(m.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Absolute links in emails. SITE_URL is set in Coolify (https://musicvolu.me). */
export function siteUrl(path: string) {
  return `${(process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
