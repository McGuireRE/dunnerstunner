# Onboarding build plan

From the audit of 5 November 2026 ("Onboarding audit and plan", Tim's doc). Five phases. Each names its
builder, and the builder's model is set in its definition, so running a phase uses the right model
automatically. Run a phase with `/build-phase 1` (and so on). Phases run in order; 2 and 3 may overlap.

| Phase | Builder | Model | Why this model |
| --- | --- | --- | --- |
| 1. One property file | onboarding-core | Opus | Changes the database, every screen, PDFs and emails at once, next to signed records |
| 2. Generated documents | onboarding-core | Opus | Legal documents, signatures, appended guides; mistakes reach signed records |
| 3. Journey map | onboarding-light | Sonnet | One new page and an illustration, reading what phase 1 built |
| 4. Translation | onboarding-light | Sonnet | Screens and stored translations; the legal text is translated by the app with Sonnet and checked by a person |
| 5. After signing | onboarding-light | Sonnet | New stages on the property file and dashboard tiles |
| Every phase, at the end | onboarding-reviewer | Opus | An independent check of the whole change before it goes live |

How each phase runs:
1. The builder reads `CLAUDE.md`, this plan, and `migrations/000_schema_reference.md`, then builds in
   small steps, saving each database change as a numbered file in `migrations/`.
2. The builder adds tests, runs `node onboarding/tests/run-all.js`, and stops only when all pass.
3. The builder does not push or deploy. It reports what changed and how it was tested.
4. The reviewer reads the change cold and reports problems. The builder fixes them.
5. Only then is it pushed, the edge functions deployed (pinned to the new SHA), and Tim given a short summary.

---

## Phase 1: one property file

Status: done 5 November 2026 (migrations 001 to 003). Reviewed independently twice; all findings fixed.
Owners, contacts and earlier owners are kept apart; starting again asks same or new owners.

Goal: enter the address, the owners and the property facts once. Every page reads and writes one record.

Database (additive, existing records keep working):
- `properties`: id, address, title_ref, legal_description, owners_on_title, description jsonb (type, year,
  bedrooms, bathrooms, floor, land, construction, parking, heating), disclosures jsonb (work, wt, meth, def
  and details, hazards), stage text, created_at, updated_at.
- `property_people`: id, property_id, position, legal_name, pref_name, email, phone, capacity, entity,
  user_id. One row per owner.
- `property_documents`: id, property_id, kind, name, path, source (dropped in, uploaded, generated),
  read_result jsonb, created_at. Moves the dropped-in documents off the agreement config.
- `property_id` on `prelistings` and `agreements`. A backfill creates a property for every existing
  prelisting and agreement and links them, matching on address.
- Stage values: appraisal, questionnaire, plan, accepted, agreement, signed, live, under_offer, sold,
  settled, withdrawn. Moved by the existing functions (pl_submit, pl_accept, vendor_sign and so on).
- RLS: agent all; a vendor reads the property and people of a property where they are a person.

Screens:
- Let's begin creates the property and owner 1. Dropping in the title there creates every owner.
- The questionnaire's owners step shows the owners already known and asks the vendor to check and complete.
- pl_accept no longer copies owners; the agreement points at the property and its people.
- Let's agree opens on a property, page 1 filled from it; edits on page 1 write back to the property.
- Agreement people stay as they are for signing, created from property people when the agreement is made,
  so signed records are untouched. A signed person's details never change.
- AML files open prefilled from the property person and the title.
- The dashboard lists properties with their stage. Opening one shows its people, documents, prelisting,
  agreement, variations, notices and AML files on one page, as tiles.

Tests: a new `property-file.test.js` covering create at Let's begin, owners from a title, prefill into the
questionnaire and the agreement, write back from page 1, and the dashboard. All existing tests still pass.

Done when: the address and owners are typed once from appraisal to signing, and every existing agreement,
signature and PDF is unchanged.

## Phase 2: generated documents

Status: done 6 November 2026 (migration 005). Reviewed independently twice; all findings fixed. The REA guides
(August 2022) are live. Unit title disclosure left out.

Goal: the remaining paperwork comes from the property file, signed on screen, filed with the agreement.

Updating the REA guides: put each PDF in `onboarding/assets/guides/` under a name that includes its version (old
files must stay, so older agreements still print with the guide they were given), and list it in `guides.json` with
its version and sha256. When a guide is replaced, move the old one into "earlier". An entry without a version or
fingerprint is ignored. The Vendor Declaration is countersigned by Tim after the vendors sign.

- Vendor Declaration (Tim's Word form): a vendor step after signing. Questions already answered in the file
  are shown for confirmation; only the new ones are asked (boundary pegs, items not paid for, history,
  chattels not working, planned repairs, 1995 to 2004 build, Dux Qest and cladding, asbestos, pipes,
  consents signed off, LIM, insurance claims, prior reports, services, insulation, glazing, home and income,
  wood burner). Signed with the same pad and confirmation, PDF generated and filed, Tim emailed.
- Healthy Homes checklist and statement: offered only when the vendor says the property is or will be
  tenanted. Tim fills the measurements on site on his phone; the landlord signs. PDF filed.
- Unit title disclosure: left out (Tim, 6 November 2026). The body corporate manager or the vendor's lawyer
  prepares it.
- Complaints procedure and the Vendor Guide appended to the agreement PDF. Tidy the procedure's typos.
- REA Agency Agreement Guide: appended to the agreement PDF unaltered (keep a copy in assets with its
  version), shown inline before signing, receipt stored with the signature snapshot and printed in the
  execution record.
- REA Sale and Purchase Agreement Guide: a "Before you sell" step after signing, shown inline, with its own
  dated receipt.
  Also shown before the agency agreement is signed, with the receipt in what is signed (Tim, 6 November 2026);
  "Before you sell" then shows it as received. The official guides (August 2022) and the REA's translations are
  in `onboarding/assets/guides/`.

Tests: one per document, and a check that the agreement PDF includes the appended guides.

## Phase 3: journey map

Status: done 6 November 2026. Reviewed independently twice; all findings fixed. Stops 7 to 9 move once phase 5
lets Tim set those stages. Migration 006 (from this review): a vendor's signature needs every guide section read
and every acknowledgement ticked; migration 007 holds signing in person on Tim's device to the same check.

Goal: an illustrated selling pathway, reached from every vendor screen, showing where this vendor is.

- Nine stops: thinking of selling, your updated plan, meeting Tim, your agreement, identity check, getting
  ready, on the market, an offer, sold and settling. Each a tappable stop linking to its page.
- "You are here" from the property's stage. Passed stops ticked; stops ahead visible but quiet.
- Drawn as one inline SVG illustration in the McGuire look (no outside images), light and dark mode, phone
  first. A print version for a leaflet.
- A Journey button in the vendor's top bar; a "Where are they" tile on each property for Tim.

Tests: the map renders at 390 px without sideways scroll, the marker follows the stage, every stop links.

Added 9 November 2026 (Tim: the journey doubles as a pitch page): a public, shareable page at `#journey` (no sign-in, no data
read) and a page for each stop at `#journey/<slug>` (thinking-of-selling, your-updated-plan, meeting-tim, your-agreement,
identity-check, getting-ready, on-the-market, an-offer, sold-and-settling). Wording lives in `window.JOURNEY_PITCH` in
`src/strings.js`, in Tim's voice, with no fee, price, statistic or timeframe (Tim discusses his fee only once a seller has
chosen the best agent, then it is agreed with all owners in writing). Signed-in vendors see "You are here" and a "Go to this
step" button under the same link rules as the panel; the panel gains "Read more" on every stop. No database or edge function
change. Test: `journey-pitch.test.js`.

Added 9 November 2026 (Tim: expand step by step, leave room for pictures): every pitch page now opens folded. A one-line lead, five
section headings with a summary each, and the call to action; sections open to points, points open to two or three sentences, with
Open all / Close all. Photos and videos go in `window.JOURNEY_MEDIA` (strings.js), keyed `section.pointkey`, all empty for now. Add
`?media=preview` to any pitch link to see where they would go. See `assets/journey/README.md`. YouTube and Vimeo load only on tap.

## Phase 4: translation

Status: done 6 November 2026 (migration 008). Changed 8 November 2026 (migration 011, Tim's decision): machine
translations go straight to vendors, unchecked by a person, after the machine checks (numbers, names, placeholders).
Every translated page, the journey panel and print carry Tim's disclaimer in the language with the English underneath;
the English always applies. Tim can pull a language back to English. Notices stay English. Reviewed twice.

Switched off 9 November 2026 (Tim's decision): vendors use their browser's own page translation (Chrome, Edge, Safari)
instead. The app's translation is kept but off behind one switch, `APP_TRANSLATION` in `src/app.js`: no picker, no
translation or language requests, no Translations screen, no automatic translating of plans or variations. Vendor pages
show a quiet guidance line and a disclaimer (with an English copy that shows once the page is translated, and in print).
Names, addresses, amounts, dates, references, emails and phone numbers are marked `translate="no"`. No database change.
Tests for the switched-off path (`translation.test.js`, `translation-strings.test.js`) skip themselves until the switch
is turned back on; `browser-translation.test.js` covers the new behaviour.

Goal: vendors can read every screen and the plain-English guide in their own language.

- Languages to start: English, te reo Māori, Samoan, Tongan, Hindi, Korean, Simplified Chinese.
- A language choice on every vendor page, remembered per person.
- Screen wording moved into one strings file, then translated once by the app's AI (Sonnet), stored,
  and marked "awaiting check" until a speaker approves it. Unchecked languages show English.
- The plain-English Vendor Guide and the acknowledgements translated the same way, with a professional
  check. English always one tap away, and every translated page says the English agreement applies.
- REA guides: the REA's own translations linked beside the English, never our own.
- Tim's plans, variations and notices: translated by Haiku when he publishes, shown to him first.
- Nothing signed is in translation; the signing page shows the English with the translation beside it.

Tests: switching language, fallback to English, the English link, and the signing page staying English.

## Phase 5: after signing

Status: done 7 November 2026 (migrations 009 and 010). Reviewed independently twice; all findings fixed. A property
goes on the market once its agreement is countersigned; the newest countersigned agreement in force governs.

Goal: the property keeps moving after countersigning, and the dashboard and journey map follow it.

- Stages: live, under offer, sold, settled, withdrawn, set by Tim from the property page.
- Reminders on the dashboard: review date 7 days ahead, end of a variation's period, notices not sent.
- Groundwork for the vendor reporting portal (statistics, feedback, offers), no vendor screens yet.

Tests: stage changes, reminders appearing on the dashboard, the journey marker moving.

## Added 18 November 2026: property inspection (Tim: "go around and prefill all the property info and the vendor declaration")

Migration 012 (applied 18 November 2026; reviewed independently three times, all findings fixed). Tim starts an inspection from Home, the Dashboard or any property's Inspection tile,
with only an address: a property file at Appraisal, no vendor, pre-listing or agreement, nothing sent. Six short sections (Outside,
Structure and cladding, Inside, Services, Consents and history, Tenancy) hold page 1's property facts and every Vendor Declaration
question in Tim's wording, each optional, with a progress count and a note per section. Answers save as tapped; with no signal
they wait in the browser and sync when it returns, and a reload goes back to the same section. Facts go to the property file (a
value an agreement in force holds differently waits for Tim to choose). Declaration answers stay on the inspection, agent only,
and reach the vendors as marked answers ("Noted by Tim at the inspection on ...") that they confirm or change before they can
sign, either when they start the declaration themselves or when Tim sends them after listing. Who confirmed each note is recorded
on the server and shown on screen and in the PDF. One edge function change: `fn/pdf.ts` prints that marker (and a Tenancy row when
Tim noted it), so the edge functions need redeploying with this change; declarations without notes print exactly as before. No
email is sent for "Send to the vendors". Photos are left for later (an empty `photos` list on the inspection). Test: `inspection.test.js`;
database: `inspection-rollback.sql` (via `inspection-rollback.py`).

## Added 18 November 2026: prefill from public council records (Tim: "rating information is public, and the councils are the originators")

Migration 013 (written and tested in a rollback block on the live project; not applied). New edge function `fn/property_lookup.ts`
(deployed as `property-lookup`) with a pure core, `fn/property_lookup_core.ts`. After an address is entered (Inspect a property, Let's
begin, Let's agree page 1) or from the Public records tile on any property page, Tim sees a "Found on public records" card: the matched
address, each value with its source, its own date and a tick box. Only strong address matches are used. Sources: the ORC address locator,
ORC Properties (all five Otago councils), LINZ property boundaries, then the council's own layer where one is public (Dunedin rates and
2GP, Queenstown Lakes, Waitaki, Clutha PropertyPublic), cross-checked on the valuation reference, and ORC hazard maps. Rating valuations
and rates read "Council rating valuation (as at {date}), not a market value"; hazards and zones "Not a substitute for a LIM". Nothing
is used until Tim ticks it and taps "Use these"; a value already held is never replaced without his choice; a signed agreement is never
changed. After the first independent review: flats, units and cross-leases (never one picked silently: a certain match on the typed
unit, otherwise Tim chooses the rating unit), the same street in two towns (Tim chooses), only the ORC hazard maps checked at a real
address (liquefaction, tsunami; flood, HAIL, landslides, coastal erosion and alluvial fans switched off and said so) and the Waitaki
zone off until its service address is confirmed, a Remove control, sent or parked agreements left alone, a lookup used only on a
property whose address fits it, new owners start clean, nothing personal in `found`, a cached health check, server-side reuse and a
once-a-minute limit, one deadline for the whole lookup. Tests: `council-core.test.js` (the core, with recorded answers),
`council-fn.test.js` (the edge function's request handling), `council-lookup.test.js` (screens, against the mock); database:
`council-rollback.sql` (via `council-rollback.js`).

---

## Added 18 November 2026: the ORC map server through the database

The deployed `property-lookup` function couldn't reach maps.orc.govt.nz (the connection is reset from the edge runtime), so the
address finder and ORC Properties failed. Migration 015 (written and tested in a rollback block on the live project; not applied)
lets the database make those GETs with pg_net: `orc_http_start` and `orc_http_result`, service role only, ORC map service addresses
only. The function still tries ORC directly first; when that fails with a network error it asks the database instead and remembers
that for 10 minutes, then tries directly again, so it goes back to normal by itself if ORC starts answering. Every other host is
unchanged. The health check now says which way each host answered (`via`: direct or database) and stays cached for a minute, one
check at a time. Tests: `council-core.test.js` (route, memory, the answers checked like direct ones), `council-fn.test.js` (the
handler passes the route, health via, one health check for simultaneous calls, the database polling); database:
`orc-route-rollback.sql` (via `orc-route-rollback.js`).

## Housekeeping to fold into phase 1
- Revoke execute on `on_agreement_signed()` from anon and authenticated; drop the unused
  `is_prelisting_party(prelistings)`.
- The questionnaire's meeting preference shown to Tim where he books the appointment.
- The appraisal page's "link to your full appraisal" becomes a PDF upload into property documents.

## Added 18 November 2026: photos and documents on the property file (Tim: "a photo and document uploader and repository that can talk to dwellhub")

Migration 016 (written and tested in a rollback block on the live project; not applied). A "Photos and documents" section on every
property file, agent only: Take photos (the camera, several at once), Choose files, or drag and drop on a computer. Each file is checked
by its own bytes (`src/repo-core.js`), photos are redrawn on the phone (2560 px long edge, JPEG, the right way up, location and other
hidden data left behind) with a 400 px preview, and a SHA-256 fingerprint is taken. Items wait in IndexedDB with their own key and send
when there is signal (waiting for signal, uploading, saved, didn't save with Try again); a reload keeps them; the key means nothing is
filed twice. Kinds and folders are DwellHub's document types one to one, plus agency papers. Inspection sections have "Add photos" with
the room. Tim can share an item with the vendors (read only, 10 minute links, on their page); appraisals, offers, ID and AML papers and
signed documents never. Remove archives (restorable); nothing is deleted. "Download property file (JSON)": schema "mre.property/1" with
facts, public record values and the item list (no files, no people, and not the vendors' written disclosure details). Nothing is
sent to DwellHub. After the first review: only this round's owners and agreement signers see shared items (not contacts, the
pre-listing contact or earlier owners), starting again for new owners unshares everything, dropped-in documents can't be shared,
and vendors' links come from a new edge function, `fn/repo_link.ts` (deployed as `repo-link`, JWT on), not a storage policy. Queued
items belong to the sign-in that added them and carry on by themselves after signing in again. Tests: `property-repository.test.js`,
`repo-link-fn.test.js`; database: `repo-rollback.sql` (via `repo-rollback.js`).

## Added 23 November 2026: offers and negotiation

A new six-phase plan for the offer form, drafting onto the REINZ blank, signing, counteroffers, deadline day and
after agreement lives in `OFFERS-PLAN.md`. Phase 1 (the offer form) built 23 November 2026 on branch `offers-phase1`: migration 018 (tested in a rollback block on a local
PostgreSQL stand-in only; the live rollback run, with Tim's approval, comes before applying it), edge function `offer-public` (new;
it also serves the AI condition helper). doc-prefill is unchanged. Awaiting review. Tests:
`offers.test.js`, `offers-core.test.js`, `offer-qr.test.js`, `offer-public-fn.test.js`; database: `offer-rollback.sql` (via
`offer-rollback.js`).
Phase 2 (drafting onto the REINZ blank) built 23 November 2026 on branch `offers-phase2`: migration 019 (tested in a rollback
block on a local PostgreSQL stand-in only), edge function `offer-draft` (new; JWT on). doc-prefill and offer-public unchanged.
Tests: `offers-draft.test.js`, `draft-core.test.js`, `offer-draft-fn.test.js`; database: `offer-draft-rollback.sql`
(via `offer-draft-rollback.js`). See `OFFERS-PLAN.md`, "Phase 2 detail".
LIVE 24 November 2026 (NZ): reviewed until ready; the rollback block passed on the live project (no capitals); 019 applied as
`019_offer_drafting`; merged to main (181c875); `offer-draft` deployed with JWT on, pinned to 181c875. Tim's electrical,
technical-report and sale-of-property wording loaded (tokens {date} and {address}; the sale price stays a line for Tim to fill);
both deposit clauses now struck when they don't apply. Specified Due Diligence left unworded (his file is a draft awaiting the
solicitor), so a draft using it shows a placeholder Tim must fill before approving.
Condition timing, further terms numbering and the review screen (Tim, 24 November 2026) built on branch `offers-timing`: migration
021 (built as 022; local stand-in only), offer-draft gains `write_clause`, offer-public's helper writes {timing}. LIVE 24 November 2026 (NZ): rollback block passed on the live project (no capitals); applied as `021_offer_condition_timing`, plus `022_tighten_table_privileges` (Tim approved); main dae98d6; offer-draft (JWT on) and offer-public (JWT off) pinned to dae98d6; Tim's electrical, technical and sale wording now use {timing}. See `OFFERS-PLAN.md`.
Tests: `offers-core.test.js`, `draft-core.test.js`, `offers.test.js`, `offers-draft.test.js`, `offer-public-fn.test.js`,
`offer-draft-fn.test.js`; database: `offer-timing-rollback.sql` (via `offer-timing-rollback.js`).
Phase 3 (purchaser signing) built 24 November 2026 on branch `offers-phase3`: migration 023 (built as 020; tested in a rollback block on a local
PostgreSQL stand-in only), edge function `offer-sign` (new; JWT off, token checked). Awaiting review. Tests: `offers-sign.test.js`,
`sign-core.test.js`, `offer-sign-fn.test.js`; database: `offer-sign-rollback.sql` (via `offer-sign-rollback.js`). See `OFFERS-PLAN.md`, "Phase 3 detail".
