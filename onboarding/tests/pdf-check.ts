// Run by agreement-pdf.test.js: deno run -A pdf-check.ts <repo root> <out dir> <phase 1 pdf.ts copy>
// Builds agreement PDFs with the phase 1 code and with today's code, and checks:
// - an agreement signed before phase 2 comes out the same (text of every page, page count);
// - an agreement signed on phase 2 has the Vendor Guide ($575), the Complaints procedure and the REA guide appended,
//   the REA guide pages unaltered, and the guide receipt with its version in the execution record;
// - with no guide files, nothing about them is appended, and the app and PDF wording match.
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
const [root, out, oldPath] = Deno.args;
const NEW = await import("file://" + root + "/fn/pdf.ts");
const LOAD = await import("file://" + root + "/fn/pdfload.ts");
const OLD = await import("file://" + oldPath);
const errs: string[] = [];
const expect = (ok: boolean, msg: string) => { if (!ok) errs.push(msg); };
const asset = (n: string) => Deno.readFileSync(root + "/onboarding/assets/" + n);
const template = asset("agreement-v3.15-26102026.pdf"), font = asset("body.ttf"), bold = asset("bold.ttf");
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

async function text(bytes: Uint8Array, name: string) {
  const f = `${out}/${name}.pdf`; Deno.writeFileSync(f, bytes);
  const r = await new Deno.Command("pdftotext", { args: ["-layout", f, "-"], stderr: "null" }).output();
  return new TextDecoder().decode(r.stdout);
}
const pages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
// the footer's "copy generated <time>" changes every run; everything else must match
const stable = (t: string) => t.replace(/copy generated .*? · page/g, "copy generated · page").replace(/generated [0-9].*? · page/g, "generated · page");

const config = { appr: "done", ask: "875000", askBasis: "median", flat: "12000", thr: "250000", pct: "2.95", aml: "Manual", approach: "invited", method: "Price by negotiation", start: "2026-10-20" };
const answers = { capacity: "Owners", gst: "no", titleOk: true, pType: "House", pBed: "3", pBath: "1", pFloor: "140", pLand: "612", pYear: "1958", work: "no", wt: "no", meth: "no", def: "no", hazards: [], acks: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], guide: ["0", "1", "2", "3", "4", "5", "6", "7"], prior: "none" };
const people = [{ id: "P1", position: 1, legal_name: "Jane Mary Smith", email: "jane@example.com", signed_at: "2026-10-20T02:00:00Z" }, { id: "P2", position: 2, legal_name: "Robert Smith", email: "rob@example.com", signed_at: "2026-10-20T02:05:00Z" }];
const ag = { id: "A1", ref: "MRE-2026-1001", address: "22 Queens Drive, Belleknowes, Dunedin", status: "countersigned", agreement_version: "v3.15-26102026", config, answers, legal: { choice: "have" }, signed_at: "2026-10-20T02:05:00Z", cooling_off_until: "2026-10-21T04:00:00Z" };
const sig = (id: string, pid: string, name: string, at: string, extra: any = {}) => ({ id, agreement_id: "A1", person_id: pid, signer_role: "client", signer_name: name, image_path: "x.png", snapshot: Object.assign({ config, answers }, extra), snapshot_sha256: "ab".repeat(32), signed_at: at, user_agent: "Test" });
const agent = { id: "S3", agreement_id: "A1", person_id: null, signer_role: "agent", signer_name: "Timothy McGuire", image_path: "a.png", snapshot: {}, snapshot_sha256: "cd".repeat(32), signed_at: "2026-10-21T05:00:00Z" };
const images = { S1: png, S2: png, S3: png };

// 1. Signed before phase 2: the same as the phase 1 code, page for page
const oldSigs = [sig("S1", "P1", "Jane Mary Smith", "2026-10-20T02:00:00Z"), sig("S2", "P2", "Robert Smith", "2026-10-20T02:05:00Z"), agent];
const base = { template, font, bold, ag, people, sigs: oldSigs, sigImages: images, variations: [] };
expect((await LOAD.appendixFor(oldSigs)) === undefined, "an agreement signed before phase 2 keeps the old format");
const before = await OLD.buildAgreementPdf(base);
const after = await NEW.buildAgreementPdf({ ...base, appendix: await LOAD.appendixFor(oldSigs) });
const tb = await text(before, "old-signed-before"), ta = await text(after, "old-signed-after");
expect(await pages(before) === await pages(after), `old agreement page count changed (${await pages(before)} vs ${await pages(after)})`);
expect(stable(tb) === stable(ta), "old agreement text changed");
expect(tb.includes("$500 administration fee (including GST); the"), "the old agreement still ends with the template's own guide page");

