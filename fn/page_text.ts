// The words of a PDF's pages and each page's turn (/Rotate), for the offer-sign function's check of a line through text before a round
// is locked (Offers fixes 2 review: the struck words come from the signer's device, so they are checked against the draft itself).
// load: a function giving a pdf.js module (getDocument). The entry loads unpdf's serverless build of pdf.js (no DOM globals, no worker
// file, no canvas) lazily, only when a round with a line through text is locked, so a library problem can only refuse that lock and
// never stop the function (offers hotfix 2: a top-level pdf.js import crashed the whole function on Supabase, "DOMMatrix is not
// defined"). draft: src/draft-core.js (DRAFT.readPages, the same reading the app does). No fonts are loaded and nothing is drawn.
// Tested by onboarding/tests/offer-nego-fn.test.js (Node) and onboarding/tests/page-text-bundle.test.js (the real entry, bundled, run
// with no file, network or system access and no DOM globals).
export function pageTextWith(load: () => Promise<any>, draft: any) {
  return async (bytes: Uint8Array) => {
    const pdfjs = await load();
    const pages = await draft.readPages(pdfjs, bytes);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes).slice(0), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    try { for (const p of pages) { const pg = await doc.getPage(p.n); p.rot = ((pg.rotate || 0) % 360 + 360) % 360; } }
    finally { try { if (doc.destroy) await doc.destroy(); else if (doc.cleanup) await doc.cleanup(); } catch (_) { /* nothing more to do */ } }
    return pages;
  };
}
