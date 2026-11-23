// A made-up stand-in for a REINZ agreement blank, made at test time (the real form is copyright and holds real names, so it is
// never copied into the repository). It puts the printed labels the drafting anchors on in the same relative places as the
// Eleventh Edition 2022 (4) pack, with filler text and invented names around them. Nothing here is the form's wording.
// make({ edition, clause22: false, filledDeposit, filledSettlement, twoLineSettlement, printedTerms, vendorLawyer: false })
// Only the short label words the anchor finder needs are used; everything else is made-up filler. -> Uint8Array
const { PDFDocument, StandardFonts, rgb } = require('/opt/npm-tools/node_modules/pdf-lib');
async function make(o) {
  o = Object.assign({ edition: 'Eleventh Edition 2022 (4)', clause22: true, filledDeposit: true, filledSettlement: true, vendorLawyer: true, pack: true }, o || {});
  const doc = await PDFDocument.create(); doc.setProducer('synthetic test blank'); doc.setTitle('Synthetic blank for tests');
  const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.32, H = 842.04; let pg, n = 0;
  const page = () => { pg = doc.addPage([W, H]); n++; t(o.edition, 467.4, 790.4, 9); t('\u00a9 Synthetic test form. All rights reserved.', 28.3, 25.2, 9); t(String(n), 293.2, 25.2, 8); };
  const t = (s, x, y, size, bold) => pg.drawText(s, { x, y, size: size || 9.5, font: bold ? B : F, color: rgb(0, 0, 0) });
  const fill = (s, x, y) => pg.drawText(s, { x, y, size: 8, font: F, color: rgb(0.1, 0.1, 0.1) });
  // 1. the front page
  page();
  t('SYNTHETIC TEST AGREEMENT', 41.9, 761.9, 20, true);
  t('Synthetic approval line for testing only.', 45.7, 746.6, 10);
  t('DATE:', 28.3, 729.9, 11, true); t('VENDOR:', 28.3, 713, 11, true); fill('Testy Vendorperson & Otherly Vendorperson', 31.8, 701.1);
  t('PURCHASER:', 28.3, 649.7, 11, true); t('and/or nominee', 494.7, 649.7, 10);
  t('Filler: registered under the GST Act, filler:', 28.3, 587.6); t('Yes/No', 535.4, 587.6);
  t('Purchase price allocation filler:', 28.3, 555.9); t('Vendor', 498.5, 555.9); t('Yes/No', 535.3, 555.9);
  t('Synthetic filler.', 28.3, 545.2, 9); t('Purchaser/Purchaser\'s Nominee', 388, 545.2); t('Yes/No', 535.3, 545.2);
  t('PROPERTY', 28.3, 524.4, 11, true); t('Address:', 28.3, 512.2); fill('1 Example Road, Testville', 68.4, 512);
  t('PAYMENT OF PURCHASE PRICE', 28.3, 355.4, 11, true);
  t('Purchase price', 28.3, 342.5); t(':', 93.1, 342.5); t('$', 97.8, 342.5); t('Plus GST', 326.1, 342.5); t('(if any) OR', 366.2, 342.5); t('Inclusive of GST', 410, 342.5); t('(if any)', 481.1, 342.5);
  t('Deposit', 28.3, 267.3); t('(refer clause 2.0)', 64.1, 267.3, 9); t(': $', 129.5, 267.3, 10);
  if (o.filledDeposit) { fill('Ten percent filler deposit wording for a synthetic test', 142.5, 267.5); fill('second filler line', 142.5, 259.5); }
  t('Synthetic balance line filler:', 28.3, 237.9);
  t('(1)', 49.6, 225.4); t('Filler settlement date which is:', 65.9, 225.4);
  if (o.filledSettlement) fill('fifteen working days filler confirmation', 315.9, 226);
  if (o.twoLineSettlement) fill('second filler line of settlement words', 315.9, 216.5);
  t('OR', 28.3, 213.7); t('(2)', 49.6, 202.2); t('Synthetic filler line two.', 65.9, 202.2);
  t('CONDITIONS', 28.3, 178.3, 11, true);
  [['Finance required', '9.1', 'Finance date:'], ['LIM required', '9.3', 'LIM date:'], ['Building report required', '9.4', 'Building report date:'], ['Toxicology report required', '9.5', 'Toxicology report date:'],
    ['OIA consent required', '9.6', 'OIA date (clause 9.8):'], ['Land Act consent required', '9.7', 'Land Act date (clause 9.8):']].forEach(([a, c, d], i) => {
    const y = 165.7 - i * 15.2; t(a, 28.3, y); t(`(clause ${c})`, 28.3 + F.widthOfTextAtSize(a, 9.5) + 2, y, 9); t(':', 190, y, 10); t('Yes/No', 205.6, y); t(d, 255.2, y); });
  t('TENANCIES', 28.3, 66.6, 10, true); t('Yes/No', 531.7, 66.6, 10);
  t('Synthetic filler about tenancies.', 28.3, 56.7, 9);
  // 2. filler general terms
  page(); for (let i = 0; i < 30; i++) t(`${i + 1}.0 Synthetic general term filler line number ${i + 1} for the test blank.`, 34, 760 - i * 20, 9);
  // 3. further terms
  page(); t('FURTHER TERMS OF SALE', 34.4, 765.1, 16, true); t('Further Terms continued filler', 33.5, 748.6, 9);
  if (o.printedTerms) { t('1. Synthetic printed term one, filler words.', 36, 730, 9); t('2. Synthetic printed term two, filler words.', 36, 718, 9); t('filler continuation of term two.', 36, 706, 9); }
  // 4. schedule 1
  page(); t('SCHEDULE 1', 260, 790.4, 11, true); t('Section 2 Purchaser', 30, 600, 9.5, true);
  t('2(a)    The purchaser is registered, filler.', 30, 585); t('Yes/No', 535.3, 585);
  t('2(b)    Synthetic filler question.', 30, 570); t('Yes/No', 535.3, 570);
  // 5. schedule 2 and 3
  page(); t('SCHEDULE 2', 260, 760, 11, true); t('List all chattels filler', 210, 746, 9.5); t('(Strike out or add, filler.)', 120, 734, 9);
  t('Stove', 34, 712); t('( )', 110, 712); t('Rangehood', 160, 712); t('(1 )', 260, 712); t('Heat pump', 330, 712); t('(2 )', 420, 712);
  t('Dishwasher', 34, 698); t('( 1 )', 110, 698); t('Garden shed', 160, 698); t('( )', 260, 698);
  t('Light fittings', 34, 684); t('Window coverings', 160, 684); t('Fixed floor coverings', 330, 684);
  t('Both parties should check, filler.', 34, 600, 9); t('SCHEDULE 3', 260, 560, 11, true); t('Filler tenant line', 34, 540);
  // 6. signatures
  page(); t('Filler heading', 34, 700, 11, true); t('Synthetic filler.', 34, 686, 9);
  t('Signature of Purchaser(s):', 40, 560); t('Signature of Vendor(s):', 330, 560);
  for (let i = 0; i < 3; i++) { const y = 530 - i * 70; t('_'.repeat(40), 40, y); t('_'.repeat(40), 330, y); t('Name:', 42, y - 12); t('Name:', 332, y - 12); if (i < 2) fill(['Testy Vendorperson', 'Otherly Vendorperson'][i], 362, y - 12);
    t('Filler capacity line', 42, y - 24, 8); t('Filler capacity line', 332, y - 24, 8); }
  // 7. the back page
  page(); t('SYNTHETIC BACK PAGE', 112.7, 762.4, 16, true);
  t('VENDOR:', 31.4, 743.5, 10, true); fill('Testy Vendorperson & Otherly Vendorperson', 34, 730); t('Contact Details:', 31.4, 695.1);
  t('VENDOR\'S LAWYERS:', 31.4, 640.4, 10, true);
  [['Firm:', 625.7, 'Example Vendor Law'], ['Individual Acting:', 611.1, 'Vera Solicitor'], ['Email:', 596.5, 'vera@vendorlaw.example'], ['Contact Details:', 582, null]].forEach(([l, y, v]) => { t(l, 31.4, y); if (v && o.vendorLawyer) fill(v, 31.4 + F.widthOfTextAtSize(l, 9.5) + 4, y); });
  t('Email address for service of notices', 31.4, 530.7); t('(clause 1.4)', 187, 530.7, 9); t(':', 232.3, 530.7, 10);
  t('PURCHASER:', 31.4, 509.2, 10, true); t('Contact Details:', 31.4, 460.9);
  t('PURCHASER\'S LAWYERS:', 31.4, 406.2, 10, true);
  t('Firm:', 31.4, 391.5); t('Individual Acting:', 31.4, 376.9); t('Email:', 31.4, 362.2); t('Contact Details:', 31.4, 347.7);
  t('Email address for service of notices', 31.4, 296.5); t('(clause 1.4)', 187, 296.5, 9); t(':', 232.3, 296.5, 10);
  t('SALE BY filler agency', 31.4, 274.9, 10, true);
  // 8. the appendix
  page(); t('Appendix', 28.4, 758.6, 18, true); t('21.0 Synthetic Deposit Heading', 28.4, 743.3, 11, true);
  t('21.1 Synthetic filler sentence one for the deposit clause.', 28.4, 732.5, 9);
  t('21.2 Synthetic filler about a trust account for the deposit, line one.', 28.4, 711.8, 9); t('Synthetic filler, line two.', 28.4, 701.4, 9);
  t('21.3 Synthetic filler about KiwiSaver funding, line one.', 28.4, 670.4, 9); t('Synthetic filler, line two.', 28.4, 660, 9);
  if (o.clause22) { t('22.0 Synthetic Approval Heading', 28.4, 604.6, 11, true); t('Synthetic filler about a lawyer approving, line one.', 28.4, 593.8, 9); t('Synthetic filler line two ends within one working', 28.4, 583.4, 9); t('days of filler.', 28.4, 573.1, 9); }
  // 9. a pack page: an acknowledgement with a witness block
  if (o.pack) { page(); t('Synthetic pack page', 120, 760, 13, true); t('Property Address: 1 Example Road, Testville', 30, 740);
    t('The purchaser acknowledges the synthetic LIM report filler has been received.', 30, 700); t('The purchaser acknowledges the synthetic as is where is filler.', 30, 680); t('Witnessed filler:', 30, 600); t('Date:', 330, 600);
    pg = doc.addPage([W, H]); n++; t('A synthetic inserted LIM page without the edition string.', 30, 760); }
  return await doc.save();
}
module.exports = { make };
