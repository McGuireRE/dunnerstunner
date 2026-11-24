// The offer-sign edge function's request handling (fn/offer_sign.ts is the deployed entry). Offers phase 3: purchasers sign an offer
// Tim approved, and the signed copy is locked as Round 1.
//
// Purchasers signing by link have no account, so this function is deployed with the gateway's JWT verification OFF, like
// offer-public. Every purchaser action needs the token from their own link, and every action after the code check also needs the
// session that check gave them; the database (migration 020, the offer_sign_* functions, service role only) checks both, and that
// the place is theirs. The two actions for Tim (send, lock) need his own sign-in: the handler asks is_agent with his token first.
//   open        who the link is for (first name only), the address, and whether signing is open. Nothing about anyone else.
//   send_code   a 6-digit code emailed to the purchaser's own address, as its own message (there is no text-message provider yet).
//   verify      the code typed back: a session for this purchaser.
//   state       their own places, the pages and a 10 minute link to the approved draft.
//   consent, receipt, marks, tap   the signing steps; each place is tapped by the signer themselves.
//   ask         "Ask Tim for a change": a note emailed to Tim. A link signer can't mark the document.
//   finish      once every place is done. When the last purchaser finishes, Round 1 is made and locked here and then.
//   send (Tim)  a personal link emailed to each purchaser still to sign. The links' tokens are never returned to any page.
//   lock (Tim)  makes and locks the round (in person, after the last signer; or again if locking didn't finish).
// Phase 4 (migration 021), the same function, JWT verification still OFF:
//   change      a change by a signer on the countering side, from their own link (Round 2 on): the change and the initials of
//               everyone on their side beside it; typed words are checked for the parties' own phone and email by the database.
//   agree (Tim) once both sides have signed the same version with nothing outstanding: the agreed copy (the date he typed at the top,
//               as an overlay, the time acceptance was communicated), stored, fingerprinted from the stored file and locked.
// Every round from Round 2 on is made from the approved draft and every round's layers by the negotiation core (src/nego-core.js):
// the other side's initials are lifted where a change was made, every change and its initials drawn, and the record appended.
// Round 1: the approved draft (checked against its fingerprint), with each signer's signature, initials and marks added on top and the
// execution record appended (src/sign-core.js renderRound), stored, fingerprinted from the stored file, then offer_round_lock.
// Everything the caller sends is data. Tested by onboarding/tests/offer-sign-fn.test.js with fakes, so no test sends email.
export const MAX_BODY = 700000;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
export type Deps = {
  cors: Record<string, string> | ((req: Request) => Record<string, string>);   // a function: the headers for each request (corsFor)
  appUrl: string;
  portalUrl?: string;   // Tim's portal (https://portal.dunnerstunner.co.nz/), for the address of a round in his notice
  mail?: any;           // src/mail-core.js (MAIL): the wording of drafts and of Tim's round notice
  timEmail: string;
  whoIsAgent: (authorization: string) => Promise<string | null>;
  rpc: Rpc;                                                          // the offer_sign_* functions, offer_round_*, offer_file_confirm, with the service role
  signedUrl: (path: string) => Promise<string | null>;              // a 10 minute link to a file in property-files
  download: (path: string) => Promise<Uint8Array | null>;
  upload: (path: string, bytes: Uint8Array) => Promise<{ ok: boolean; exists?: boolean }>;
  sendMail: (kind: string, msg: { to: string; subject: string; html: string }) => Promise<void>;   // throws when it doesn't send
  renderRound: (draft: Uint8Array, m: any) => Promise<{ bytes: Uint8Array }>;
  renderWorking: (draft: Uint8Array, m: any) => Promise<{ bytes: Uint8Array }>;   // NEGO.renderWorking with pdf-lib
  nego: any;                                                        // the negotiation core (standing, outstanding, roundLines, agreementLines)
  net: (req: Request) => string;
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
async function sha256(bytes: Uint8Array) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)); return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join(""); }
// a refusal from the database written for people passes through; anything that looks internal stays hidden
export const plain = (m: string) => /^[A-Z][^\n]{3,240}$/.test(m || "") && !/permission|function|relation|column|syntax|violates|constraint|null value|uuid|jsonb|operator/i.test(m) ? m : "Something went wrong. Please try again, or call Tim on 027 562 7207.";
// the execution record, from what the database holds (never from the page)
export function executionRecord(m: any) {
  return {
    address: m.address, offer_ref: m.offer_ref, round: 1, draft: { number: m.draft?.number, sha256: m.draft?.sha256 }, places_sha256: m.places_sha256, made_at: m.made_at,
    signers: (m.signers || []).map((s: any) => ({ name: s.name, method: m.method, verified_at: s.verified_at, witnessed_by: s.witnessed_by, id_sighted: s.id_sighted, consent_at: s.consent_at, receipts: s.receipts || [],
      first_tap: s.first_tap, last_tap: s.last_tap, finished_at: s.finished_at, places: s.places, ua: s.ua, net: s.net, seen_sha256: s.seen_sha256 })),
    marks: (m.marks || []).map((k: any) => ({ kind: k.kind, page: k.page, by: k.by, at: k.at, reviewed_at: k.reviewed_at })),
    replaced: m.replaced || [],
  };
}
const wrap = (inner: string) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F1D1A;max-width:560px">${inner}<p style="color:#6E6A65;font-size:13.5px">McGuire Real Estate · Tim McGuire · 027 562 7207</p></div>`;

