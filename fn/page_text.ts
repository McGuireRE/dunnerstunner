// The words of a PDF's pages and each page's turn (/Rotate), read with pdf.js, for the offer-sign function's check of a line through
// text before a round is locked (Offers fixes 2 review: the struck words come from the signer's device, so they are checked against
// the draft itself). load: a function giving the pdf.js module; draft: src/draft-core.js (DRAFT.readPages, the same reading the app
// does); worker (offers hotfix 1): the pdf.js worker module, imported statically by the entry and handed to pdf.js here, so pdf.js runs
// it on this thread and never tries to load pdf.worker.mjs from disk (the edge bundle has no such file: live, 26 November 2026, every
// round with a line through text was refused). No fonts are loaded and nothing is drawn: only the words and their places are read.
// Tested by onboarding/tests/offer-nego-fn.test.js (Node) and onboarding/tests/page-text-bundle.test.js (a Deno bundle with no file access).
export function pageTextWith(load: () => Promise<any>, draft: any, worker?: any) {
  return async (bytes: Uint8Array) => {
    if (worker && worker.WorkerMessageHandler) (globalThis as any).pdfjsWorker = worker;
    const pdfjs = await load();
    const pages = await draft.readPages(pdfjs, bytes);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes).slice(0), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    try { for (const p of pages) { const pg = await doc.getPage(p.n); p.rot = ((pg.rotate || 0) % 360 + 360) % 360; } }
    finally { try { if (doc.destroy) await doc.destroy(); else if (doc.cleanup) await doc.cleanup(); } catch (_) { /* nothing more to do */ } }
    return pages;
  };
}
