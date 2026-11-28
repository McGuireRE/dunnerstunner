// 038: the email Tim gets for each message sent through "Send a message" on the About overlay. Pure: no network, no database, so
// onboarding/tests/contact-mail-fn.test.js runs it as it is. notify.ts (type "contact") sends it, once per message, to Tim alone: the
// address comes from timTo: Tim's own email from his settings (site_profile.email, handed over by contact_mark_emailed as tim_email)
// when it is a real address, else notify's TIM_EMAIL; never anything the sender wrote. Everything the sender wrote is escaped.
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const PREF: Record<string, string> = { call: "a call", text: "a text", email: "an email" };
export type ContactRow = { id: string; name: string; from_email: string; phone?: string | null; preferred?: string | null; message: string; page?: string | null; sent_at?: string | null };
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
export function timTo(row: { tim_email?: string | null } | null, fallback: string) {
  const e = String((row && row.tim_email) || "").trim();
  return EMAIL_RE.test(e) && e.length <= 200 ? e : fallback;
}
export function contactMail(row: ContactRow, timEmail: string, appUrl: string) {
  const name = String(row.name || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "Someone";
  const pref = PREF[String(row.preferred || "")] || PREF.email;
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(row.from_email || "")) ? String(row.from_email) : "";
  const html = `<p>${esc(name)} sent you a message from your pages and would like ${esc(pref)} back.</p>
<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #D9432C;white-space:pre-wrap">${esc(String(row.message || "").slice(0, 1000))}</blockquote>
<p>${email ? "Email: " + esc(email) + "<br>" : ""}${row.phone ? "Phone: " + esc(String(row.phone).slice(0, 30)) + "<br>" : ""}${row.page ? "Sent from: " + esc(String(row.page).slice(0, 200)) : ""}</p>
<p><a href="${esc(new URL(appUrl).origin + "/portal/messages/" + encodeURIComponent(String(row.id)))}">Open it on Needs you</a></p>`;
  return { to: timEmail, subject: "Message from " + name, html, replyTo: email || undefined };
}
