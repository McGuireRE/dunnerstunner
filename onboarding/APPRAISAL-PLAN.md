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
collecting comparables, is done for him. D moves earlier if the Sheerness reappraisal is booked.

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
4. Phase C: monthly REINZ market figures loaded at the first appraisal of each month, in Tim's signed-in tab.
5. Phase E: the vendor keeps the copy they were sent until Tim taps "Send updated version".
