# Portal build plan

Agreed with Tim on 24 November 2026. Build each phase the same way as `BUILD-PLAN.md`: builder, tests against the
mock database, independent reviewer, then push and deploy.

Why: the agent side of the onboarding app has grown one tool at a time. Its screens are opened by function calls
(`viewProperty`, `viewTable`, `viewOfferAgent` and so on) with no address of their own, so the browser's back button,
"return to dashboard" and "return to property" are confusing. Tim wants one front door with a menu, and an address
for every page.

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

Open points for Tim (by design for now): the in-person exits ("Save and close", "Leave without saving", "Stop signing here") take
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