// 2. Signed on phase 2, with the REA guide received (a made-up two-page test file, not the real guide)
const fake = await PDFDocument.create(); const hv = await fake.embedFont(StandardFonts.Helvetica);
for (const n of [1, 2]) fake.addPage([595, 842]).drawText(`TEST FIXTURE GUIDE PAGE ${n}`, { x: 60, y: 700, size: 14, font: hv });
const fakeBytes = await fake.save();
const appx = { set: NEW.APPENDIX_SET, vendor_guide: NEW.VENDOR_GUIDE.id, complaints: NEW.COMPLAINTS.id, rea_agency_guide: { version: "TEST-1", file: "test-guide.pdf" } };
const rg = [{ guide: "agency", version: "TEST-1", file: "test-guide.pdf", shown: "On screen before signing", acknowledged_at: "2026-11-02T01:00:00Z" }];
const newSigs = [sig("S1", "P1", "Jane Mary Smith", "2026-11-02T02:00:00Z", { appendices: appx, rea_guides: rg }), sig("S2", "P2", "Robert Smith", "2026-11-02T02:05:00Z", { appendices: appx, rea_guides: rg }), agent];
const realFetch = globalThis.fetch;
const fakeSha = await LOAD.sha256Hex(fakeBytes);
appx.rea_agency_guide = Object.assign(appx.rea_agency_guide, { sha256: fakeSha });
const serve = (list: any, files: Record<string, Uint8Array>) => (globalThis.fetch = (async (u: any) => { const url = String(u); if (url.endsWith("guides/guides.json")) return list ? new Response(JSON.stringify(list), { status: 200 }) : new Response("missing", { status: 404 }); for (const [f, b] of Object.entries(files)) if (url.endsWith("guides/" + f)) return new Response(b, { status: 200 }); return new Response("missing", { status: 404 }); }) as any);
serve({ agency: { file: "test-guide-2.pdf", version: "TEST-2", earlier: [{ file: "test-guide.pdf", version: "TEST-1" }] } }, { "test-guide.pdf": fakeBytes });
const ap2 = await LOAD.appendixFor(newSigs);
expect(!!ap2 && ap2.reaGuide?.version === "TEST-1" && !!ap2.reaGuide?.bytes, "a phase 2 agreement appends the guide version it was signed with");
const p2 = await NEW.buildAgreementPdf({ ...base, sigs: newSigs, appendix: ap2 });
const t2 = (await text(p2, "phase2-signed")).replace(/\s+/g, " ");
expect(t2.includes(NEW.VENDOR_GUIDE.title) && t2.includes("$575 administration fee (including GST)"), "Vendor Guide appended, with the $575 fee");
expect(t2.includes("given with Agency Agreement MRE-2026-1001, not part of it"), "the guide pages say they are not part of the agreement");
expect(!/\$500 administration fee \(including GST\); the/.test(t2), "the template's old guide page ($500) is not used");
expect(t2.includes("Step 6") && t2.includes("0800 367 7322 or 04 471 8930") && t2.includes("personalised process"), "Complaints procedure appended, tidied");
expect(t2.includes("version TEST-1") && /shown on screen before signing/.test(t2), "the guide receipt and version are in the execution record");
const p2doc = await PDFDocument.load(p2), n2 = p2doc.getPageCount();
const lastTwo = (await text(p2.slice(), "phase2-check")).split("\f").slice(n2 - 2, n2).map((x) => x.trim());
expect(lastTwo[0] === "TEST FIXTURE GUIDE PAGE 1" && lastTwo[1] === "TEST FIXTURE GUIDE PAGE 2", "the REA guide pages are appended last, unaltered (no footer or stamp): " + JSON.stringify(lastTwo));
expect(n2 === await pages(before) - 1 + 3 + 2 || n2 === await pages(before) - 1 + 2 + 2, `phase 2 page count ${n2}`);
// only a guide Tim listed, by name and version, and the same file the client was shown
const withGuide = (g: any) => [Object.assign({}, newSigs[0], { snapshot: Object.assign({}, newSigs[0].snapshot, { appendices: Object.assign({}, appx, { rea_agency_guide: g }) }) })];
expect((await LOAD.appendixFor(withGuide({ version: "TEST-1", file: "../../fn/shared.ts" })))?.reaGuide === null, "a ../ guide name is rejected");
expect((await LOAD.appendixFor(withGuide({ version: "TEST-1", file: "other.pdf" })))?.reaGuide === null, "a guide file Tim didn't list is rejected");
expect((await LOAD.appendixFor(withGuide({ version: "TEST-9", file: "test-guide.pdf" })))?.reaGuide === null, "a listed file with a different version is rejected");
const wrongSha = await LOAD.appendixFor(withGuide({ version: "TEST-1", file: "test-guide.pdf", sha256: "0".repeat(64) }));
expect(!!wrongSha?.reaGuide?.received && !wrongSha?.reaGuide?.bytes, "a file that isn't the one they were shown is not attached");
const tamper = (await text(await NEW.buildAgreementPdf({ ...base, sigs: withGuide({ version: "TEST-1", file: "../x.pdf" }).concat(newSigs.slice(1)), appendix: await LOAD.appendixFor(withGuide({ version: "TEST-1", file: "../x.pdf" })) }), "phase2-tampered")).replace(/\s+/g, " ");
expect(!/guide to agency agreements \(version/.test(tamper) && !tamper.includes("TEST FIXTURE"), "with an unlisted guide, no receipt line and no guide pages");
// the Vendor Guide states the agreement's own administration fee
const fee = (await text(await NEW.buildAgreementPdf({ ...base, ag: { ...ag, config: { ...config, admin: "650" } }, sigs: [], appendix: { set: NEW.APPENDIX_SET, reaGuide: null } }), "fee-650")).replace(/\s+/g, " ");
expect(fee.includes("a $650 administration fee (including GST)") && !fee.includes("a $575 administration fee"), "the Vendor Guide uses the agreement's fee");
const nofee = (await text(await NEW.buildAgreementPdf({ ...base, ag: { ...ag, config: { ...config, adminOn: false } }, sigs: [], appendix: { set: NEW.APPENDIX_SET, reaGuide: null } }), "fee-none")).replace(/\s+/g, " ");
expect(nofee.includes("marketing costs; no administration fee applies to your agreement."), "no administration fee: the Vendor Guide says so");

// 3. Guide files missing: an unsigned draft gets the Vendor Guide and Complaints, and nothing about the REA guide
serve({ agency: { file: "test-guide.pdf", version: "TEST-1" } }, {});
expect((await LOAD.appendixFor([]))?.reaGuide === null, "draft: a listed guide whose file isn't there is not mentioned");
globalThis.fetch = (async () => new Response("missing", { status: 404 })) as any;
expect(Object.keys(await LOAD.guideList()).length === 0, "no guide list while the files are missing");
const ap3 = await LOAD.appendixFor([]);
expect(!!ap3 && ap3.reaGuide === null, "unsigned draft: phase 2 format, no REA guide");
const draft = await NEW.buildAgreementPdf({ ...base, ag: { ...ag, status: "sent", signed_at: null, cooling_off_until: null }, sigs: [], appendix: ap3 });
const t3 = (await text(draft, "draft-no-guides")).replace(/\s+/g, " ");
expect(t3.includes("Step 6") && !t3.includes("TEST FIXTURE") && !/guide to agency agreements \(version/.test(t3), "draft without guide files: appendices only");
// a guide list without a version is ignored (a version is never made up)
globalThis.fetch = (async (u: any) => String(u).endsWith("guides.json") ? new Response(JSON.stringify({ agency: { file: "a.pdf" }, sale_purchase: { file: "b.pdf", version: " " } }), { status: 200 }) : new Response("", { status: 404 })) as any;
expect(Object.keys(await LOAD.guideList()).length === 0, "guide entries without a version are ignored");
globalThis.fetch = realFetch;

// 4. A signed form prints from the stored record, with the wording fixed by its version, not the page's copy
const stored = { pegs: { a: "yes", d: "Pegs at all four corners" } };
const form = { id: "F1", kind: "vendor_declaration", form_version: "VD-2026-11", status: "signed", data: { fileOk: true, facts: [["Type", "House"]], answers: stored, notes: "" } };
const forged = { title: "Vendor Declaration", pages: [{ title: "Vendor Declaration", sections: [{ title: "X", rows: [["Can the Vendor identify the location of ALL boundary pegs?", "No", "FORGED ANSWER"]] }] }] };
const fsigs = [{ id: "FS1", signer_role: "client", signer_name: "Jane Mary Smith", snapshot: { doc: forged, signer: { email: "jane@example.com" } }, snapshot_sha256: "ef".repeat(32), signed_at: "2026-11-03T01:00:00Z" },
  { id: "FS2", signer_role: "client", signer_name: "Robert Smith", snapshot: { doc: forged, signing_method: "In person, on the licensee's device", witnessed_by: "Timothy McGuire" }, snapshot_sha256: "01".repeat(32), signed_at: "2026-11-03T01:05:00Z" },
  { id: "FS3", signer_role: "agent", signer_name: "Timothy McGuire", snapshot: { doc: forged }, snapshot_sha256: "02".repeat(32), signed_at: "2026-11-03T02:00:00Z" }];
const tf = (await text(await NEW.buildFormPdf({ font, bold, ag, people, form, fsigs, images: { FS1: png, FS2: png, FS3: png } }), "vendor-declaration")).replace(/\s+/g, " ");
expect(tf.includes("Can the Vendor identify the location of ALL boundary pegs? Yes. Pegs at all four corners") && !tf.includes("FORGED ANSWER"), "form PDF prints the stored answers, not the snapshot's copy");
expect(tf.includes("Is the Vendor aware of any Dux Qest plumbing, Weatherside cladding, or Monolithic cladding?") && tf.includes("vii. We have provided the Agent"), "form PDF has the server's wording for VD-2026-11");
expect(tf.includes("Witnessed by: Timothy McGuire (Licensee)") && tf.includes("ef".repeat(32)), "form PDF has each signature's witness and fingerprint");
expect(tf.includes("Timothy McGuire (Licensee, REA#20117983, for McGuire Real Estate Limited)") && tf.includes("02".repeat(32)), "the licensee's countersignature is in the PDF");
const tf2 = (await text(await NEW.buildFormPdf({ font, bold, ag, people, form, fsigs: fsigs.slice(0, 2), images: {} }), "vendor-declaration-uncountersigned")).replace(/\s+/g, " ");
expect(tf2.includes("Not yet signed by the Licensee."), "before Tim countersigns, the PDF says so");
let threw = false; try { await NEW.buildFormPdf({ font, bold, ag, people, form: { ...form, form_version: "VD-1999" }, fsigs, images: {} }); } catch (_) { threw = true; }
expect(threw, "an unknown form version is refused, never guessed");
const hh = (await text(await NEW.buildFormPdf({ font, bold, ag, people, form: { id: "F2", kind: "healthy_homes", form_version: "HH-2026-11", status: "signed", agent_data: { c: { ins3: { a: "N", n: "No underfloor insulation" } }, res: { req: "3.6" } } }, fsigs: fsigs.slice(0, 1), images: {} }), "healthy-homes")).replace(/\s+/g, " ");
expect(hh.includes("Underfloor insulation ≥R1.3 nationwide Compliant: N. No underfloor insulation") && hh.includes("Required: 3.6") && !hh.includes("Not yet signed by the Licensee"), "Healthy Homes PDF from Tim's stored measurements, no licensee line");

// 5. The app shows the same Complaints procedure the PDF appends, and no em dashes anywhere
const app = Deno.readTextFileSync(root + "/onboarding/src/app.js");
const m = app.match(/const COMPLAINTS = (\{[\s\S]*?\n  \});/);
expect(!!m && JSON.stringify(new Function("return " + m![1])()) === JSON.stringify(NEW.COMPLAINTS), "app and PDF Complaints wording match");
const ft = app.match(/const FORM_TEXT = (\{[\s\S]*?\n  \});/);
expect(!!ft && JSON.stringify(new Function("return " + ft![1])()) === JSON.stringify(NEW.FORM_TEXT), "app and PDF form wording match");
for (const f of ["onboarding/src/app.js", "fn/pdf.ts", "fn/pdfload.ts", "fn/notify.ts"]) expect(!Deno.readTextFileSync(root + "/" + f).includes("—"), `no em dashes in ${f}`);
console.log(JSON.stringify({ pagesBefore: await pages(before), pagesPhase2: n2, errs }, null, 1));
