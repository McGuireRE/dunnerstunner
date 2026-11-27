// The appraisal modes of the doc-prefill edge function (fn/doc_prefill.ts is the deployed entry; it checks the caller is Tim with
// is_agent before either runs). LW3 phase C2. Tested by onboarding/tests/appraisal-ai-fn.test.js with fakes (no model, database or
// storage). The model code is in prefill_shared.ts, and every call is logged in ai_calls with the appraisal's id.
//   appraisal_report: reads a comparables or market report (a PDF Tim filed on the property with the Comparables screen) and saves the
//                     proposals (appraisal_reports) for Tim to tick. Nothing is imported here.
//   buyer_check:      for the comparables in suburbs Tim checks case by case, and for the subject property, who each most likely appealed
//                     to (owner-occupier, investor or student, or unclear), with a one-line reason. Saved (appraisal_buyer_checks) for
//                     the comparables rule to flag mismatches on Tim's screen only.
import { BUYER_CHECK_PURPOSE, buildBuyerRequest, buildReportReadRequest, buyerFacts, MODEL_READ, NO_TOOL_MESSAGE, noToolError, pdfPageCount, readBuyerResult, readReportResult,
  REPORT_MAX_BYTES, REPORT_MAX_PAGES, REPORT_READ_PURPOSE } from "./prefill_shared.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
type Row = { purpose: string; model: string; ok: boolean; error: string | null; input_tokens: number; output_tokens: number; appraisal_id: string; files: number };
export type AiDeps = {
  rpc: Rpc;                                                               // with the service role
  download: (path: string) => Promise<Uint8Array | null>;                 // a file in the property-files bucket, with the service role
  buyerInputs: (aid: string) => Promise<{ appraisal: any; comps: any[]; groups: any[]; facts: { key: string; value: unknown }[] } | null>;
  aiKey: () => string;
  callModel: (request: any, ms?: number) => Promise<{ ok: boolean; status: number; body: any }>;
  logAi: (row: Row, agent: string) => Promise<void>;
};
type Out = { status: number; body: Record<string, unknown> };
const friendly = (status: number, msg: string) => status === 401 ? "The AI key isn't valid. Check the key in Supabase." : /credit|billing/i.test(msg) ? "The AI account is out of credit. Top it up in the Anthropic console." : "The AI didn't answer. Try again in a minute.";
function b64(bytes: Uint8Array) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

export async function readReport(d: AiDeps, body: any, agent: string): Promise<Out> {
  const aid = body.appraisal_id, did = body.document_id;
  if (!UUID.test(String(aid || "")) || !UUID.test(String(did || ""))) return { status: 400, body: { error: "Bad request" } };
  // the appraisal (written from its set-up, not sent) and the report filed on its own property, as a PDF (migration 035)
  const src = await d.rpc("appraisal_report_source", { p_appraisal: aid, p_document: did });
  if (src.error || !src.data) return { status: 409, body: { ok: false, error: (src.error && src.error.message) || "That report can't be read here." } };
  const key = d.aiKey();
  if (!key) return { status: 200, body: { ok: false, reason: "off", message: "Reading reports isn't switched on yet. Your report is saved on the property file." } };
  let bytes: Uint8Array | null = null; try { bytes = await d.download(String(src.data.path)); } catch (_) { bytes = null; }
  if (!bytes || !bytes.length) return { status: 404, body: { ok: false, error: "The report isn't in storage yet. Try again." } };
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return { status: 400, body: { ok: false, error: "That file isn't a PDF." } };
  if (bytes.length > REPORT_MAX_BYTES) return { status: 413, body: { ok: false, error: "That report is over 20 MB, too big to read in one go. Save the comparables pages as their own PDF and upload that." } };
  const pages = pdfPageCount(bytes);
  if (pages > REPORT_MAX_PAGES) return { status: 413, body: { ok: false, error: "That report has more than 100 pages. Save the comparables pages as their own PDF and upload that." } };
  const request = buildReportReadRequest(b64(bytes), String(src.data.name || "report.pdf"));
  let r: { ok: boolean; status: number; body: any };
  try { r = await d.callModel(request, 120000); } catch (e: any) { r = { ok: false, status: 0, body: { error: { message: String(e?.message || e) } } }; }
  const usage = r.body?.usage || {};
  const base = { purpose: REPORT_READ_PURPOSE, model: MODEL_READ, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, appraisal_id: aid, files: 1 };
  if (!r.ok) {
    const msg = String(r.body?.error?.message || r.status).slice(0, 300);
    await d.logAi({ ...base, ok: false, error: msg }, agent);
    return { status: 200, body: { ok: false, reason: "failed", message: friendly(r.status, msg) + " Your report is saved, so you can read it again." } };
  }
  let res: ReturnType<typeof readReportResult> | null = null, readErr: string | null = null;
  try { res = readReportResult(r.body, pages); } catch (e: any) { readErr = String(e?.message || e).slice(0, 300); }
  if (!res || res.noTool) {
    await d.logAi({ ...base, ok: false, error: readErr || noToolError(r.body) }, agent);
    return { status: 200, body: { ok: false, reason: "failed", message: NO_TOOL_MESSAGE + " Your report is saved, so you can read it again." } };
  }
  await d.logAi({ ...base, ok: true, error: null }, agent);
  const result = { report: res.report, comps: res.comps, market: res.market };
  const saved = await d.rpc("appraisal_report_save", { p_appraisal: aid, p_document: did, p_result: result, p_model: MODEL_READ, p_pages: pages || null, p_actor: agent });
  if (saved.error || !saved.data) return { status: 409, body: { ok: false, error: "The reading couldn't be saved: " + ((saved.error && saved.error.message) || "try again.") } };
  return { status: 200, body: { ok: true, report_id: saved.data, result, pages, usage: { input: usage.input_tokens || 0, output: usage.output_tokens || 0 } } };
}

