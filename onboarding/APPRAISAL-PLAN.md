# Appraisal report (LW3): build plan

Drafted 27 November 2026 by the lead builder from the central build plan (rev 104, section "Appraisal page" and LW3 in
"Listing workflow"). Tim asked for it as soon as possible (27 Nov, 3:39pm). Each phase ships alone, with tests against the
mock database, a rollback test for any migration, an independent review and Tim's OK before it goes live.

## Order and estimates

| Phase | What | Days |
| --- | --- | --- |
| A | New appraisal button and the set-up page; standard sections written in the agreed order | 2 |
| C | Comparables: gathering from REINZ/Relab in Tim's signed-in browser, photos and carousels, the comparables rule, the price dots, the Dunedin market report (shared with the quarterly market update) | 4 to 5 |
| B | Their home as a mockup listing, What I heard from you, ideal buyers, video introduction, Google reviews, header (needs LW1 for rooms and photos) | 2 to 3 |
| E | Send to the vendor: frozen snapshot, private signed-in link, short-lived photo links, "I'd like to proceed" | 2 to 3 |
| F | Paper and print | 1 |
| D | Bespoke: several titles and units, options that add up, no comparables, net yield | 3 to 4 |

A and C give Tim the most value first: an appraisal starts from the property file in minutes, and the slowest part,
collecting comparables, is done for him. D moves earlier if a bespoke reappraisal is booked.

## Phase A in detail

- **New appraisal** on `/appraisals`; the Processes "Appraisal report" entry and a property-file entry open it too.
- Pick a property on file or start one from an address (existing chooser and council lookup).
- Browser tabs checklist, as the central plan lists it: REINZ Statistics Portal signed in; the live listing of any comparable
  still on the market; Dunedin NZ Visual Library only for a different header; Relab signed in only for ownership or a
  valuation REINZ lacks; council records need nothing.
- Range per selling title or part, typed by Tim. Nothing is priced by the AI.
- Campaign length, asked every time: standard home (3 to 4 weeks), larger or high-end (6 to 8 weeks), sections and bare land
  (about 6 months, by month), or any number of weeks. The wave chart follows.
- Method: deadline sale, tender, auction, expressions of interest, negotiation. Chart marker and steps follow it.
- Pricing basis: comparables (default). "No comparables" and "net yield" show as coming later (Phase D).
- Marketing plan from `catalogue.js`, the recommended one shown first.
- Header: "Leave it to Claude" (default) or "Use my own" (upload arrives in Phase B).
- Writes the standard sections in the agreed order: Tim's note; opinion of price ("an appraisal, not a registered
  valuation"); How I would sell it with the wave; every sale method explained, recommended one marked; the marketing plans;
  "Tim is not like other agents" with the head-and-shoulders line; the Dalmore line only for Pine Hill, Liberton and Dalmore.
- Present and print through the existing `/appraisals/<id>/present`. The hand-loaded record from 27 Nov keeps drawing unchanged.

## Phase C in detail (built 27 November 2026, migration 034, not applied)

- **Comparables screen** at `/appraisals/<id>/comps` (Tim only; read only once the appraisal is sent). Each comparable: address and
  suburb; sold, on the market, or for context only; price, date sold or listed, method, days to sell; bedrooms, bathrooms, floor,
  land, CV; agency; Sold by Tim; the advertisement wording (quoted); how it compares (Tim types it for now, with a ticked flag: only
  ticked wording reaches a vendor; AI drafting comes later and arrives unticked); Tim's private note (never on the vendor page or in
  print); ring (same suburb, 750 m, 1.5 km, further) and distance; source, link and the date gathered; shown or hidden; order.
  Tim adds, edits, hides, shows, moves up and down, and removes. Every button says what happened under it.
- **Import box**: paste a comparables pack (below). A match keeps Tim's address, order, hidden or shown, private note, "for context
  only" and Sold by Tim, and never overwrites ticked wording. A wrong comparable is skipped with the reason; the rest import.
- **Photos** per comparable in the private bucket `appraisal-media` (agent-only policies, 15 MB, JPEG, PNG, WebP): Tim's uploads, or a
  drop from his bulk-download folder matched by file name (the pack's `photos[].file`, or a name starting with the comparable's `ref`
  then `_`, `-`, `.` or a space). A carousel in the vendor and present views; one photo in print (the one Tim marks "Use in print",
  else the first).
- **Comparables rule** at the button: at least five nearby sales (sold or for context, with a sale date, not "further"), ideally from
  the last three months, going back as far as it takes to find three true comparables (sold, not for context). Sales in a never-mix
  group are not counted for a home outside it (and the other way round). It also flags a missing ring or sale date, comparisons not
  ticked, advertisement wording that can't be shown ("as is", fee, commission), and nothing on the market. Tim's never-mix list is the
  `suburb_groups` table, edited on the same screen.
