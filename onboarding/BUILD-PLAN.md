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

---

## Housekeeping to fold into phase 1
- Revoke execute on `on_agreement_signed()` from anon and authenticated; drop the unused
  `is_prelisting_party(prelistings)`.
- The questionnaire's meeting preference shown to Tim where he books the appointment.
- The appraisal page's "link to your full appraisal" becomes a PDF upload into property documents.
