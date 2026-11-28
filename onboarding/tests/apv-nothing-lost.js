// The appraisal's look changed on 28 November 2026 (the approved sample of 24 November 2026), so a record no longer draws exactly
// as an older core drew it. What must hold instead: nothing is lost. Every piece of text the older core drew is still on the page,
// apart from the labels and headings the new look words differently (listed here, each with what says it now), and every photo,
// video and link the older core drew is still there.
// lost(oldHtml, newHtml) returns what is missing, or [] when nothing is.
const RELABELLED = {
  // the comparables, as the sample lays them out: the price in large type, how and when it sold on one line, figures in a table
  'Recent sales nearby': 'Sales and current listings', 'On the market now': 'Sales and current listings', 'Price evidence at a glance': 'The price evidence at a glance',
  'Price': 'the price in large type', 'Date': 'the "Sold ..." line', 'Method': 'the line under the price', 'Days to sell': '"sold in N days"', 'How near': 'the near tag',
  'Capital value': 'Rating valuation', 'Floor area': 'kept', 'Land': 'kept', 'Agency': 'the line under the price',
  'How it compares with your home': 'How it compares with yours', 'Your home as a listing': 'Your home, as buyers would see it',
  // the price dots: "My range" over the shading now reads "Your home: $X to $Y" (the legend still says "My range, shaded")
  'My range': 'Your home: $X to $Y',
  // the median chart's caption, now the sample's
  'Median sale price': 'Median sale price, and the spread around it',
  // the plans: "incl. GST" is now "Including GST." under the price; "Recommended" now "Recommended for your home"
  'incl. GST': 'Including GST.',
};
const strip = h => String(h || '').replace(/<title>[\s\S]*?<\/title>/g, ' ').replace(/<[^>]+>/g, '\u0001').split('\u0001').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const text = h => strip(h).join(' ').replace(/\s+/g, ' ');
const srcs = h => (String(h || '').match(/\b(?:src|href|poster)="[^"]*"/g) || []).filter(a => !/href="#apv-s\d+"/.test(a));
function lost(oldHtml, newHtml) {
  const now = text(newHtml), out = [];
  strip(oldHtml).forEach(t => {
    if (now.includes(t)) return;
    if (Object.prototype.hasOwnProperty.call(RELABELLED, t)) return;
    // a fragment the old core drew with a prefix the new look moved: "Sold for $520,000" is now "$520,000" in large type
    const m = /^(?:Sold for |Asking |Listed |Sold )(.+)$/.exec(t); if (m && now.includes(m[1])) return;
    out.push('text: ' + t);
  });
  const ns = new Set(srcs(newHtml)); srcs(oldHtml).forEach(a => { if (!ns.has(a)) out.push('file or link: ' + a); });
  return out;
}
module.exports = { lost, RELABELLED };
