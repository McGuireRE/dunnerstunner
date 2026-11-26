// 026's own rollback test run again with 029 applied straight after 026 (Offers fixes 3's undo, start again, go back and held
// confirmations, checked to behave the same with 029 in place). 029 asks for each signer's initials inside the chattels box when a side
// signs the whole agreement, so 026's test map gets a chattels area and its places helper an initial inside it; nothing else changes.
// Run: node onboarding/tests/signing-marks-with-026.js > <file>.sql and execute it against a database that has 025 applied (the local
// stand-in). Every line reads as 026's own run does, apart from the counts that include the chattels initials (one more tap per signer
// in a whole round). Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
const strip = f => fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
const m26 = strip('026_offer_undo_revert_hold.sql'), m29 = strip('029_signing_places_marks.sql');
for (const tag of ['$mig$', '$m29$', '$t$', '$f$', '$b$']) if (m26.includes(tag) || m29.includes(tag)) throw new Error('tag clash ' + tag);
let s = fs.readFileSync(path.join(__dirname, 'offer-undo-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + m26 + '$mig$; execute $m29$' + m29 + '$m29$');
const swap = (a, b) => { if (!s.includes(a)) throw new Error('not found: ' + a.slice(0, 60)); s = s.split(a).join(b); };
swap('[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10}]', '[{"id":"date","key":"date","kind":"date","page":1,"x":80,"y":730,"w":200,"h":10},{"id":"chattels","key":"chattels","kind":"area","page":2,"x":40,"y":700,"w":500,"h":120}]');
swap("declare out_ jsonb := '[]'; s int; k int;", "declare out_ jsonb := '[]'; s int; k int; resign_ boolean := coalesce((select resign_every_round from public.offer_settings limit 1), false);");
swap("      out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'block:'", "      if first_ or resign_ then out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'filled:chattels_box:s' || s, 'signer', s, 'kind', 'initial', 'why', 'filled', 'ref', 'chattels_box', 'page', 2, 'x', 50 + s * 30 + case when v then 250 else 0 end, 'y', 600, 'w', 26, 'h', 13)); end if;\n      out_ := out_ || jsonb_build_array(jsonb_build_object('id', 'block:'");
process.stdout.write(s);
