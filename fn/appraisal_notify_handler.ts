// The notify function's appraisal emails (LW3 phase E, migration 037). fn/notify.ts hands every request whose type starts "ap_" here.
// Tested by onboarding/tests/appraisal-notify-fn.test.js with fakes for the database and the mail server (nothing is sent).
//
//   ap_send   Tim only. Sends the email Tim reviewed on the appraisal's Send page (appraisal_mail, written by agent_appraisal_send):
//             exactly its subject and words, to exactly its people, with [the appraisal link] made into their button to
//             packages.dunnerstunner.co.nz/onboarding/?appraisal=<the appraisal> (they sign in with the email code). Taken once
//             (queued or failed to sending); the outcome recorded (sent, or failed with the reason). A copy to Tim.
//   ap_event  A vendor's own event (opened, proceeded, plan_built), asked with their own token (appraisal_event_mine): Tim is
//             emailed once (notified_at is taken first, so a second call sends nothing). Only ever to Tim.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ApDeps = {
  json: (body: unknown, status?: number) => Response;
  appUrl: string;                    // the onboarding app (https://packages.dunnerstunner.co.nz/onboarding/)
  portalUrl: string;                 // Tim's portal (https://portal.dunnerstunner.co.nz/)
  timEmail: string;
  MAIL: any;                         // onboarding/src/mail-core.js
  isAgent: (authorization: string) => Promise<boolean>;
  eventMine: (authorization: string, id: number) => Promise<boolean>;
  // the service role's reads and writes
  takeMail: (id: string) => Promise<any | null>;                       // queued or failed to sending, returning the row; null if not
  finishMail: (id: string, ok: boolean, error: string | null) => Promise<boolean>;
  snapshot: (id: string) => Promise<any | null>;
  takeEvent: (id: number) => Promise<any | null>;                       // notified_at set where it was null, returning the row
  send: (kind: string, msg: { to: string | string[]; bcc?: string; subject: string; html: string }) => Promise<void>;
};

export function makeAppraisalNotify(d: ApDeps) {
  return async (req: Request, body: any): Promise<Response> => {
    const auth = req.headers.get("Authorization") || "";
    if (body.type === "ap_send") {
      if (!(await d.isAgent(auth).catch(() => false))) return d.json({ error: "Not allowed" }, 403);
      const id = String(body.mail_id || "");
      if (!UUID_RE.test(id)) return d.json({ error: "Bad request" }, 400);
      const m = await d.takeMail(id);
      if (!m) return d.json({ ok: false, error: "This email is already being sent, or has gone." }, 409);
      const s = await d.snapshot(m.snapshot_id);
      if (!s) { await d.finishMail(id, false, "The appraisal copy couldn't be read"); return d.json({ ok: false, error: "The appraisal copy couldn't be read. Nothing went." }, 500); }
      const link = d.appUrl + "?appraisal=" + encodeURIComponent(s.chain_id);
      const html = d.MAIL.toHtml(m.body, link, { token: d.MAIL.APPRAISAL_LINK, label: "Open my appraisal" });
      try { await d.send("appraisal_sent", { to: m.to_addr, bcc: d.timEmail, subject: m.subject, html }); }
      catch (e: any) { await d.finishMail(id, false, String(e?.message || e).slice(0, 500)).catch(() => false); return d.json({ ok: false, error: "It didn't send: " + String(e?.message || e).slice(0, 200) + ". Nothing went. Try again." }); }
      const done = await d.finishMail(id, true, null).catch(() => false);
      if (!done) return d.json({ ok: false, maybe_sent: true, error: "It went, but that couldn't be recorded. Check your sent mail before sending again." });
      return d.json({ ok: true });
    }
    if (body.type === "ap_event") {
      const id = Number(body.event_id);
      if (!Number.isInteger(id) || id <= 0) return d.json({ error: "Bad request" }, 400);
      if (!(await d.eventMine(auth, id).catch(() => false))) return d.json({ error: "Not allowed" }, 403);
      const e = await d.takeEvent(id);
      if (!e) return d.json({ ok: true, note: "already told" });
      const s = await d.snapshot(e.snapshot_id);
      const who = ((s?.recipients || []).find((r: any) => String(r.email || "").toLowerCase() === String(e.actor || "").toLowerCase()) || {}).name || e.actor;
      const n = d.MAIL.appraisalEventNotice({ kind: e.kind, who, address: s?.content?.address || "", version: s?.version, total: e.detail?.total, portalUrl: d.portalUrl + "appraisals/" + (s?.appraisal_id || e.chain_id) });
      try { await d.send("appraisal_" + e.kind, { to: d.timEmail, subject: n.subject, html: d.MAIL.toHtml(n.body) }); }
      catch (_) { return d.json({ ok: false, note: "Tim wasn't emailed; it shows on his Needs you list" }); }
      return d.json({ ok: true });
    }
    return d.json({ error: "Unknown type" }, 400);
  };
}
