// Cornerstone music site: sign-in links and the email queue. Deployed to the cornerstone-music project as "music-mail".
// Sending stays off until MAIL_FROM plus either RESEND_API_KEY or SMTP_USER and SMTP_PASS are set as secrets.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";

const SITE = "https://packages.dunnerstunner.co.nz/music/";
const ORIGINS = ["https://packages.dunnerstunner.co.nz"];
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const env = (k: string) => (Deno.env.get(k) || "").trim();
const ready = () => !!env("MAIL_FROM") && (!!env("RESEND_API_KEY") || (!!env("SMTP_USER") && !!env("SMTP_PASS")));

async function send(to: string, subject: string, html: string) {
  const body = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#141413">${html}<p style="color:#77756f;font-size:13px">Cornerstone Music</p></div>`;
  if (env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env("RESEND_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject, html: body, reply_to: env("MAIL_REPLY_TO") || undefined }),
    });
    if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
    return;
  }
  const t = nodemailer.createTransport({ host: env("SMTP_HOST") || "smtp.gmail.com", port: 465, secure: true, auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS").replace(/\s/g, "") } });
  await t.sendMail({ from: env("MAIL_FROM"), to, subject, html: body, replyTo: env("MAIL_REPLY_TO") || undefined });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const cors = { "access-control-allow-origin": ORIGINS.includes(origin) ? origin : ORIGINS[0], "access-control-allow-headers": "content-type, apikey, authorization", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ message: "Not found" }, 404);
  let b: any = {};
  try { b = await req.json(); } catch (_) { /* empty body */ }

  if (b.action === "signin") {
    const email = String(b.email || "").trim().toLowerCase();
    // The same answer whether or not the address is on the team list, so the list cannot be probed.
    const same = { message: "If that address is on the team list, a sign-in link is on its way. It can take a minute." };
    if (!ready()) return json({ message: "Sign-in emails are not switched on yet. Please try again soon." });
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return json(same);
    try {
      const { data: ok } = await db.rpc("signin_check", { p_email: email });
      if (!ok) return json(same);
      const pw = () => crypto.randomUUID() + crypto.randomUUID();
      await db.auth.admin.createUser({ email, email_confirm: true, password: pw() }); // errors if they already have a login, which is fine
      // Links are the only way in. Wipe any password on the login first, in case someone tried to register this
      // address with a password of their own before its owner signed in.
      const first = await db.auth.admin.generateLink({ type: "magiclink", email });
      if (first.error || !first.data?.user?.id) throw first.error || new Error("no user");
      await db.auth.admin.updateUserById(first.data.user.id, { password: pw() });
      const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
      if (error || !data?.properties?.hashed_token) throw error || new Error("no token");
      const link = SITE + "?t=" + encodeURIComponent(data.properties.hashed_token);
      await send(email, "Your Cornerstone Music sign-in link",
        `<p>Tap the button to sign in to the music roster.</p><p><a href="${link}" style="display:inline-block;background:#1f6f5c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Sign in</a></p><p>The link works once and expires after an hour. If you did not ask for it, you can ignore this email.</p>`);
    } catch (e) { console.error("signin", String((e as any)?.message || e)); }
    return json(same);
  }

  if (b.action === "drain") {
    if (!ready()) return json({ sent: 0, ready: false });
    const { data: rows, error } = await db.rpc("outbox_take");
    if (error) return json({ message: "queue error" }, 500);
    let sent = 0;
    for (const r of rows || []) {
      let err: string | null = null;
      for (const to of r.to_emails as string[]) {
        try { await send(to, r.subject, r.html); sent++; } catch (e) { err = String((e as any)?.message || e).slice(0, 300); }
      }
      await db.rpc("outbox_done", { p_id: r.id, p_error: err });
    }
    return json({ sent });
  }
  return json({ message: "Not found" }, 404);
});
