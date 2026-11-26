# Portal build plan

Agreed with Tim on 24 November 2026. Build each phase the same way as `BUILD-PLAN.md`: builder, tests against the
mock database, independent reviewer, then push and deploy.

Why: the agent side of the onboarding app has grown one tool at a time. Its screens are opened by function calls
(`viewProperty`, `viewTable`, `viewOfferAgent` and so on) with no address of their own, so the browser's back button,
"return to dashboard" and "return to property" are confusing. Tim wants one front door with a menu, and an address
for every page.

## Central plan and order of work

Tim's central build plan for the portal is the doc "Dunnerstunner portal: central build plan"
(https://claude.ai/artifact/GQasqhc7aq6M2Y8koiWcmL). Every request is written there first; only the master controller chat
(this repository's session) builds, tests, reviews and publishes. Other chats add requests there and never change the code,
the database or the live site. The controller copies each queued request into this file when it schedules it.

Order of work (set 24 November 2026, confirmed by Tim; reordered the same evening at his request):

LW0. The shared records map, names and order (Tim's central plan, "Listing workflow" and "LW0: the shared records map", 25 and 26
   November 2026; branch `lw0-shared-records`). Status: Built, awaiting review and Tim's approval (needs migration 028 applied after
   review). See "LW0. The shared records" below. The two P1 follow-ups (a refreshed form stays in signing mode; plainer "Couldn't save"
   wording) are done in it.

0000. Offers fixes 3 (Tim's decisions of 25 and 26 November 2026; branch `offers-fixes-3`, on main 92ebdd3). Status: Built, awaiting
   review and Tim's approval (needs migration 026, rollback test first, and offer-sign redeployed). (1) Confirm the agreement while
   frozen is held, not locked, sealed or dated; nothing emailed; completed or discarded once unfrozen. (2) Going back to the last
   sealed round when unfreezing (Tim at once, after a confirm; a party from their own link, through Tim first). (3) Undo in every
   signing turn (last step, or the whole turn with the drawing kept unless cleared), and Tim starting an open round again. Sealed
   rounds, signatures and fingerprints never change; undone work is kept and listed on the timeline. See `OFFERS-PLAN.md`,
   "Offers fixes 3". The `offer_private_hit` agent-is-a-party fix moves to 027.

000. Offers fixes 2 (raised by Tim 25 November 2026 from his test offer; branch `offers-fixes-2`). Status: Built, awaiting review
   and Tim's approval (needs migration 025 and offer-sign redeployed). (1) Typed words now show while signing. (2) Line through text
   snapped to the words it crosses, kept on the page until saved, the struck words shown before Save and recorded. (3) The agreed-copy
   emails fill the agreed price after the negotiation, the deposit, due dates and settlement day. (4) Side-aware wording; the Present
   tick kept. (5) Tim's own phone and email never read as a party's in the email privacy check. (6) Tim emailed the dated agreed copy
   as soon as he confirms the agreement, and again on request. Open: whether "Confirm the agreement" should be blocked while an offer
   is frozen (Tim to decide; unchanged). Review fixes done on the same branch (stricter price reading, other changes blank the dates,
   turned and unreadable pages, struck words checked by the function, run-time phone, integrity alarm). Later (027; 026 is now Offers fixes 3):
   `offer_private_hit` gets the same agent-is-a-party fix. Decided 25 November: Confirm while frozen is held (Offers fixes 3). See `OFFERS-PLAN.md`, "Offers fixes 2".

00. Offers fixes 1 (raised by Tim 25 November 2026, built ahead of everything else; branch `offers-fixes-1`). Status: LIVE
   25 November 2026 (main 06c2d22), reviewed and approved by Tim. (a) The AI wording of conditions and clauses (and translation) always failed:
   Sonnet 5.5 refuses a forced tool_choice. Every AI request now lets the model choose and tells it to answer only through its
   tool; a reply without one fails soft and is logged as "no tool answer". (b) A prominent warning when a property has an
   offer (or its offer form on) but no REINZ agreement blank ready: on "Fill in an offer for a buyer", the Offers tile, the offer
   page and "Needs you". See `OFFERS-PLAN.md`, "Offers fixes 1".

0. LIVE 25 November 2026 (main 121c783): Offers phases 3 (signing) and 4 (counteroffers) live, with the email review changes below, each live step approved by Tim.
   Tim may use it on a live listing at short notice. See `OFFERS-PLAN.md`, "Going live", and `EMAIL-VOICE.md`.
1. SW. Site-wide settings (below): language menu, light and dark, text size and contrast, full screen, and the greeting
   style slider for drafts. Then the P1 follow-ups: a refreshed form stays in signing mode; plainer "Couldn't save" wording.
2. GT1. Grand Tour pass 1 (typed and dictated notes). Small, no new service, and the information gathering it speeds up is
   where most of Tim's time goes.
   With it, IP1: inspection photos in two places (below).
3. Appraisal page (target 11 December 2026). Decisions so far are in the central plan; it gets its own plan file here before
   any build. Its monthly market data and chart code are built as shared parts (see QMU below).
4. QMU1 and QMU2. Quarterly market update passes 1 and 2, built on the Appraisal page's shared market data and charts.
   QMU3 (sending) is held until Tim answers the two open questions below.
5. P2. Properties.
6. P3. Security and never losing work. Must come before GT2 and GT3, which hold recordings and the client heart, and before P4.
7. GT2 and GT3. Grand Tour recording, transcription, field suggestions, property brain and client heart.
8. P4 People, P5 Import and feeds, P6 Assessments. QMU's suburbs-from-owned-properties needs P4; until then QMU2 takes a
   recipient's suburbs typed in by Tim.

Offers phases 5 and 6 follow `OFFERS-PLAN.md` and are not yet placed in this order. Phases 3 and 4 (item 0) were fitted to P1 on
branch `offers-live`, merged and live 25 November 2026 (see `OFFERS-PLAN.md`, "Live status").

## Decisions (Tim, 24 November 2026)

- Address: portal.dunnerstunner.co.nz. No separate domain.
- The portal is the master record for his data. LockedOn, ActivePipe or any later CRM is fed from it.
- The portal is Tim's alone for now. Vendors, buyers and lawyers keep their own links at
  packages.dunnerstunner.co.nz, which must all keep working unchanged.
- Footer menu: Home (the "Needs you" reminders), Properties, People, Processes.
- People is built on the owners already in the system. The LockedOn contact import waits until his contact
  clean-up is finished.
- Wallace Real Estate: undecided. Nothing here depends on it.

## Rules that never bend

- Every rule in `CLAUDE.md`, `BUILD-PLAN.md` and `OFFERS-PLAN.md` still applies. Signed records, signatures and
  fingerprints are never changed.
- No vendor, buyer or lawyer link changes its address or behaviour. Every address already emailed or printed as a
  QR code keeps working.
- Agent pages are useless to anyone not signed in as the agent: Row Level Security already enforces this, and the
  portal adds no public data.
- Quiet List sellers may show in Tim's pipeline row, but the portal never links the Quiet List to McGuire branding
  in anything a member or seller can see.
- The wellbeing and Quantlet apps stay where they are and are not in the portal menu.
- Relab ownership details and buyers' locations stay on agent-only pages.

## Hosting

GitHub Pages serves one custom domain per repository, and this repository is packages.dunnerstunner.co.nz. So the
portal address is a second, tiny repository (`McGuireRE/portal`) holding only a shell: `index.html`, a `404.html`
copy of it (so any address such as `/properties/<id>` opens the app), and `CNAME`. The shell loads the app's script
and styles from packages.dunnerstunner.co.nz, so all code and tests stay in this repository.

Needs Tim, once: create the empty `portal` repository, give Claude access to it, switch on Pages, add one DNS
record (CNAME `portal` to `mcguirere.github.io`) at Crazy Domains, and add the portal address to the allowed
sign-in addresses in Supabase. He signs in once at the new address; the sign-in is kept per address.

Until the address is live, the same shell is served at packages.dunnerstunner.co.nz/portal/ for building and tests.

## Addresses

| Address | Page |
| --- | --- |
| `/` | Home: Needs you, and today's shortcuts |
| `/properties` | Listings row, pipeline row, map |
| `/properties/<id>` | One property (today's `viewProperty` tiles) |
| `/properties/<id>/agreement`, `/offers`, `/offers/<oid>`, `/inspection`, `/documents`, `/aml/<person>`, `/variations/<vid>`, `/forms/<fid>` | That property's work, each on its own address |
| `/properties/<id>/offers/<oid>/draft/<did>/sign`, `/offers/<oid>/signing/<sid>`, `/offers/<oid>/signing/<sid>/turn/<signer>`, `/offers/<oid>/present` | Offers phases 3 and 4 (branch `offers-live`): Ready to sign, a round out for signing, one signer's turn on Tim's device (in person), presenting a round |
| `/people` | Everyone, searchable |
| `/people/<id>` | One person: contact details, every property they own or are linked to, files |
| `/processes` | Start an appraisal, agency agreement, form, inspection or offer. The two assessments show as "Coming soon" (P6) |
| `/processes/<name>` | The chooser for that process (pick or enter the property), then on to the property's address |

Ids in addresses are the database ids. Addresses never contain a name, email or phone number.

## Phases

| Phase | Builder | What |
| --- | --- | --- |
| P1. Shell and addresses | onboarding-core | Router, footer menu, Home, Processes, every existing agent screen given an address |
| P2. Properties | onboarding-light | Listing and pipeline carousels, property photo on tiles, map |
| P3. Security and never losing work | onboarding-core | Lock after 20 minutes idle, passkey or PIN unlock, every page saves as Tim goes, database function review. Required before People goes live |
| P4. People | onboarding-core | People pages on the `crm_*` tables, linked to properties |
| P5. Import and feeds | onboarding-core | Import the cleaned LockedOn contacts; feeds out to LockedOn and ActivePipe |
| P6. Assessments | to be agreed | An improvements and preparation assessment, and a desktop analysis. Design still to be agreed with Tim |

### LW0. The shared records

Status: built, awaiting review (26 November 2026, branch `lw0-shared-records`) and Tim's approval. Migration 028 (`migrations/028_shared_records.sql`)
is written and tested in a rollback block on a local stand-in (every check passed after the first review's fixes); it still has to be run
in a rollback block on the live project before it is applied. It is NOT applied. Before it is applied Tim sees what the backfill would do:
`tests/lw0-backfill-preview.sql`, run on a copy of the live records, writes `tests/out/lw0-backfill-preview.txt` (not committed). Tests: `lw0-shared-records.test.js`,
`tests/shared-records-rollback.sql` (with `.js`), `tests/lw0-standin-030.sql` (the stand-in through 030 brought to the live schema); `portal-routes.test.js`, `inspection.test.js` and
`council-lookup.test.js` updated for the new names and order.

The rule (Tim): every fact has one home; pages read from it and save back; every value carries where it came from and when; if two
sources disagree both are shown and Tim chooses; nothing he ticked is overwritten; signed and sent records keep their own frozen copies.

The five records:
1. Property profile: `property_fact_values` (every value from every source, dated, never changed) and `property_profile` (the chosen
   value per fact, and whether Tim ticked it), over `profile_keys`. Filled by the council lookup, the disclosures check, agreements, the
   Quiet List, the property file itself and Tim. Whatever is chosen is written back to the property file, never to an agreement, so the
   file and the profile always agree; the file's own values are on the profile as Tim's ("Property file") and stay chosen against later
   answers from elsewhere (shown beside them); clearing a field on the file keeps it cleared (no later source refills it by itself; other
   values are shown beside it).
   Tim's decision (26 November 2026): what he records on the disclosures check is his own choice, so it updates the property file, the
   profile (chosen, ticked) and the draft agreement as before; answers from other places (council, agreements, the Quiet List, the
   backfill) only sit beside his values. Except: where a record of title (or cross lease or unit title document) or survey plan is among
   the property's documents, its land area and title reference are the official figures. They stay chosen; a different answer on the
   check is kept beside them, and the check says so right under his answer ("The record of title says 812 m². That is the official
   figure, ..."). Nothing silently overwrites either way. Until he chooses, the official figure goes everywhere: the property file, the
   profile and an unsigned draft agency agreement (never one sent, parked or signed, and never a signed record). When he chooses his own
   value on the profile, the file and the unsigned draft follow (Tim, 26 November 2026). The AI suggests and Tim ticks: only figures he
   ticked in the import review count as official; the rest are shown beside as "from the record of title, not checked" and used nowhere
   until he chooses them. A ticked official figure takes precedence over a check answer whichever came first, but never over a value he
   chose on the profile after it was there, and never refills a fact he cleared. Tim's edit to page 1 of a draft agency agreement is his choice too
   (27 November 2026): the profile and the file follow it, as before; only a fact he cleared, a ticked official figure, or a value he chose
   on the profile after the agreement had one hold against it. Whether a room is a bedroom is his judgement: only his own bedroom counts
   are ever used; council, Quiet List, reader and backfilled agreement counts sit beside. A room-by-room record is planned for LW1/LW2. A ticked value is never overwritten (Tim, 26 November 2026): a later answer that differs,
   for example on the disclosures check, is shown beside it for him to choose. On screen: a "Property profile" card on
   the property file (source and date per fact, the other source's value with "Use this", "Tick all"); the disclosures check offers the
   profile's value for a fact it hasn't noted ("On the property profile: ... Use this"); Tim's typing on the property file is saved to the
   profile as his.
2. Person: `crm_contacts` is the one person record. `person_links` ties every name list to it (the property's people, the agreement's
   people, the questions before we meet, offer signers, the vendors' lawyers, the Quiet List). Same email with a fitting name is one person
   ("Tim McGuire" fits "Timothy John McGuire"; "Bron" fits "Bronwyn McGuire"); no email, the same legal name on the same property. Tim's
   decision (26 November 2026): the same email with different names is different people, flagged for him. An informal name fills a record
   only when the record has no other name yet and nothing contradicts it. A name holding two people ("Tim McGuire and Bronwyn McGuire",
   "A & B") is flagged for him to split, never stored as one legal name. Signed records are linked aside, never changed.
3. Property and person link: `crm_property_links` is the home (agent only, roles and dates; trustee, executor and contact added).
   `property_people` stays as the working list of this round's owners (signing and vendor access read it). The two are kept in step one
   way: the name lists write `crm_property_links` (a role added, changed, set aside or removed follows by trigger), and when Tim says two
   records are the same person, the row's working list follows (the property's people, an unsigned agreement person, the Quiet List
   listing, the answers; never a signed row). Nothing edits `crm_property_links` directly yet; People (P4) must write through the same
   functions. Least disruptive: nothing that signs or grants access had to change.
4. Question bank: `qa_questions` and `qa_answers`. The old questionnaire's nine questions are in it; every answer to the questions before
   we meet is saved to it as the vendor answers, with the person, the property, the source and the date. The Quiet List seller form,
   Tim's Quiet List notes and seller profiles also save to it. The copy emailed to Tim and "What I heard from you" come later (LW3, LW5).
5. Photos and documents: `property_documents` stays the one store. The Quiet List points at it (`photo_doc_ids`); inspection photos are
   the store's items with the inspection's id. No files moved.

Who sees what: vendors read their own property profile (never Relab) and their own answers to questions that are theirs; people records,
links, roles, AML and Tim's notes are agent only. Nobody writes these tables directly.

Names and order (no new screens): "Let's begin" and "pre-listing" are now "Questions before we meet" (name confirmed by Tim, 26 November
2026) everywhere Tim sees them (the address
`/processes/appraisal` still opens it); "Inspect a property" is the "Disclosures check". Processes: see "Processes order" below. Signed records and their wording are unchanged: the Vendor Declaration's "Noted ... at the inspection" lines and the
campaign schedule's "Pre-listing period" (printed into agreements) stay as they are.

P1 follow-ups: a vendor signing a form on Tim's device stays in signing mode after a reload (no menu, Stop signing shown); a failed save
says "Not saved yet. Everything you typed is still here. Check you have signal, then tap Save and close again."

Feedback at the button (Tim's rule, 26 November 2026), swept in LW0 with the one shared `atBtn(btn, msg, kind)` from Offers hotfix 3:
- Every `.btn` pressed on Tim's and vendors' screens is remembered. While the database or a function works for it, a note just under it says
  what is happening ("Saving...", "Sending...", "Drafting...", "Getting it ready to sign...", "Uploading...", "Looking...", or the button's
  own `data-busy` wording). A message the page would have shown in a toast goes under that button instead, and follows the button when the
  page redraws; only if the button is gone for good does it fall back to the toast.
- Left alone (another builder is changing them): the signing viewer (`#sgFlow`, `#sgHandback`), the signing places (`#sgPlacesSum`,
  document holders) and the marking tools (`#sgHeld`). Also the top bar, footer menu and the Back and Continue bar, which already sit at
  the bottom of each step.
- Moved under their buttons: the message lines of the offer form (Send my offer), the clause library (Save the library), Ready to sign
  (signing release) and Present to the vendors or purchasers. The property file's Save, "Use this" and "Tick all" on the property profile
  report at the button, or in the fact's own row once the page has redrawn.
- Only work started by the press shows under it: background saving (the disclosures check every 15 seconds, the upload queue,
  reconnecting) reports in its own place. A message whose button has gone falls back to the toast, even if another button is pressed
  straight after. Whether a message is a problem is said by the code that sends it, never guessed from its words.
- Processes order: "Listing, in order": First visit (coming soon), Appraisal report (coming soon), Questions before we meet, Disclosures
  check, Let's agree, Forms, Draft an offer, Improvements and preparation assessment (coming soon). Then, "Separate from listing": Desktop
  analysis (coming soon), its own process and offer for people weighing up the market who haven't decided to sell (Tim, 26 November 2026). The disclosures check's own
  headings now say "Disclosures check finished" and "Disclosures check not found".

Merged with main ad6548c (Offers hotfix 3 final) on 26 November 2026: main's drafting code and `offers-draft.test.js` taken whole; the two
early hotfix 3 commits on this branch are superseded by it.

First review (26 November 2026, not ready) fixed on the same branch: names on one email, the backfill preview, two-way links where safe,
the profile and the file agreeing, ticked values kept, function privileges, button feedback for background work, the disclosures check
opening offline without waiting, two signers at once, the flaky address check, and Desktop analysis apart from the listing steps.
Re-review (26 November 2026): the property file's own values and facts Tim cleared now hold against answers from elsewhere, so the
backfill preview shows no fact where the profile and the file disagree.
Second re-review (26 November 2026, Tim's decision): disclosures check answers are Tim's own choice; official figures from a record of
title or survey plan hold against them, with a warning under the answer.

Open for Tim: the backfill preview (what each of today's names becomes; the people flagged for him); whether "What I heard from you" may
show answers to Tim's own questions; migration 028's rollback test to be run on the live project before it is applied.

### P1. Shell and addresses

Status: built 24 November 2026 on main (not pushed, awaiting review). No migration. `build.py` also writes `onboarding/portal.js` (the
app in one script), `portal/index.html` (the shell) and a root `404.html` (the same shell; on GitHub Pages it opens deep `/portal/...`
addresses and says "Page not found" for any other missing address). The shell loads its script from absolute
packages.dunnerstunner.co.nz addresses, so the same file goes into `McGuireRE/portal` as `index.html` and `404.html`. Test:
`portal-routes.test.js`. Both portal addresses (`https://packages.dunnerstunner.co.nz/portal/` and
`https://portal.dunnerstunner.co.nz/`) were added to Supabase's allowed sign-in addresses on 24 November 2026.
After the first review: back and forward never leave an in-person screen (the live appointment, signing a variation together, and a
form once a vendor has started signing on its pad); a drawn, unsaved signature is never dropped without asking; a new agreement's
address becomes its own once saved; read-only review keeps the menu. Caveat: this holds within the portal. If the page before was
a separate page load (for example /onboarding opened in the same tab before the portal), Back leaves without asking unless
something is drawn or typed (then the browser asks).

Open points for Tim (by design for now): after a purchaser's or vendor's turn signing an offer on Tim's device (offers phases 3 and 4), Tim's page waits
behind a cover until he taps "I'm Tim, carry on" (no menu, no offer, no one's details); P3's PIN or passkey replaces that tap. the in-person exits ("Save and close", "Leave without saving", "Stop signing here") take
whoever taps them to agent pages. If Tim wants a vendor-proof appointment, a later option is an exit that needs his PIN, which fits
the P3 lock design.

- A small router in `app.js`: one table of address patterns to view functions. Opening a view sets its address
  with `history.pushState`; back and forward (`popstate`) open the view for that address; loading any address
  directly opens the right page after sign-in. The existing unsaved-work warning (`JDIRTY`) applies to every move.
- The router is on only when the app runs as the portal. At packages.dunnerstunner.co.nz/onboarding the app behaves
  exactly as now, including `#journey`, lawyer, signing and offer links.
- Footer menu (Home, Properties, People, Processes) on every agent page, replacing the Home and Dashboard buttons in
  the header. Hidden while a signing pad or a vendor-facing step is on screen in person, so a vendor holding the
  tablet cannot wander. Phone first, safe-area padding, no clash with the Back and Continue bar.
- Every page has one "up" link (property work goes up to its property, a property up to Properties), shown top left.
  No other "return to" buttons.
- Home is the "Needs you" list from today's dashboard. Properties is today's dashboard list until P2. Processes is
  today's home tiles (Let's begin, Let's agree, inspection, offer), plus forms; the two assessments (P6) show as "Coming soon".
- Tests: `portal-routes.test.js` (every address opens its page directly and by menu; back and forward; unsaved
  warning; footer hidden during in-person signing) and all existing tests unchanged.

### P2. Properties

- Row 1: listings (stages signed, live, under offer). Row 2: pipeline sellers (stages before signing, plus Quiet
  List seller leads and listings not yet on the open market). Each a one-row, swipeable carousel of tiles: photo,
  address, owners' names, stage, and a dot when something needs Tim.
- Map of Dunedin below, a pin per tile, coloured by row. A pin opens a small card with two links: the property and
  the vendor or prospect.
- Database (additive): `lat`, `lng`, `geocoded_at` on `properties`. Fill from the council lookup where it already
  returns a position; otherwise from LINZ address data. Ask Tim before using any service that needs a key.
- Map tiles: OpenStreetMap through Leaflet, no key. Addresses are never sent to the map provider, only tile requests.

### P3. Security and never losing work

Decided by Tim, 24 November 2026. Builder onboarding-core. Must be done before People (P4) goes live. Not built yet.

- Lock when idle: the portal locks itself after 20 minutes with no activity, never sooner (Tim: keep it logged in for at least
  20 minutes). The lock is a cover over the page, not a sign-out and not a reload: the page underneath, including anything typed
  and any drawn signature, is exactly as it was when he unlocks.
- Unlock with the device's fingerprint or face (a passkey) or a PIN. A second step at sign-in as well, besides the emailed link.
  The design of both is to be agreed with Tim before building: he is not technical and hates copying keys and signing up to
  services, so it must be hands-off.
- Never losing work (Tim: "always save pages so nothing is lost"): every agent page saves what is typed as he goes, as a draft on
  the server where the record exists, otherwise kept on the device and restored. A lock, a closed tab, a flat battery or a dropped
  connection then loses nothing. Once that is true, the "unsaved work" question disappears from the portal, because there is no
  unsaved work: this replaces the extra prompts P1 introduced (the menu, links, back, forward and reload asking first). Signed
  records, and the rule that nothing signed ever changes, are untouched: autosave applies to drafts only, and a signature is only
  ever stored by the existing signing step.
- Open design point: what the lock does during an in-person signing appointment. Activity resets the timer, so it should not
  fire mid-signing; if it does, the vendor sees only the lock cover and nothing of Tim's.
- Database review, function by function: the SECURITY DEFINER functions Supabase's advisor reports as callable by `anon` (16) and
  `authenticated` (101), confirming each checks who is calling; the 29 functions without a fixed search_path; `pg_net` in the
  public schema; and the 3 tables with Row Level Security on and no policies (confirm that is intended). No fix without a
  migration, a rollback test and review.
- Already done on 24 November 2026: Tim confirmed two-step verification is on for his email account; the spare agent login was
  removed (migration 020; hello@timmcguire.co.nz is the only agent login, and tim@mcguire.co.nz stays his public contact and
  reply-to address); the two portal addresses were added to Supabase's allowed sign-in addresses.

### P4. People

- Built on `crm_contacts`, `crm_contact_methods`, `crm_property_links`, `crm_relationships`, `crm_tags`,
  `crm_tasks` (made 18 November 2026). First fill: every `property_people` row becomes or matches a contact, linked
  to its property as owner. One person, many properties; one property, many people (owner, earlier owner, buyer,
  lawyer, tenant, prospect).
- A person's page: preferred name, contact methods, linked properties with the role on each, AML status (reading
  `aml_files`, never copying ID documents), notes and tasks. Adding an owner on a property offers existing people
  first, so nobody is typed twice.
- Signed agreement people are never changed by an edit to the person.

### P5. Import and feeds

- Import the cleaned LockedOn CSV when Tim says the clean-up is done: a dry run he reviews (new, matched, doubtful),
  then the import. Nothing is emailed to anyone as a result.
- Feeds out: CSV for LockedOn and ActivePipe first. Where there is no API, Claude can enter records through the
  browser while Tim is signed in, and asks before submitting anything.
- Unsubscribes and the Unsolicited Electronic Messages Act: a contact's consent and unsubscribe state travels with
  every feed.

### P6. Assessments

Added 24 November 2026 from Tim. Not built, and not part of P1. The design is still to be agreed with Tim before any build.

In Tim's words: as with DwellHub, he offers more than appraisals. He offers:

1. an assessment for improvements and preparation, and
2. a desktop analysis, less in depth than an appraisal of market value, based off information supplied by a vendor.

Until then the Processes page shows two tiles, "Improvements and preparation assessment" and "Desktop analysis", each marked
"Coming soon" and not clickable. Neither is ever called an appraisal: a desktop analysis is expressly less than an appraisal of
market value. There is no `processes/assessment` address; it shows "This page isn't here".

### GT. Grand Tour

Added 24 November 2026 from Tim's central plan. Scheduled: GT1 next after the P1 follow-ups; GT2 and GT3 after P3.

Grand Tour is the first page of a property's inspection: a fast way for Tim to capture what he sees and hears on a walk-through,
which he confirms later as the authorised agent. It is not a declaration: the Vendor Declaration stays a separate step the vendors
sign. Decided: a portal feature, not a Claude chat. The portal records and stores; an AI model behind the portal transcribes and
interprets. Address: `properties/<p>/inspection/<i>/tour`, the inspection's first section.

Agreed behaviour (Tim, 24 November 2026):
- Three ways in: typed notes, dictated notes, or a recorded conversation.
- Consent first: a tick box and a one-line script before the record button goes live.
- A large pause button always in reach, with an obvious paused state.
- Un-pausing restarts the recording straight away. A one-line "Anything from that to note for disclosure?" box appears at the same
  time and never blocks or delays the recording, answered or not.
- Audio saved to the property as it goes, so nothing is lost if reception drops.
- Keep or delete audio: Tim's choice per tour, with a default set once.
- Two brains. Property brain: features, condition, history, chattels, each fact tagged with where it came from. Client heart:
  motivation, timing, family, worries, how they like to be dealt with; agent only, never on vendor pages, never sent to DwellHub.
- Field suggestions: the AI proposes inspection field updates, each with the sentence it came from; Tim accepts or rejects each.
- Notes written up room by room from the transcript.

Passes:
- GT1. The Grand Tour page with typed notes and dictation (the phone's own voice typing; no new service), saved as typed under
  P3's "never lose work" rule as far as it exists by then, kept offline and synced like the inspection's answers. Used on a real
  tour before GT2 and GT3 are polished.
- GT2. Recording with consent, pause, the disclosure note box, transcription and the written-up notes. Needs a speech-to-text
  service connected to the portal: choose one that Tim can switch on without copying keys, or set it up for him.
- GT3. Field suggestions, property brain and client heart.

Rules carried over: Relab ownership details and buyers' locations stay on agent-only pages. Whatever Tim learns about a defect,
recorded or not, still falls under his disclosure duties (REA rules 10.7 and 10.8): the pause keeps a conversation off the
recording; it does not make it confidential.

Open for Tim: the pause button's label and what sellers are told ("Pause recording" or "Off the record").

Pause button label decided by Tim, 24 November 2026: "Pause recording".

### QMU. Quarterly market update

Added 24 November 2026 from Tim's central plan (section "Quarterly market update"). Scheduled after the Appraisal page.
Agreed layout: the sample at https://claude.ai/artifact/NmeEKE5zwfgHXtc6qHfzzW (a made-up owner with homes in Roslyn and
Dalmore). An option alongside ActivePipe's market report: Tim chooses per quarter, or per owner, which one an owner gets, so no
owner receives both.

A visual, personal update sent each quarter to owners Tim is prospecting, covering Dunedin and every suburb where that owner holds
property. It keeps Tim in front of future vendors between appraisals and turns market curiosity into a call.

What the owner sees, top to bottom:
1. Header video or photo from the Dunedin NZ Visual Library, credited "DunedinNZ", with the season and an AI-drafted headline.
2. Tim's short note, greeting them by preferred name.
3. Last month at a glance: the Dunedin median for the latest REINZ month, change on a year ago, sales and days to sell, two or
   three sentences of commentary.
4. The year in Dunedin: four tiles with sparklines (12-month median, homes sold this quarter against the same quarter last year,
   days to sell, middle half of sales); the median-and-spread chart with a 12 months / 2 years switch and this quarter shaded;
   days to sell; homes sold each month against the year before.
5. Your suburbs: a tab per suburb they own in. 12-month median, middle half, sales, days to sell, change on last year, and how
   far above or below the Dunedin median; the suburb against its neighbours (Tim's suburb groupings, as in the appraisal); recent
   sales as dots with price, month and bedrooms only, never an address. Tapping a dot drops a ready-made question into Ask me.
6. Where Dunedin prices sit: price bands for the last 12 months with the bands holding their suburbs' medians highlighted, and
   how homes were sold (median price and days by method).
7. When buyers are busiest: average sales by month of the year, months ahead in colour, a line on timing a move.
8. Where does your place sit? Two open questions ("Is there a sale you have seen and wondered about?" and "What would you like to
   know about where your property sits?"), Send to Tim, and call or text. No preset answers.
9. DwellHub invitation (off by default until DwellHub is ready): "See your property on DwellHub". A link out only.
10. Sources, "general market information, not an appraisal or a registered valuation", why they are receiving it, unsubscribe.
Paper: the same page through a print stylesheet, every suburb shown, no forms or buttons.

Tim's view: set-up per recipient (suburbs from owned properties, any can be unticked; DwellHub invitation on or off; recent sales
shown or hidden). The AI drafts all wording from the quarter's figures; Tim edits in place and approves the quarter before
anything sends (one approval for the shared commentary; personal notes editable per recipient). A send checklist: consent
recorded, unsubscribe working, figures refreshed and checked, words approved.

Sending and signals: quarterly, after REINZ's monthly release (late February, May, August, November), covering the three latest
REINZ months against the same months a year earlier. A private, unindexed link per owner, no sign-in, suburbs only. Delivery is
an email in Tim's name with the headline, one chart image and a button to the page. Tim is told when someone sends a question or
taps call; opens, suburb taps and repeat visits are logged on their People record, and asking about a sale or opening twice in a
week marks them "value curious" with a reminder to call.

Data: SHARED, NOT COPIED. The Appraisal page's monthly market data (REINZ Market Insights plus individual REINZ sales, refreshed
once a month) and its chart code (median and spread, days to sell, volume bars, price bands, suburb strips) are built once as
shared parts and used by both, so an appraisal and an update never disagree. Suburb figures are calculated from individual REINZ
dwelling sales at each refresh; suburbs under 10 sales carry a "read with care" note. Recent sales are stored with price, month and
bedrooms; the address stays agent only.

Rules: no address, owner name or property detail of anyone else ever appears; no fees, no price for their property, no mention of
quiet or off-market listings; sent only to owners who have agreed to hear from Tim, with Tim identified as sender and a working
unsubscribe that takes effect at once (Unsolicited Electronic Messages Act 2007); the AI drafts and Tim approves before anything
sends; DwellHub stays a link out only, and portal data is not sent to DwellHub by this feature.

Passes:
- QMU1. The update page from the shared market data, with Tim's view, print, and the Ask me form going to Tim. Build when it
  comes up.
- QMU2. Suburb figures per quarter from REINZ, recent sales dots, and the People link (suburbs from owned properties; typed in
  by Tim until P4). Build when it comes up.
- QMU3. Sending, unsubscribe, consent records and the interest signals. HELD until Tim answers both: (a) who sends the email,
  the portal or ActivePipe linking to the portal page; (b) which owners count as having agreed to hear from him, and whether the
  first send asks everyone to opt in.
- QMU4. DwellHub invitation switch, wired once DwellHub can receive an owner by link.

### IP. Inspection photos in two places

Added 24 November 2026 from Tim. Scheduled with GT1.

Tim's words: a space for uploading all photos taken at the inspection, with a separate repository for the general look of the
place and another for documents and evidence of issues or features (for example a photo of the hot water cylinder label or the
meter).

- Two places on the inspection, each taking camera shots (several at once) and files, as the property's photos and documents
  section already does:
  1. "The look of the place": general photos, tagged to a room or area (and to a title where there are several). These are the
     photos Tim marks for the appraisal's mockup listing and their order.
  2. "Documents and evidence": labels, meters, plates, defects, features, paperwork. Each item takes a short caption (for example
     "Hot water cylinder label") and, where it fits, the inspection field or section it supports, so it sits beside that answer.
- Both file into the existing property repository (migration 016): same checks, redrawing, fingerprints, offline queue and
  sharing rules. Evidence is agent only by default and never shared with vendors unless Tim shares an item.
- Photos can be moved between the two places, and nothing is deleted (archive, as now).
- Evidence photos are where GT3's field suggestions can later read labels (for example a cylinder's size and year); not in IP1.

### SW. Site-wide settings

Added 24 November 2026 from Tim. Scheduled first after offers go live. Applies across dunnerstunner: the portal, the vendor,
buyer and lawyer pages at packages.dunnerstunner.co.nz, the Quiet List and the packages page, wherever it fits.

A small row of controls at the top of every page:
- Language: a plain dropdown or button that uses the browser's own translation (as decided 9 November 2026). No introduction or
  explanation anywhere: remove the translation notes and help text now shown at packages.dunnerstunner.co.nz and in the
  onboarding app, keeping only the control. Names, prices and dates stay protected from translation as now. English prevails.
- Light and dark: a button that switches the look and remembers the choice on that device (the system setting stays the
  default until someone chooses). Signature pads stay white with dark ink in both.
- Text size: at least three steps (normal, large, larger), for older readers. Layout must still hold at 390 px with no sideways
  scroll at the largest size.
- Contrast: a higher contrast option (stronger text and borders), working in both light and dark.
- Full screen: an expand icon and a reduce icon that enter and leave the browser's full screen, where the browser allows it.
Each choice is remembered per device. None of them changes any signed document or PDF.

Greeting style for drafts (Tim's words, in summary): some New Zealanders are irked by te reo Maori words used in contrived
settings, others are endeared by it. Tim is flexible and reads each person at the walk-through, so:
- A slider when drafting any email or message to a party, also settable per person (on their People record, and on the
  property's people until P4), so the choice carries to every later draft for them.
- Default in the middle, "Happy medium". Tim's names for the ends, kept as fun labels on his own screens only: "Woke mode"
  (te reo Maori woven through greetings and sign-offs) and "Codger mode" (no te reo unless it is a name or a place). Never
  shown to a party, and never in anything sent.
- Other common languages can be chosen for the greeting and sign-off, where Tim knows a person prefers one (for example the
  greeting in their language with the body in English). The body of legal emails stays English.
- The AI may vary the wording within the chosen style; Tim still reviews every draft before sending.
- The offers emails use plain English openings ("Dear" for purchasers, "Hello" for vendors) until this is built.

### SV. Signing: full screen, zoom and page buttons; chattels initials; four more marks; Tim's own places (Tim, 26 November 2026; branch `signing-viewer`, from `offers-hotfix-3` 96a8178)

Status: built, awaiting review (26 November 2026). Nothing pushed, deployed or applied. Needs migration 029
(`029_signing_places_marks.sql`; 027 and 028 are kept for other work) and the offer-sign edge function redeployed (it gains the `mark`
action and draws the new marks). Mediation as always: nothing reaches the other side until Tim presents it.

A. One shared document viewer (`docViewer` and `dvWire` in `src/app.js`, styles under "the signing viewer" in `src/styles.html`) on every
screen where someone reads a document to sign it, by email link or on Tim's screen:
- Offers and counteroffers: the signing places in every round, in person and by link (the vendors' rounds too), and the Client and
  Customer Acknowledgement pages read before signing. Also Tim's own Ready to sign and Present screens (the places he can change, D).
- The agency agreement: the vendor's own phone (the front page and each prior-agency cancellation notice, one page each) and Tim's
  in-person signing (the front page, and the notices in their own viewer).
- Variations: Tim signing and issuing, signing together on Tim's device, and the vendor's own phone.
- The Vendor Declaration and the Healthy Homes checklist on the vendor's phone, and Tim's form screen once it shows the finished document.
What it does:
- A bar of buttons in the highlight colour (the accent fill with its own text colour, light and dark): Previous page, Next page, the
  page it is on ("Page 2 of 11"), Zoom out, the size, Zoom in, Full screen. Buttons at least 44 px, labelled, with a clear focus ring.
- Full screen: the browser's own where it has one, otherwise the viewer fills the window (an iPhone). Close full screen, or Escape.
- Zoom from 100% to 300%: the buttons, a pinch on a phone, ctrl or a trackpad pinch on a computer, and + or - with the document
  focused. Offer pages are drawn again, sharp, at each size; the other documents are scaled and re-flow. The zoom is kept per signer
  on the device (on Tim's device each purchaser of each document has their own), so it holds after each place, when the page is drawn
  again, on the next page, and on coming back to the screen.
- Pan by dragging with a mouse, or scrolling with a finger, inside the document's own frame: the page itself never scrolls sideways
  at 390 px, even at 300%.
- "Move to the next place for me" (off until ticked, remembered per signer): after each place, a gentle glide to the next place
  still to do, onto the next page when a page is finished, keeping the zoom; at once for anyone who asks their device for less motion.
  Also on Tim's in-person agreement signing with two or more vendors: after one signs, it moves on to the next still to sign.
- Feedback (the zoom, the tick) shows just under what was pressed (`atBtn`; a tick box's note sits under the tick). Wording in
  `src/strings.js` (groups "viewer" and "marks").

B. The chattels box always has initials. Whenever a side signs the whole agreement (Round 1, the vendors' first round, and every round
when "Everyone signs again every round" is on), each signer has initials inside the chattels area of the blank's map. Initials already
there (beside chattels added or struck out) count; otherwise they are proposed side by side inside the box, clear of printed words where
there is room (`SIGN.chattelsArea`, `chattelsBoxes`). A map with no chattels area is said plainly and release waits. Tim can't remove a
signer's last initials there, nor move them out of the box. The database refuses a round without them, whoever writes it (029).

C. Four more ways to mark the page, in every round, in person and by link: "Add text", "Add my initials", "Add my name", "Add my
signature". Round 1 under "Mark the page:", beside the note, line, cross and reinstate, in person and by link alike (Tim, 26 November
2026: link signers in Round 1 get every tool, each holding the round for Tim exactly as on his device); from
Round 2 in "To counter, change the document" (the old "Type words" is now "Add text"; it is the same change, with the further term
numbering). With changes from a link switched off, the link offers only the signer's own initials, name or signature.
- Added text is a change: in Round 1 it holds signing for Tim, who checks it and re-approves, then everyone on that side initials beside
  it; from Round 2 on it is a counter change with initials beside it, and by link only when Tim allowed changes.
- A signer's own initials, name or signature use only their own ink as it stands and their exact name: the database copies the ink in
  itself and refuses anything else. In Round 1 it holds signing for Tim like every mark, but nobody else initials it. From Round 2 on it
  is not a change: it holds nothing, lifts nothing, asks nobody to initial it, and doesn't count as the round changing the document.
- Every new mark sits inside the page, clear of the date place and of other signers' places (from Round 2 a signer's own mark also
  keeps clear of earlier rounds' places). Undo (Offers fixes 3) works on them. 30 an hour per signer; by link 60 an hour per network.
- After the first review (26 November 2026): while a signer's own initials or signature stand on the page, they can't draw their
  signature and initials again, however it is written (`offer_sign_do_marks`, replaced from 026 with that one check, and a trigger on
  `offer_sign_redraws`); "Start my turn again" takes the marks back first, so a round never shows two drawings for one person. A name's
  box must be wide enough for the name at its size, and the drawing shrinks a name to its box if ever it wouldn't fit. A later round's
  places never cover a signer's own mark from an earlier round (`guard_offer_signing_own_clear`, whoever inserts it). A signer's own
  mark from Round 2 doesn't open again anyone on their side who had already finished (it isn't a change).
- By link in Round 1, any mark (the note, a line through text, a crossed-out box, a reinstatement, or one of the four) holds the round,
  is checked by the database exactly as on Tim's screen (`offer_sign_do_mark`, the offer-sign `mark` action with a reinstatement's
  target), and Tim alone is emailed ("A purchaser marked the offer"). Nobody else is told until Tim releases it.
- Shown on screen in the marks layer, drawn on the locked Round 1 and on every later round's working copy and the agreed copy
  (`SIGN.drawAdded`; earlier rounds draw exactly as before), listed on the execution record and the round's record ("Added by a signer
  in this round"), and on the timeline (`sign_marked` in Round 1, `sign_own_mark` later).

D. Tim's own changes to the signing places before a round goes out, on Ready to sign (Round 1) and Present (Round 2 on), in the shared
viewer (`sgEditor`): tap a place to move it, make it bigger or smaller, or remove it; or add initials or a signature for any signer.
Required places can't be removed and the reason shows under Remove: a signature in the block, the foot of each page, a signer's last
initials in the chattels box, initials beside a change. A place is kept inside the page, off the date place and off another signer's
place. Added places pass the same checks in the database; what Tim added, moved or resized, and removed is recorded on the round's
timeline (`sign_places_edited`, through `agent_signing_release_edited` and `agent_round_present_edited`). After the first review, the database
also keeps each place Tim added or moved off every other signer's place, and records what it compared: the places sent (their
fingerprint and count by kind), each added or moved place found and clear, each removed place absent, the own marks kept clear, and
the screen's own count and fingerprint of what it proposed.


E. Identity (Tim, 26 November 2026: "Separate emails matter for signing at a distance. If on a device, I will verify that each signed
separately, but will only do so with their identification logged.")
- By an emailed link, each signer has their own email. Offers: already refused by 023 and 024 (two signers with one email can't be
  released or presented by link). The agency agreement, its notices, variations and forms: "Send to their phones" says so plainly, and
  the database refuses a signature from a link when someone else on the agreement has the same email (`guard_signature_identity` on
  `signatures`, `variation_signatures` and `form_signatures`, whoever writes it).
- On Tim's device signers may share an email or have none (offers), but each turn finishes only once Tim has logged the photo ID he
  checked for that person (the type: NZ driver licence, passport, NZ firearms licence, Kiwi Access Card or other photo ID; never its
  number) and ticked "I checked <name>'s ID and watched them sign". "Known to Tim personally" is no longer a choice on his device.
  - Offers: `agent_signing_finish_checked` (023's `agent_signing_finish` now refuses, so no page can skip the check); the server's time
    is on the timeline (`sign_id_checked`), on each round's execution record ("Tim McGuire checked this person's photo ID ... and watched
    them sign: <time>") and on the agreed copy's record ("Identity checked in person"). Earlier rounds' records read as before.
  - The agency agreement (and its notices, signed with it), variations and forms on Tim's device: the same choice and tick under each
    person's name, above their pad; the check goes in the signed snapshot (type, Tim's tick, his name and the time, and the AML file for
    that person where there is one) and the database refuses an in-person signature without it, with an ID number, or with a time more
    than 15 minutes from now.
- Tim's answers (26 November 2026): "known to Tim personally" is not offered, as built. On his device a vendor with no email can sign
  the agency agreement (and its notices), variations and forms: no copy is emailed to them; right under the save button Tim is reminded
  to print or hand them their signed copy, and his tick is recorded on the agreement's timeline ("Copy handed over by Tim", with the
  time: `agreement_events` kind `copy_handed_over`); nothing signed changes. By link an email is still needed.
- Tim, 26 November 2026, 17:57: in person a contract may still be signed without an ID check, but only after a clear warning. The ID
  check stays the normal path; "Finish without an ID check" (offers) or "Sign without an ID check" (the agreement, notices, variations
  and forms) shows "No identification has been checked for <name>. Finish anyway?" right under the button, and a second tap confirms.
  The record then says plainly "Signed in person without an identity check", with Tim's name and the time: offers in the timeline
  (`sign_no_id_check`), each round's execution record and the agreed copy's record; the agreement, notices, variations and forms in
  the signed snapshot (`id_check` { type: none, warned, by, at, note }). An empty or missing choice is refused by the database
  (`agent_signing_finish_checked` with `no_id_warned`, and `guard_signature_identity`). Still no ID numbers stored, and by link the
  own-email rule stays.

Nothing signed changes: sealed rounds, agreements, signatures, taps, marks and fingerprints are kept exactly as they are; every trigger
stays. Lock order everywhere: the offer, then the signing, then the signer.
Migration 029 (`029_signing_places_marks.sql`, additive): kinds `own_initials`, `own_name`, `own_signature` on offer_sign_marks (the
check widened, nothing removed) and a column `ink_png` (only on a signer's own initials or signature); the view `offer_sign_marks_live`
gains it; triggers `guard_offer_mark_place` (marks) and `guard_offer_signing_chattels` (signings), before insert; new functions
`offer_sign_do_mark`, `offer_sign_mark` (service role), `agent_signing_release_edited`, `agent_round_present_edited` and small
helpers; replaced word for word apart from what is named: `agent_signing_mark`, `agent_signing_review`, `offer_round_lock`,
`agent_round_present`, `offer_agreed_terms`, `offer_doc_layers`, `offer_round_material`, `offer_sign_state`.
Tests: `tests/signing-marks.test.js` (new: B, C and D in the browser, and the cores' PDF drawing), `tests/signing-viewer.test.js` (A),
`tests/signing-marks-rollback.sql` and `.js` (new; run on a local PostgreSQL 16 stand-in through 026: every line as expected, no
CAPITALS), `tests/signing-marks-race.js` (new, local stand-in only: own marks against the same signer's undo, drawing again
and finish, 80 pairs, and against the round being locked: no deadlock, never an own mark with a later drawing, a late mark refused), `tests/signing-marks-with-026.js` (026's own rollback test run again with 029 applied: the same results, apart from the
counts that include the chattels initials), `tests/offer-sign-fn.test.js` (the `mark` action), and `offers-sign`, `offers-nego`
(their link tool checks follow C). The mock (`tests/mock.js`) mirrors 029.
Not covered: while Tim is still filling in a Healthy Homes checklist (before the first signature), his screen shows the form to fill,
not the document, so it has no viewer until then. Full screen is left when a screen is drawn again from scratch (undo, a held change):
the browser only allows it after a tap, so the signer taps Full screen again. The draft review and the blank's places screens keep
their own page controls (they are not signing screens).
Going live, with Tim's approval, in order: (1) the rollback test on the live project (`node onboarding/tests/signing-marks-rollback.js`,
every line lower case, nothing left behind); (2) apply 029; (3) merge and push; (4) redeploy offer-sign pinned to that commit (JWT off,
as now). In-flight Round 1 signings released before 029 carry on; a new release, presentation or a change of method needs the chattels
initials, which the screens now make.