const low = (s: unknown) => String(s ?? "").trim().toLowerCase();
export async function buyerCheck(d: AiDeps, body: any, agent: string): Promise<Out> {
  const aid = body.appraisal_id;
  if (!UUID.test(String(aid || ""))) return { status: 400, body: { error: "Bad request" } };
  let inp: Awaited<ReturnType<AiDeps["buyerInputs"]>> = null; try { inp = await d.buyerInputs(aid); } catch (_) { inp = null; }
  if (!inp || !inp.appraisal) return { status: 404, body: { ok: false, error: "Appraisal not found" } };
  if (inp.appraisal.status === "sent") return { status: 409, body: { ok: false, error: "This appraisal has been sent, and a sent copy never changes." } };
  // the comparables on show in a suburb Tim checks case by case (the suburbs are his data, in suburb_groups, never in code)
  const cbc = new Set<string>(); (inp.groups || []).filter((g) => g && g.mode === "case_by_case").forEach((g) => (g.suburbs || []).forEach((s: string) => { if (low(s)) cbc.add(low(s)); }));
  const sales = (inp.comps || []).filter((c) => c && c.shown !== false && cbc.has(low(c.suburb)));
  if (!sales.length) return { status: 200, body: { ok: true, checked: 0, message: "None of the comparables on show are in a suburb you check case by case." } };
  const key = d.aiKey();
  if (!key) return { status: 200, body: { ok: false, reason: "off", message: "The AI check isn't switched on yet, so nothing is flagged." } };
  const setup = inp.appraisal.setup || {}, fields = inp.appraisal.fields || {};
  const facts = buyerFacts(inp.facts || [], fields.ranges || [], String(setup.suburb || ""), sales);
  const request = buildBuyerRequest(facts);
  let r: { ok: boolean; status: number; body: any };
  try { r = await d.callModel(request, 45000); } catch (e: any) { r = { ok: false, status: 0, body: { error: { message: String(e?.message || e) } } }; }
  const usage = r.body?.usage || {};
  const base = { purpose: BUYER_CHECK_PURPOSE, model: MODEL_READ, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, appraisal_id: aid, files: 0 };
  const soft = "The AI check didn't work this time, so nothing is flagged. Check those sales yourself, or try again.";
  if (!r.ok) { await d.logAi({ ...base, ok: false, error: String(r.body?.error?.message || r.status).slice(0, 300) }, agent); return { status: 200, body: { ok: false, reason: "failed", message: soft } }; }
  const keys = facts.sales.map((s) => String(s.key));
  let res: ReturnType<typeof readBuyerResult> | null = null; try { res = readBuyerResult(r.body, keys); } catch (_) { res = null; }
  if (!res || res.noTool) { await d.logAi({ ...base, ok: false, error: noToolError(r.body) }, agent); return { status: 200, body: { ok: false, reason: "failed", message: soft } }; }
  await d.logAi({ ...base, ok: true, error: null }, agent);
  const comps: Record<string, { verdict: string; reason: string }> = {};
  sales.forEach((c, i) => { const v = res!.sales["s" + (i + 1)]; comps[c.id] = v || { verdict: "unclear", reason: "" }; });
  const saved = await d.rpc("appraisal_buyer_save", { p_appraisal: aid, p_subject: res.subject, p_comps: comps, p_model: MODEL_READ, p_actor: agent });
  if (saved.error || !saved.data) return { status: 409, body: { ok: false, error: "The check couldn't be saved: " + ((saved.error && saved.error.message) || "try again.") } };
  return { status: 200, body: { ok: true, check_id: saved.data, checked: sales.length, subject: res.subject, comps } };
}