export function makeHandler(d: Deps) {
  const staticCors: Record<string, string> = typeof d.cors === "function" ? {} : d.cors;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, staticCors) });
  const call = async (fn: string, args: Record<string, unknown>) => { const r = await d.rpc(fn, args); if (r.error) throw new Error(r.error.message); return r.data; };

  // who is on each side, from the newest round each side signed (for the "nothing outstanding" check)
  const sidesOf = (layers: any[]) => { const o: Record<string, any[]> = {}; layers.slice().sort((a, b) => a.doc_round - b.doc_round).forEach((L) => { o[L.side] = (L.signers || []).map((s: any) => ({ position: s.position, name: s.name })); }); return o; };
  // a round: made here from the approved draft and what the database holds, stored, fingerprinted from the stored file, then locked.
  // Round 1 as phase 3 made it; from Round 2 on, the working copy from every round's layers (src/nego-core.js).
  async function lockRound(signingId: string, actor: string) {
    const m = await call("offer_round_material", { p_signing: signingId });
    const draft = await d.download(m.draft.path);
    if (!draft || await sha256(draft) !== m.draft.sha256) throw new Error("The approved draft doesn't match its fingerprint, so the round wasn't made. Tim will look into it.");
    const n = m.number || 1, round = m.round || 1;
    let bytes: Uint8Array, record: any, formed = false;
    if (round === 1) {
      record = executionRecord(m);
      bytes = (await d.renderRound(draft, { places: m.places, taps: m.taps, signers: m.signers, marks: m.marks, record, title: `Round 1 (signed by the purchasers): ${m.address || "agreement"}` })).bytes;
    } else {
      const N = d.nego, earlier = m.earlier || [];
      const L = { doc_round: round, number: n, side: m.side, signing_id: m.signing_id, places: m.places, taps: (m.taps || []).map((t: any) => ({ place_id: t.place_id, signer: t.signer })), signers: m.signers, marks: m.marks };
      const st = N.standing(earlier.concat([L])), sides = sidesOf(earlier.concat([L]));
      const lifted = st.lifted.filter((x: any) => x.by_round === round).map((x: any) => ({ side: x.side, signer: x.signer, who: x.who, kind: x.kind, why: x.why, page: x.page, round: x.round, by: x.by }));
      const outstanding = N.outstanding(st, sides);
      formed = (m.marks || []).length === 0 && outstanding.length === 0 && Object.keys(sides).length === 2;
      const base = earlier[earlier.length - 1] || {};
      const rec = Object.assign({}, executionRecord(m), { number: n, document: m.document, round, side: m.side, base: { round: base.doc_round, sha256: base.sha256 }, link_changes: m.link_changes == null ? null : !!m.link_changes,
        changes: (m.marks || []).map((k: any) => ({ kind: k.kind, page: k.page, by: k.by, at: k.at, text: k.kind === "insert" ? k.geometry?.text : undefined })), lifted, outstanding: outstanding.length });
      // the record keeps the title and drawing version, so the round can be drawn again from its layers and come out byte for byte the same
      const title = `Round ${round} (signed by the ${m.side === "vendor" ? "vendors" : "purchasers"}): ${m.address || "agreement"}`;
      record = Object.assign({}, rec, { title, draw_version: N.DRAW_VERSION, check: { lifted, outstanding } });
      bytes = (await d.renderWorking(draft, { ink: st.ink, changes: st.changes, lines: N.roundLines(rec), title })).bytes;
    }
    const sha = await sha256(bytes), path = `properties/${m.property_id}/docs/offer-round-${m.offer_id}-${n}-${sha.slice(0, 12)}.pdf`;
    const up = await d.upload(path, bytes); if (!up.ok && !up.exists) throw new Error("The round couldn't be stored. Try again.");
    // the fingerprint from the file as stored, not as made; a file already at that place must be exactly the one just made
    const stored = await d.download(path); if (!stored) throw new Error("The round couldn't be read back. Try again.");
    const ssha = await sha256(stored);
    if (ssha !== sha) throw new Error("A different file is already stored where the round goes, so it wasn't locked. Tim will look into it.");
    await call("offer_file_confirm", { p_path: path, p_sha256: ssha, p_size: stored.length, p_actor: actor });
    const lk = await call("offer_round_lock", { p_signing: signingId, p_path: path, p_sha256: ssha, p_size: stored.length, p_execution: record, p_actor: actor });
    const who = m.side === "vendor" ? "vendor" : "purchaser", next = round === 1 ? "Nothing has gone to the vendors. Look at it, then present it when you are ready." : formed ? "Both sides have now signed the same version with nothing outstanding. Open the offer to confirm the agreement." : `Nothing has gone back to the ${m.side === "vendor" ? "purchasers" : "vendors"}. Look at it, then present it when you are ready.`;
    // Tim alone is told, once per submitted round (Tim, 24 November 2026: he mediates; nobody else hears of it until he presents it)
    if (!lk.existing) {
      const portal = `${(d.portalUrl || "https://portal.dunnerstunner.co.nz/").replace(/\/?$/, "/")}properties/${m.property_id}/offers/${m.offer_id}/signing/${signingId}`;
      const nt = d.mail ? d.mail.roundNotice({ side: m.side || "purchaser", round, docRound: m.doc_round, address: m.address, signers: (m.signers || []).map((s: any) => s.name),
        changes: (m.marks || []).map((c: any) => ({ kind: c.kind, page: c.page, text: c.geometry && c.geometry.text, by: c.by_name || c.by })), portalUrl: portal }) : null;
      const extra = `<p>${esc(next)}</p><p>Fingerprint: <code>${esc(ssha.slice(0, 16))}</code></p>`;
      try { await d.sendMail("offer_round_locked", { to: d.timEmail, subject: nt ? nt.subject : `Round ${round} submitted: ${m.address || "an offer"}`, html: nt ? d.mail.toHtml(nt.body).replace(/<\/div>$/, extra + "</div>") : wrap(`<p>Round ${round} for ${esc(m.address || "")} is signed and locked.</p>${extra}<p><a href="${esc(portal)}">${esc(portal)}</a></p>`) }); } catch (_) { /* the round is locked either way */ }
    }
    return { number: lk.number, round: lk.round || round, sha256: lk.sha256, existing: !!lk.existing, formed };
  }
  // the agreed copy: every round's layers, nothing outstanding (checked again here by the core), the date Tim typed at the top
  async function agree(offerId: string, acceptedAt: string, dateText: string, actor: string) {
    const m = await call("offer_agreement_material", { p_offer: offerId, p_accepted_at: acceptedAt, p_date_text: dateText });
    const N = d.nego, layers = m.layers || [], st = N.standing(layers), os = N.outstanding(st, sidesOf(layers));
    if (os.length) throw new Error("Something is still outstanding, so the agreement can't be confirmed yet.");
    const draft = await d.download(m.draft.path);
    if (!draft || await sha256(draft) !== m.draft.sha256) throw new Error("The approved draft doesn't match its fingerprint. Tim will look into it.");
    if (!m.date_place) throw new Error("The agreement blank has no date place, so the date can't be added. Add it to the places on the blank first.");
    // drawn again from Round N's own layers; its fingerprint and the drawing version are recorded on the copy and with the agreement
    const record = { address: m.address, offer_ref: m.offer_ref, date_text: m.date_text, accepted_at: m.accepted_at, confirmed_by: "Tim McGuire", made_at: m.made_at, document: m.document, round: m.round, rounds: m.rounds || [],
      base: { round: m.round, sha256: m.round_sha256 }, draw_version: N.DRAW_VERSION };
    const { bytes } = await d.renderWorking(draft, { ink: st.ink, changes: st.changes, lines: N.agreementLines(record), date: { text: m.date_text, place: m.date_place || null }, title: `Agreement: ${m.address || ""}` });
    const sha = await sha256(bytes), path = `properties/${m.property_id}/docs/offer-agreement-${m.offer_id}-${sha.slice(0, 12)}.pdf`;
    const up = await d.upload(path, bytes); if (!up.ok && !up.exists) throw new Error("The agreement couldn't be stored. Try again.");
    const stored = await d.download(path); if (!stored) throw new Error("The agreement couldn't be read back. Try again.");
    const ssha = await sha256(stored); if (ssha !== sha) throw new Error("A different file is already stored where the agreement goes. Tim will look into it.");
    await call("offer_file_confirm", { p_path: path, p_sha256: ssha, p_size: stored.length, p_actor: actor });
    const lk = await call("offer_agreement_lock", { p_offer: offerId, p_round: m.round_id, p_path: path, p_sha256: ssha, p_size: stored.length, p_accepted_at: acceptedAt, p_date_text: m.date_text, p_record: record, p_actor: actor });
    return { sha256: lk.sha256, existing: !!lk.existing, property_id: m.property_id };
  }

  const handle = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: staticCors });
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
    let text = ""; try { text = await req.text(); } catch (_) { return json({ error: "Bad request" }, 400); }
    if (text.length > MAX_BODY) return json({ ok: false, error: "That is more than can be sent at once." }, 413);
    let body: any = null; try { body = JSON.parse(text); } catch (_) { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request" }, 400);
    const action = String(body.action || ""), net = d.net(req), ua = (req.headers.get("user-agent") || "").slice(0, 400);

    // ── Tim ──
    if (action === "send_mail" || action === "lock" || action === "agree") {
      const auth = req.headers.get("Authorization") || "";
      let agent: string | null = null; if (/^Bearer\s+\S+/.test(auth)) { try { agent = await d.whoIsAgent(auth); } catch (_) { agent = null; } }
      if (!agent) return json({ error: "Only Tim can do this" }, 403);
      if (action === "agree") {
        const oid = String(body.offer_id || ""), at = String(body.accepted_at || ""), dt = String(body.date_text || "").slice(0, 30);
        if (!UUID.test(oid) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(at)) return json({ error: "Bad request" }, 400);
        try { return json({ ok: true, agreement: await agree(oid, at, dt, agent) }); } catch (e) { return json({ ok: false, error: plain((e as Error).message) }, 400); }
      }
      // Tim presses Send on one draft (offer_mail_drafts, 024): it goes exactly as it stands, and the log keeps exactly what went.
      // A signing link's personal token is made now, for that signer only, and is never kept or returned anywhere.
      if (action === "send_mail") {
        const did = String(body.draft_id || ""); if (!UUID.test(did)) return json({ error: "Bad request" }, 400);
        let m: any; try { m = await call("offer_mail_take", { p_draft: did, p_actor: agent }); } catch (e) { return json({ ok: false, error: plain((e as Error).message) }, 400); }
        const link = m.token ? `${d.appUrl}?sign=${encodeURIComponent(m.token)}` : null;
        const logged = String(m.body).split("[the signing link]").join(link ? `${d.appUrl}?sign=[personal link]` : "[the signing link]");
        const atts: any[] = [], attLog: any[] = [];
        try {
          if (m.attach && m.attach.path) { const f = await d.download(m.attach.path); if (!f || await sha256(f) !== m.attach.sha256) throw new Error("The agreed copy doesn't match its fingerprint, so nothing was sent.");
            atts.push({ filename: String(m.attach.name || "Agreement.pdf"), content: f, contentType: "application/pdf" }); attLog.push({ name: String(m.attach.name || "Agreement.pdf"), sha256: m.attach.sha256 }); }
          const html = d.mail ? d.mail.toHtml(m.body, link) : wrap(esc(m.body).replace(/\n/g, "<br>"));
          await d.sendMail("offer_mail_" + m.kind, Object.assign({ to: m.to, cc: (m.cc || []).length ? m.cc : undefined, subject: m.subject, html }, atts.length ? { attachments: atts } : {}));
        } catch (e) {
          try { await call("offer_mail_done", { p_draft: did, p_actor: agent, p_body: logged, p_attachments: attLog, p_ok: false, p_error: String((e as Error).message || e).slice(0, 400) }); } catch (_) { /* the failure stays visible on the draft */ }
          return json({ ok: false, error: "It didn't send. Nothing has gone. Try again." });
        }
        await call("offer_mail_done", { p_draft: did, p_actor: agent, p_body: logged, p_attachments: attLog, p_ok: true, p_error: null });
        return json({ ok: true });
      }
      const sid = String(body.signing_id || ""); if (!UUID.test(sid)) return json({ error: "Bad request" }, 400);
      try { return json({ ok: true, round: await lockRound(sid, agent) }); } catch (e) { return json({ ok: false, error: plain((e as Error).message) }, 400); }
    }

    // ── a purchaser, by their own link ──
    const token = typeof body.token === "string" ? body.token : "", session = typeof body.session === "string" ? body.session : "";
    if (!["open", "send_code", "verify", "state", "consent", "receipt", "marks", "tap", "change", "ask", "finish"].includes(action)) return json({ error: "Bad request" }, 400);
    if (!TOKEN_RE.test(token)) return json({ ok: false });
    try {
      if (action === "open") {
        const r = await call("offer_sign_open", { p_token: token, p_net: net, p_ua: ua });
        if (!r || r.ok !== true) return json({ ok: false });
        return json({ ok: true, first: String(r.first || ""), address: String(r.address || ""), finished: !!r.finished, stopped: r.stopped ? String(r.stopped) : null, held: !!r.held, email_hint: String(r.email_hint || ""), side: r.side === "vendor" ? "vendor" : "purchaser", round: Number(r.round) || 1 });
      }
      if (action === "send_code") {
        const r = await call("offer_sign_code", { p_token: token, p_net: net });
        if (!r || r.ok !== true) return json({ ok: false, reason: r && r.reason === "busy" ? "busy" : r && r.reason === "stopped" ? "stopped" : undefined });
        try {
          // automatic (the signer is waiting for it): only the code, and who it is from (open point for Tim, EMAIL-VOICE.md)
          await d.sendMail("offer_sign_code", { to: r.email, subject: "Your signing code", html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F1D1A"><p>Your signing code is <strong style="font-size:22px;letter-spacing:4px">${esc(r.code)}</strong></p><p>From Tim McGuire, McGuire Real Estate.</p></div>` });
        } catch (_) { return json({ ok: false, reason: "mail" }); }
        return json({ ok: true });
      }
      if (action === "verify") {
        const r = await call("offer_sign_verify", { p_token: token, p_code: String(body.code || "").replace(/\s+/g, "").slice(0, 12), p_net: net, p_ua: ua });
        if (!r || r.ok !== true) return json({ ok: false, reason: ["wrong", "expired", "tries", "no_code"].includes(r?.reason) ? r.reason : undefined });
        return json({ ok: true, session: String(r.session) });
      }
      if (action === "state") {
        const r = await call("offer_sign_state", { p_token: token, p_session: session });
        const g = Object.assign({}, r.signing); const url = g.draft_path ? await d.signedUrl(g.draft_path) : null; delete g.draft_path;   // the database gives the path only once they have agreed to sign electronically
        return json({ ok: true, signer: r.signer, signing: Object.assign(g, { draft_url: url }), taps: r.taps || [] });
      }
      if (action === "consent") { await call("offer_sign_consent", { p_token: token, p_session: session, p_net: net, p_ua: ua }); return json({ ok: true }); }
      if (action === "receipt") {
        await call("offer_sign_receipt", { p_token: token, p_session: session, p_guide: String(body.guide || ""), p_version: body.version == null ? null : String(body.version).slice(0, 60), p_file: body.file == null ? null : String(body.file).slice(0, 130),
          p_sha256: body.sha256 == null ? null : String(body.sha256).slice(0, 64), p_pages: Array.isArray(body.pages) ? body.pages.filter((x: unknown) => Number.isInteger(x)).slice(0, 50) : null });
        return json({ ok: true });
      }
      if (action === "marks") { await call("offer_sign_marks", { p_token: token, p_session: session, p_sig: String(body.sig || ""), p_init: String(body.init || "") }); return json({ ok: true }); }
      if (action === "tap") { const r = await call("offer_sign_tap", { p_token: token, p_session: session, p_place: String(body.place || "").slice(0, 140) }); return json({ ok: true, done: r.done, of: r.of }); }
      if (action === "change") {
        const id = String(body.id || ""), target = body.target == null ? null : String(body.target);
        if (!UUID.test(id) || (target !== null && !UUID.test(target)) || !Number.isInteger(body.page) || !body.geometry || typeof body.geometry !== "object" || !Array.isArray(body.places)) return json({ ok: false, error: "That change didn't save. Please try again." }, 400);
        const r = await call("offer_sign_change", { p_token: token, p_session: session, p_net: net, p_id: id, p_kind: String(body.kind || "").slice(0, 12), p_page: body.page, p_geometry: body.geometry, p_target: target, p_places: body.places.slice(0, 20) });
        // anyone on this side who had finished now has a change to initial: a draft for each, which Tim reads and sends himself. No email
        // goes to anyone now, Tim included: he hears once, when the round is submitted (Tim, 24 November 2026).
        if (r.reopened > 0) {
          for (const x of r.reopened_signers || []) { if (!x.email || !x.id) continue;
            try { const w = d.mail ? d.mail.reopenedDraft({ first: String(x.name || "").split(" ")[0], address: r.address, by: r.by }) : { subject: `A change to initial: ${r.address || "the offer"}`, body: `Please open the link I sent you earlier and initial the change. Tim` };
              await call("offer_mail_draft_sys", { p_offer: r.offer_id, p_signer: x.id, p_to: [x.email], p_subject: w.subject, p_body: w.body }); } catch (_) { /* Tim sees the reopened signer on the round's page either way */ } }
        }
        return json({ ok: true, id: r.id, reopened: r.reopened });
      }
      if (action === "ask") {
        const r = await call("offer_sign_ask", { p_token: token, p_session: session, p_text: String(body.text || "").slice(0, 1200) });
        let emailed = true;
        // worded by side: a vendor or a purchaser; a decline (from Round 2 on) has its own subject
        const v = r.side === "vendor", later = (r.round || 1) > 1, decline = body.decline === true && later, who = v ? "vendor" : later ? "purchaser" : "buyer", quoted = `<blockquote style="border-left:3px solid #C9C4BD;margin:0;padding:4px 12px">${esc(String(body.text || "").slice(0, 1000))}</blockquote>`;
        const subject = decline ? `${v ? "The vendors have declined the offer" : "The purchasers have declined the vendors' counteroffer"} for ${r.address || "the property"}` : `A ${who} asks for a change: ${r.address || "an offer"}`;
        const html = decline ? `<p><strong>${esc(r.name)}</strong> (${v ? "a vendor" : "a purchaser"}) has declined Round ${esc(r.round)} for <strong>${esc(r.address || "")}</strong> as it stands:</p>${quoted}<p>If that is final, record it on the offer page (A side has withdrawn). Nothing has been sent to the ${v ? "purchasers" : "vendors"}.</p>`
          : later ? `<p><strong>${esc(r.name)}</strong> (${v ? "a vendor" : "a purchaser"}) is answering Round ${esc(r.round)} for <strong>${esc(r.address || "")}</strong> and asks for a change:</p>${quoted}<p>You can switch on changes from their link for this round by presenting it again, or make the change with them in person.</p>`
          : `<p><strong>${esc(r.name)}</strong> is signing their offer for <strong>${esc(r.address || "")}</strong> and asks for a change:</p>${quoted}<p>If it needs changing, correct the offer, re-draft and approve it, and release it again. Everyone then signs the new version.</p>`;
        try { await d.sendMail(decline ? "offer_sign_decline" : "offer_sign_ask", { to: d.timEmail, subject, html: wrap(html) }); } catch (_) { emailed = false; }
        return json({ ok: true, emailed });
      }
      if (action === "finish") {
        const r = await call("offer_sign_finish", { p_token: token, p_session: session, p_net: net, p_ua: ua });
        if (!r.complete) return json({ ok: true, complete: false });
        try { const rd = await lockRound(r.signing_id, "system (last signer finished)"); return json({ ok: true, complete: true, locked: true, round: rd.round }); }
        catch (_) { return json({ ok: true, complete: true, locked: false }); }   // everyone has signed; Tim locks it from his screen
      }
    } catch (e) { return json({ ok: false, error: plain((e as Error).message) }, 400); }
    return json({ error: "Bad request" }, 400);
  };
  // per request: the caller's own site when it is the onboarding app or the portal (corsFor), otherwise the fixed headers
  return async (req: Request): Promise<Response> => {
    const res = await handle(req);
    if (typeof d.cors === "function") { const h = d.cors(req); for (const k of Object.keys(h)) res.headers.set(k, h[k]); }
    return res;
  };
}
