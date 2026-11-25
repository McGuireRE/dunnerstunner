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

### SV. Signing viewer (Tim, 26 November 2026; branch `signing-viewer`, from `offers-hotfix-3` 96a8178)

Status: built, awaiting review. Screens only: no database change, no edge function change, nothing pushed or deployed.

One shared document viewer (`docViewer` and `dvWire` in `src/app.js`, styles under "the signing viewer" in `src/styles.html`) on every
screen where someone reads a document to sign it, by email link or on Tim's screen:
- Offers and counteroffers: the signing places in every round, in person and by link (the vendors' rounds too), and the Client and
  Customer Acknowledgement pages read before signing.
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
- Feedback (the zoom, the tick) shows just under the bar that was pressed (`atBtn`). The wording is in `src/strings.js` (group "viewer").
- Nothing signed changes: what is signed, the signing places, fingerprints and every signed record are as before. The viewer only
  changes how the document is shown on screen. A zoomed offer page is drawn within what a phone can hold (about 12 million pixels).
Tests: `tests/signing-viewer.test.js` (new), and checks added to `variations.test.js`, `vendor-declaration.test.js`, `healthy-homes.test.js`.
Not covered: Tim's own review and set-up screens (the draft review, the blank's places, releasing and presenting a round) keep their
current page controls: they are not signing screens. While Tim is still filling in a Healthy Homes checklist (before the first
signature), his screen shows the form to fill, not the document, so it has no viewer until then. Full screen is left when a screen is
drawn again from scratch (undo, a held change): the browser only allows it after a tap, so the signer taps Full screen again.