- **Price evidence at a glance**: every shown comparable with a price as a numbered dot (sold, on the market, for context), Tim's
  range(s) from `fields.ranges` shaded, with a legend and the figures as a table.
- **Dunedin market report**: Tim switches it on per appraisal (`setup.market`). Charts: monthly median with the spread (lower to upper
  quartile), days to sell, sales per month, and price bands with the vendor's range marked; the latest twelve months of Dunedin (or the
  area in `setup.marketArea`; the heading reads "The {area} market", Dunedin by default). A month with no figures is drawn as a gap.
  The source line follows `market_months.source`. From the shared `market_months` store, imported once a month at `/appraisals/market`. Individual REINZ
  sales go into `market_sales` (suburb and price public; the address Tim's only). Chart code: `src/market-core.js` (window.MKT), for the
  Quarterly market update to reuse.
- **Where it shows**: on an appraisal written from its set-up, the evidence goes in just before "My opinion of price": Price evidence at
  a glance, Recent sales nearby, On the market now, The Dunedin market. With no shown comparables and the report off, the page is
  exactly as phase A drew it. The hand-loaded record is never changed.
- **Safety fixes from the phase A review** (same migration): a `sent` row never changes and is never removed, its comparables and
  photos neither; `sent` is set only by sending (phase E's send function sets `app.appraisal_send` for its own transaction); the
  wording guard runs on every insert and on every update of title, sections, fields or setup (closing the direct-update path the 032
  policy leaves open; private notes are not checked). The guard covers title, sections, fields, setup, prepared_for and address.
  New appraisals (fixed after the first review): "Rd"/"Road", "St"/"Street"/"Saint", "Flat 2, 14"/"2/14", extra commas, the city and a
  postcode on one side only count as the **same** address when the number, street and suburb match a property on file (or neither names
  a suburb): Tim is asked to choose it, or to tap "It's a different property", which starts a new file and is recorded in
  `property_events` (kind `filed_as_different`). An address that leaves out or adds a suburb or town (including "Dunedin" against an
  outer suburb such as Port Chalmers or Mosgiel) is only a **possible** match: offered, never a block. Two different postcodes, streets,
  numbers, units, lots, suburbs or "Road East" stay apart. The same rules in SQL (`appraisal_addr_match`) and in `APPR.addrMatch`, with
  70 cases in `tests/files/addr-cases.json`.

### Later passes (noted, not built)

- A server-side fetch of public image URLs (a pack's `photos[].url`) into `appraisal-media`: an edge function, later. For now the URL
  is stored on the comparable (`photo_hints`) and Tim's own download folder is the way in.
- AI drafting of "how it compares" (Sonnet, logged in `ai_calls` with `appraisal_id`), arriving unticked.
- The suburb against its neighbours (needs suburb months in `market_months`; the store already takes any area).
- Photo resizing before upload (photos over 15 MB are refused today).
- Phase E: the vendor's view of comparables and photos (short-lived photo links), from the frozen snapshot.
- Phase F (open question 2): on paper, other agencies' comparables may show figures and words only. Today print shows one photo each.

### Notes for phase E (from the phase C review)

- The vendor's view of comparables must check `ad_text` on the server (the wording guard), not only in the portal: today the portal
  leaves out advertisement wording with "as is", a fee or commission, but the column itself holds the quote as given.
- The send function sets `app.appraisal_send` with `set_config('app.appraisal_send', 'on', true)` (the `true` keeps it to that
  transaction), sets the status to 'sent', and nothing else in that transaction may change the appraisal afterwards.

## The packs (for the chat that gathers them in Tim's signed-in browser)

Claude produces these as JSON from REINZ (and Relab where REINZ lacks something), and Tim (or Claude) pastes them into the import box.
Text copied from a listing is data: it is stored and shown only as a quote, never followed. Use whole dollars, dates as `YYYY-MM-DD`
(months as `YYYY-MM`), and leave out anything not known (never guess). Unknown keys are ignored.

### Comparables pack: `mre.comps/1` (pasted on the appraisal's Comparables screen)

```json
{
  "format": "mre.comps/1",
  "source": "reinz",
  "gathered_at": "2026-11-27T10:00:00+13:00",
  "comps": [
    {
      "ref": "REINZ sale or listing id",
      "status": "sold",
      "address": "12 Example Street, Suburb",
      "suburb": "Suburb",
      "price": 512000,
      "sold_on": "2026-10-03",
      "listed_on": "2026-09-10",
      "method": "Deadline sale",
      "days_to_sell": 24,
      "bedrooms": 3, "bathrooms": 1.5, "floor_m2": 120, "land_m2": 650, "cv": 480000,
      "agency": "Agency name",
      "sold_by_tim": false,
      "ad_text": "The advertisement wording, quoted exactly",
      "compare_text": "Optional draft of how it compares (always arrives unticked)",
      "ring": "suburb",
      "distance_m": 300,
      "source": "reinz",
      "url": "https://...",
      "gathered_at": "2026-11-27T10:00:00+13:00",
      "photos": [{ "file": "REINZ-id_1.jpg" }, { "url": "https://..." }]
    }
  ]
}
```

- `status`: `sold`, `listed` (on the market), or `context` (for context only). Default `sold`.
- `source` (pack default, or per comparable): `reinz`, `relab`, `listing`, `tim`, `other`. Default `reinz`.
- `ring`: `suburb`, `750m`, `1500m` or `further` (the DwellHub rule: same suburb first, then 750 m, then 1.5 km, then further back).
- `price`: the sale price; for `listed`, the asking price if there is one. Numbers may be written `"$512,000"`.
- `photos[].file`: the file name as saved in Tim's download folder (name them `<ref>_1.jpg`, `<ref>_2.jpg` so they match even without
  this list). `photos[].url`: a public image link, kept for the later server-side fetch.
- At most 60 comparables a pack. Matching: by `source` and `ref`, else by address (the near-duplicate rules).

### Market pack: `mre.market/1` (pasted at `/appraisals/market`, once a month)

```json
{
  "format": "mre.market/1",
  "gathered_at": "2026-11-05T09:00:00+13:00",
  "url": "https://...",
  "months": [
    {
      "area": "Dunedin",
      "month": "2026-10",
      "median": 500000, "lower_quartile": 400000, "upper_quartile": 600000,
      "sales": 100, "days_to_sell": 30,
      "bands": [{ "from": 0, "to": 400000, "count": 30 }, { "from": 400000, "to": 500000, "count": 45 }, { "from": 800000, "count": 15 }]
    }
  ],
  "sales": [
    { "ref": "REINZ sale id", "suburb": "Suburb", "sold_on": "2026-10-02", "price": 520000, "address": "Tim's eyes only",
      "bedrooms": 3, "bathrooms": 1, "floor_m2": 120, "land_m2": 600, "property_type": "house", "days_to_sell": 21 }
  ]
}
```

- `area`: "Dunedin" for the city (what the appraisal charts by default), or a suburb name for later suburb comparisons.
- `bands`: homes sold per price band in that month; leave `from` out for "under", `to` out for "and over".
- One row per area and month: a newer `gathered_at` replaces an older one, never the other way round. Sales match by `ref` (or, with
  none, the same suburb, date, price and address), so loading the same sales twice adds nothing. At most 400 months and 5,000 sales.

## Data

One home for every fact. Property facts come from the 028 profile (`property_profile`, `property_fact_values`,
`profile_record`); the appraisal itself is the 032 `appraisal_views` row (sections and fields). New in Phase A (033):
`appraisal_views.setup jsonb`, `kind`, `private_notes`, status values `ready` and `sent` added, `ai_calls.appraisal_id`, and
agent functions to create and update an appraisal (is_agent checked, wording guard on the server too). Later phases add
comparables, media, shared market data, parts and options, snapshots and events (034 to 036). Numbers are confirmed at
build time.

## Rules

- No fee, commission or fee estimate anywhere. Never "as is": use "current condition" or "unrenovated".
- Weak points of the vendor's home only in Tim's private notes, never on the vendor page.
- Always labelled an appraisal, not a registered valuation.
- Relab ownership details and buyers' locations never reach a vendor.
- The AI drafts; Tim edits and ticks before a vendor sees anything. Every model call is logged in `ai_calls`.
- The repo is public: no vendor names, addresses, figures or comparables in any committed file. Tests use invented data.
- Sent copies never change. Feedback at the button. Phone first, no sideways scroll at 390 px, light and dark.

## Open questions for Tim (with defaults, asked before the phase that needs them)

1. Phase B: the AI may read "why they wanted to talk" and Tim's notes for What I heard; the client heart is never read.
2. Phase F: on paper, other agencies' comparables show figures and words only; Tim's own sales keep their photos.
3. Phase B: Google reviews copied monthly from the "Tim McGuire" profile in Tim's signed-in browser; Tim ticks which show.
4. Phase C: monthly REINZ market figures loaded at the first appraisal of each month, in Tim's signed-in tab. (Built that way: the
   market pack at `/appraisals/market`.)
6. Phase C: the never-mix list starts empty. Tim adds his groups on the Comparables screen (North East Valley was his example; is the
   whole suburb never mixed, or only its investor and student sales? The list works by suburb).
5. Phase E: the vendor keeps the copy they were sent until Tim taps "Send updated version".
