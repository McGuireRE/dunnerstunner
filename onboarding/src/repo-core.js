/* Photos and documents on the property file (migration 016): the kinds, the checks on a file's own bytes, and where each item
   is stored. No page or database code here, so the tests can load it on its own. The kind list must match repo_kinds in
   migrations/016_property_repository.sql (the test property-repository.test.js compares them). */
(function (root) {
  'use strict';
  // [kind, folder, shareable with the vendors, in the mre.property/1 export]. Names and folders are DwellHub's document types, one
  // to one; folder 'agency' is the agency's own papers, never exported.
  const KINDS = [
    ['Record of title', 'title', 1, 1], ['Sale and purchase agreement', 'title', 0, 1], ['Easement or covenant', 'title', 1, 1], ['Cross lease or unit title document', 'title', 1, 1],
    ['LIM report', 'council', 1, 1], ['Building consent', 'council', 1, 1], ['Code compliance certificate', 'council', 1, 1], ['Resource consent', 'council', 1, 1], ['Property file from council', 'council', 1, 1],
    ['Floor plan', 'plans', 1, 1], ['Building plans', 'plans', 1, 1], ['Survey plan', 'plans', 1, 1],
    ["Builder's report", 'reports', 1, 1], ['Meth test', 'reports', 1, 1], ['Healthy homes assessment', 'reports', 1, 1], ['Electrical certificate', 'reports', 1, 1], ['Gas certificate', 'reports', 1, 1], ["Engineer's report", 'reports', 1, 1],
    ['Invoice', 'work', 1, 1], ['Quote', 'work', 1, 1], ['Producer statement', 'work', 1, 1],
    ['Warranty', 'systems', 1, 1], ['Manual', 'systems', 1, 1], ['Service record', 'systems', 1, 1],
    ['Insurance policy', 'insurance', 1, 1], ['Insurance renewal', 'insurance', 1, 1], ['Insurance claim', 'insurance', 1, 1],
    ['Photo', 'photos', 1, 1],
    ['Tenancy agreement', 'rental', 1, 1], ['Bond lodgement', 'rental', 1, 1], ['Property management agreement', 'rental', 1, 1],
    ['Rates notice', 'valuation', 1, 1], ['Registered valuation', 'valuation', 1, 1],
    ['Listing ad', 'other', 1, 1], ['Other', 'other', 1, 1],
    ['Agency agreement', 'agency', 1, 0], ['Variation', 'agency', 1, 0], ['Notice', 'agency', 1, 0], ['Vendor Declaration', 'agency', 1, 0],
    ['Healthy Homes checklist and statement', 'agency', 1, 0], ['Marketing proof', 'agency', 1, 0],
    ['Appraisal', 'agency', 0, 0], ['Offer', 'agency', 0, 0], ['Identity document', 'agency', 0, 0], ['AML record', 'agency', 0, 0], ['CRM export', 'agency', 0, 0],
  ];
  const FOLDERS = [['photos', 'Photos'], ['title', 'Title and legal'], ['council', 'Council'], ['plans', 'Plans'], ['reports', 'Reports and checks'],
    ['work', 'Work done'], ['systems', 'Appliances and systems'], ['insurance', 'Insurance'], ['rental', 'Rental'], ['valuation', 'Rates and valuation'],
    ['other', 'Other'], ['agency', 'Agency papers']];
  const ROOMS = ['Outside', 'Front', 'Back', 'Grounds', 'Roof', 'Garage', 'Entrance', 'Living', 'Dining', 'Kitchen', 'Bedroom', 'Bathroom', 'Laundry', 'Hallway', 'Underfloor', 'Ceiling space', 'Detail', 'Other'];
  const MAX_BYTES = 25 * 1024 * 1024;
  const PHOTO_EDGE = 2560, DOC_IMAGE_EDGE = 4000, THUMB_EDGE = 400;
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword', xls: 'application/vnd.ms-excel', txt: 'text/plain', csv: 'text/csv' };
  const STORED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', MIME.docx, MIME.xlsx, MIME.doc, MIME.xls, 'text/plain', 'text/csv'];
  const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.xlsx,.doc,.xls,.txt,.csv,application/pdf,image/*';

  const kindInfo = k => { const r = KINDS.find(x => x[0] === k); return r ? { kind: r[0], folder: r[1], shareable: !!r[2], exportable: !!r[3] } : null; };
  const folderOf = k => (kindInfo(k) || {}).folder || null;
  const folderName = f => (FOLDERS.find(x => x[0] === f) || [null, 'Not sorted yet'])[1];
  // may Tim share it with the vendors? a kind from the list that may be shared, and never a signed document the system filed
  const shareable = (kind, source) => source !== 'generated' && !!(kindInfo(kind) || {}).shareable;
  const ext = name => { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/); return m ? m[1] : ''; };
  const has = (b, at, sig) => sig.every((v, i) => b[at + i] === v);
  const ascii = s => Array.from(s, c => c.charCodeAt(0));
  const findAscii = (b, s) => { const t = ascii(s); outer: for (let i = 0; i + t.length <= b.length; i++) { for (let j = 0; j < t.length; j++) if (b[i + j] !== t[j]) continue outer; return true; } return false; };

  // What a file really is, from its first bytes (head, up to 64 KB) and its last (tail, up to 64 KB), never from its name alone.
  // Returns { mime, image, convert } or { error } in plain words.
  function sniff(head, tail, name) {
    head = head || new Uint8Array(0); tail = tail || new Uint8Array(0);
    const e = ext(name);
    if (!head.length) return { error: 'This file is empty.' };
    if (has(head, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: MIME.pdf };   // %PDF-
    if (has(head, 0, [0xff, 0xd8, 0xff])) return { mime: MIME.jpg, image: true };
    if (has(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: MIME.png, image: true };
    if (has(head, 0, ascii('RIFF')) && has(head, 8, ascii('WEBP'))) return { mime: MIME.webp, image: true };
    if (has(head, 4, ascii('ftyp')) && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif'].some(b => has(head, 8, ascii(b)))) return { mime: MIME.heic, image: true };
    if (has(head, 0, [0x50, 0x4b, 0x03, 0x04])) {   // a zip: only Word and Excel files are accepted
      const word = findAscii(head, 'word/') || findAscii(tail, 'word/'), xl = findAscii(head, 'xl/') || findAscii(tail, 'xl/');
      if (word && !xl) return { mime: MIME.docx };
      if (xl && !word) return { mime: MIME.xlsx };
      return { error: 'This looks like a zip file. Only PDF, photos, Word, Excel and text files can be added.' };
    }
    if (has(head, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {   // an older Word or Excel file
      if (e === 'doc') return { mime: MIME.doc }; if (e === 'xls') return { mime: MIME.xls };
      return { error: 'This older Office file needs to be named .doc or .xls.' };
    }
    if (['txt', 'csv'].includes(e)) {
      const n = Math.min(head.length, 8192);
      for (let i = 0; i < n; i++) { const c = head[i]; if (c === 0 || (c < 9) || (c > 13 && c < 32 && c !== 27)) return { error: 'This file says it is text but isn\'t.' }; }
      try { new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, n - (n === head.length ? 0 : 4))); } catch (_) { return { error: 'This text file isn\'t in a form that can be read.' }; }
      const t = new TextDecoder().decode(head.subarray(0, Math.min(head.length, 2048))).toLowerCase();
      if (/<\s*(html|script|svg|!doctype|iframe|body)/.test(t)) return { error: 'Web pages can\'t be added.' };
      return { mime: e === 'csv' ? MIME.csv : MIME.txt };
    }
    return { error: e ? `A .${e} file can't be added, or it isn't what its name says. Use PDF, photos, Word, Excel or text.` : 'This kind of file can\'t be added. Use PDF, photos, Word, Excel or text.' };
  }
  // stored names: letters, digits, dot, dash and underscore only, at most 100 characters, keeping the extension
  function safeName(name) {
    const e = ext(name), base = String(name || 'file').replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'file';
    return e ? `${base}.${e.replace(/[^a-z0-9]/g, '')}` : base;
  }
  const extFor = mime => ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', [MIME.docx]: 'docx', [MIME.xlsx]: 'xlsx', [MIME.doc]: 'doc', [MIME.xls]: 'xls', 'text/plain': 'txt', 'text/csv': 'csv' })[mime] || 'bin';
  // where an item is kept: photos/<key>.jpg (and .thumb.jpg), docs/<key>-<name> (and <key>.thumb.jpg for an image)
  function paths(pid, key, kind, name, mime, withThumb) {
    const photo = kind === 'Photo', dir = `properties/${pid}/${photo ? 'photos' : 'docs'}/`;
    const base = safeName(name).replace(/\.[^.]*$/, ''), file = photo ? `${key}.jpg` : `${key}-${base}.${extFor(mime)}`;
    return { path: dir + file, thumb: withThumb ? `${dir}${key}.thumb.jpg` : null };
  }
  const titleFrom = name => String(name || '').replace(/\.[^.]*$/, '').replace(/[_]+/g, ' ').trim().slice(0, 200);
  const sizeText = n => n == null ? '' : n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
  async function sha256(buf) { const h = await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join(''); }
  // a sensible kind for a file before Tim says otherwise
  function guessKind(name, image, chosen) {
    if (chosen && kindInfo(chosen)) return chosen;
    if (image) return 'Photo';
    const n = String(name || '').toLowerCase();
    const rules = [[/\blim\b/, 'LIM report'], [/title|\bct\b|record of title/, 'Record of title'], [/floor ?plan/, 'Floor plan'], [/builder|building report|inspection report/, "Builder's report"],
      [/meth/, 'Meth test'], [/rates/, 'Rates notice'], [/\bccc\b|code compliance/, 'Code compliance certificate'], [/consent/, 'Building consent'], [/insurance/, 'Insurance policy'],
      [/invoice/, 'Invoice'], [/quote/, 'Quote'], [/warranty/, 'Warranty'], [/manual/, 'Manual'], [/tenancy/, 'Tenancy agreement'], [/survey/, 'Survey plan'], [/valuation/, 'Registered valuation']];
    const r = rules.find(([re]) => re.test(n)); return r ? r[1] : 'Other';
  }

  const REPO = { KINDS, FOLDERS, ROOMS, MAX_BYTES, PHOTO_EDGE, DOC_IMAGE_EDGE, THUMB_EDGE, MIME, STORED, ACCEPT, kindInfo, folderOf, folderName, shareable, sniff, safeName, paths, titleFrom, sizeText, sha256, guessKind, ext };
  if (typeof module !== 'undefined' && module.exports) module.exports = REPO; else root.REPO = REPO;
})(typeof window !== 'undefined' ? window : globalThis);
