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
| `/processes` | Start an assessment, appraisal, agency agreement, form, inspection or offer |
| `/processes/<name>` | The chooser for that process (pick or enter the property), then on to the property's address |

Ids in addresses are the database ids. Addresses never contain a name, email or phone number.

## Phases

| Phase | Builder | What |
| --- | --- | --- |
| P1. Shell and addresses | onboarding-core | Router, footer menu, Home, Processes, every existing agent screen given an address |
| P2. Properties | onboarding-light | Listing and pipeline carousels, property photo on tiles, map |
| P3. People | onboarding-core | People pages on the `crm_*` tables, linked to properties |
| P4. Import and feeds | onboarding-core | Import the cleaned LockedOn contacts; feeds out to LockedOn and ActivePipe |

### P1. Shell and addresses

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
  today's home tiles (Let's begin, Let's agree, inspection, offer), plus forms and assessment.
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

### P3. People

- Built on `crm_contacts`, `crm_contact_methods`, `crm_property_links`, `crm_relationships`, `crm_tags`,
  `crm_tasks` (made 18 November 2026). First fill: every `property_people` row becomes or matches a contact, linked
  to its property as owner. One person, many properties; one property, many people (owner, earlier owner, buyer,
  lawyer, tenant, prospect).
- A person's page: preferred name, contact methods, linked properties with the role on each, AML status (reading
  `aml_files`, never copying ID documents), notes and tasks. Adding an owner on a property offers existing people
  first, so nobody is typed twice.
- Signed agreement people are never changed by an edit to the person.

### P4. Import and feeds

- Import the cleaned LockedOn CSV when Tim says the clean-up is done: a dry run he reviews (new, matched, doubtful),
  then the import. Nothing is emailed to anyone as a result.
- Feeds out: CSV for LockedOn and ActivePipe first. Where there is no API, Claude can enter records through the
  browser while Tim is signed in, and asks before submitting anything.
- Unsubscribes and the Unsolicited Electronic Messages Act: a contact's consent and unsubscribe state travels with
  every feed.
