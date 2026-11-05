// One-off check that the AI key and model work, using a made-up sample title and contact list. Locked by a random token; replaced by a stub afterwards.
import { cors, json } from "./shared.ts";
import { MODEL, SYSTEM, TOOL } from "./prefill_shared.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (new URL(req.url).searchParams.get("t") !== "cc91068f2f25e40f2dc83c81cc01bf58e9f7138aad16ca38") return json({ error: "no" }, 403);
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!key) return json({ error: "not_set_up" }, 503);
  const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica); const pg = doc.addPage([595, 842]);
  ["RECORD OF TITLE UNDER LAND TRANSFER ACT 2017", "FREEHOLD", "Identifier OT99Z/999 (SAMPLE ONLY)", "Land District Otago", "Estate Fee Simple", "Area 612 square metres more or less", "Legal Description Lot 9 Deposited Plan 9999", "Registered Owners", "William Robert Sample and Mary Anne Sample", "Interests", "12345678.1 Mortgage to Example Bank Limited - 1.2.2019", "Subject to a right of way over part marked A on DP 9999"].forEach((t, i) => pg.drawText(t, { x: 50, y: 790 - i * 22, size: 11, font: f }));
  const pdf = await doc.save(); let b = ""; for (let i = 0; i < pdf.length; i += 0x8000) b += String.fromCharCode(...pdf.subarray(i, i + 0x8000));
  const content = [{ type: "text", text: "File: sample-title.pdf" }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(b) } }, { type: "text", text: "File: crm.csv" }, { type: "text", text: "Name,Nickname,Email,Mobile\nWilliam Sample,Bill,bill@example.com,021 555 0101\n" }, { type: "text", text: "Current form values: {}\n\nRecord what these documents say for the agency agreement." }];
  const t0 = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: "fill_agreement" }, messages: [{ role: "user", content }] }) });
  const out = await r.json();
  return json({ status: r.status, ms: Date.now() - t0, model: out.model, usage: out.usage, error: out.error, result: (out.content || []).find((c: any) => c.type === "tool_use")?.input });
});
