# Offers and negotiation build plan

Agreed with Tim on 23 November 2026. Tim's readable copy is the doc "Offers and negotiation build plan"
(https://claude.ai/artifact/UeHnyEdA6xhi1fPnyhxtNA). This file is the builder's copy. Build each phase the same way
as `BUILD-PLAN.md`: builder, tests against the mock database, independent reviewer, then push and deploy.

Replaces: the Jotform "Prepare My Offer" form, retyping each offer into the REINZ eForms portal, and Adobe signing.

## Rules that never bend

- Nothing reaches the other side until Tim has viewed it and authorised it. Presentation is never automated.
- The REINZ form is never edited. Text and marks are only ever added on top of the PDF Tim supplies.
- Nothing signed is ever changed. Each signed round is a locked copy with a fingerprint; the next round is built on it.
- Never fill in, script or operate the REINZ eForms portal. Tim produces the blank there himself and drops the PDF
  onto the property. (REINZ is fine with the build, per Tim, 23 November 2026.)
- Vendors never see offers on their dashboard or journey map. The only exception: a separate signing screen for one
  offer, after Tim authorises its presentation.
- Vendors see what is on the agreement, never buyers' contact details or where they live.
- Never store the REINZ form's text in the repository, and never serve a blank to anyone but the parties to that
  property's offers.

## How it works

1. Blank loaded once per listing: Tim drops the REINZ agreement pack PDF on the property. Take its SHA-256, read the
   edition printed on it (now "Eleventh Edition 2022 (4)") and find the places to write by anchoring on the printed
   labels (PURCHASER, Purchase price, Deposit, the six condition lines, FURTHER TERMS OF SALE, signature and initial
   places). Refuse to draft on an edition that has not been checked. The first real pack (a listing in Tim's farm area) is flat (no form
   fields), 40 pages: agreement, appendix clauses 21 and 22, Client and Customer Acknowledgement, OIO statement,
   complaints procedure, deadline sale acknowledgement, title, Vendor Declaration, REA guide.
2. Buyer makes an offer on the property's own form (link and QR, address prefilled), or Tim fills it in for them.
3. Draft: answers are placed on the blank; clauses come from the clause library by rule; a free-text request becomes
   a suggested further term. The AI suggests, Tim ticks.
4. Tim reviews the draft with every filled place highlighted, then releases it to the buyer.
5. Buyer signs, on glass with Tim or by a personal link. Each signer taps every place. A tweak before signing changes
   the answer and redraws the document; signing places follow. Signed copy locked as Round 1.
6. Tim authorises presentation. Vendors accept or counter. A change strikes the old wording visibly, writes the new
   beside it, adds the changer's initials, and lifts the other party's initials at that place from the working copy
   (they stay in every earlier locked round). Vendors sign: Round 2. Repeat as needed, Tim authorising each trip.
7. Fresh copy: closes a messy document, files it as negotiation history, starts a clean one with the current terms.
8. Agreement: when every party has signed and initialled the same version with nothing outstanding, Tim confirms,
   records the date and the time acceptance was communicated, and the final copy is locked.
9. Lawyers' pack: every locked round plus the timeline as one download.

A locked round holds the PDF as signed with its fingerprint, an execution record on a separate page (never on the
REINZ form), and a timeline entry. Each timeline entry carries the fingerprint of the one before it.

## Signing standard

Identify the signer (personal email link plus a texted code; on glass, Tim records he saw them sign and the ID
sighted); consent to sign electronically before the document opens; each signer draws their own signature and
initials and taps every place (no "apply to all"); one signer per link or turn; locked copies protected by the same
triggers as signed agency agreements; execution record with server time, method, device and network details; final
PDF sealed so a reader reports it unchanged. Tim's solicitor confirms the method before first live use.

## Phases

| Phase | Scope | Builder | Done when |
| --- | --- | --- | --- |
| 1. Offer form | "Make an offer" page per property (link, QR), conditions chooser, date help and checks, Offers tile on the property page, Tim notified. Jotform retired after a parallel run. | onboarding-light, reviewed | A test offer lands on the right property with nothing retyped |
| 2. Drafting | Blank loaded per listing, places found, clause library, one-tap draft, Tim's review screen, PDF out | onboarding-core | The first real blank drafts correctly from a test offer |
| 3. Purchaser signing | On glass and by link, automatic signing places, tweak and re-sign, Round 1 locked | onboarding-core | Four purchasers sign a test offer with no field set-up |
| 4. Presentation and counteroffers | Authorise gate, vendor signing screen, change tools, lifted initials, rounds, fresh copy, agreement formed | onboarding-core | A five-round test negotiation with one fresh copy, every round filed |
| 5. Multi-offer and deadline day | Offers board, vendor comparison, prepare-all, multi-offer acknowledgements, closing out unsuccessful offers | onboarding-light, reviewed | Fourteen test offers drafted and ready to sign in minutes |
| 6. After agreement | Working-day dates, condition and deposit reminders, drafted roadmap emails (each with the other side's lawyer's details), lawyers' pack, stage to Under offer | onboarding-light, reviewed | A countersigned test agreement produces both emails and the right dates |

Database changes are additive. Tests never email real buyers or vendors.

## Phase 1 detail: the offer form (Tim, 23 November 2026)

Status: built 23 November 2026 on branch `offers-phase1`, revised after the first review. Migration 018 is written and was
tested in a rollback block on a local PostgreSQL 16 stand-in (a minimal Supabase-like setup), NOT on the live project: the live
run was refused at the confirmation step. Before 018 is applied, the rollback block (`node onboarding/tests/offer-rollback.js`)
must be run on the live project with Tim's approval and come back with no CAPITALS lines. Not yet reviewed again, pushed or
deployed.

Deploy steps (phase 1):

Done 23 November 2026: the rollback block ran on the live project with Tim's approval (every line as expected, no CAPITALS;
a real vendor sees the property but 0 offers, links or events), then 018 was applied as `018_offer_form`.
offer-public deployed the same day pinned to 6e2c7c8, JWT verification off. Header check: a client-sent CF-Connecting-IP is refused
by Cloudflare (error 1000); a client-sent X-Forwarded-For did not decide the recorded network (the same fake value gave two different
hashes, one matching a request without the header). Phase 1 is live; each property's link stays off until Tim turns it on.

1. With Tim's approval, run the rollback block on the live project; then apply 018.
2. Push, then deploy `offer-public` (fn/offer_public.ts) pinned to that commit, with the gateway's JWT verification OFF (buyers have
   no account; every action needs a live link token). doc-prefill is unchanged and keeps JWT verification on.
3. Check the network address can't be faked: send one `info` request to offer-public with a made-up `X-Forwarded-For` header (for
   example `X-Forwarded-For: 192.0.2.123`), then look at the newest `offer_hits` row's `net` and confirm it is the hash of the
   real address (send a second request without the header from the same machine: the two `net` values must match). If they
   differ, the platform passes the caller's header through and netOf must be changed before the form goes live. Then send one
   request with a made-up `CF-Connecting-IP` header (for example `CF-Connecting-IP: 192.0.2.124`) and confirm the recorded `net`
   is still the same as without it. If it changes, the caller can set that header too, and netOf must stop trusting it.
4. Check the notification email reaches Tim, and run the Jotform in parallel for a while.

Unconfirmed, for Tim: when Otago Anniversary Day (the Monday nearest 23 March) is also Easter Monday, the working-day count takes the
Tuesday after as the anniversary day. That is not confirmed; it affects only clash years, the next being 2035.

Fields carried over from the Jotform: contact email and phone; seen the property documents (yes/no, with the link);
sign digitally or meet in person (first-time buyers steered to in person); settlement date; price; conditions;
address of a property to be sold; KiwiSaver; entity name; purchasers (as many as needed: legal first names, last
name, email, phone); comments; lawyer (now separate boxes: firm, person, email, phone). Save for later. A privacy
collection notice. A question whether any purchaser is connected to Tim or the agency.

Conditions chooser (the same list serves the vendor when countering, in phase 4):

- Typical for residential, shown first: builder's report, finance, LIM, lawyer's approval of title, form and content,
  electrical report, specified technical report (the buyer names the kind).
- Other, folded away: toxicology report, OIA consent, Land Act consent, sale of another property, Specified Due
  Diligence. Specified Due Diligence is described as for properties with plant or complex tenancies (commercial,
  lifestyle, farms) and is never suggested to a residential buyer.
- Custom condition: a box at the end with AI help to word it. Marked as a draft; it goes on the agreement only after
  Tim approves it.
- Tapping or hovering a condition opens an overlay with the full wording and a one-line plain summary. Nothing is
  added until ticked. Clause wording comes from Tim (his own clauses) or is summarised in plain words (REINZ's own
  conditions are referred to by clause number, not reproduced).

Deposit: one question, any KiwiSaver yes or no. Yes: the whole deposit to the vendor's lawyer's trust account
(clause 21.3). No: NZ Real Estate Trust. No split.

Date help and checks:

- Each condition takes a number of working days or a date and shows both. Count working days under the agreement's
  own definition (read it from the blank's edition), with the holidays for the property's province.
- The last condition date must fall at least one week before settlement. A buyer whose dates break this changes
  them or flags "I need Tim's help with dates". Tim may override, with a warning shown and his reason recorded.
- KiwiSaver: warn if settlement is less than three weeks after confirmation. The threshold (15 working days) is a
  setting Tim can change.
- KiwiSaver funding a deposit due on the unconditional date: warn that funds may not arrive in time and that late
  deposits attract interest (clause 21.1).

Lawyer's approval (printed clause 22 in the blank): on the form it is unticked by default. When a buyer does not
choose it, the printed clause is struck out at drafting (phase 2). Where the buyer decides on it, the form tells
them plainly that they can talk to a lawyer at any time before going further, as Tim's client and customer care
obligations require (Tim, 23 November 2026).

Added by Tim, 23 November 2026 (built in phase 1):

- GST, tucked away and folded by default. It opens only if the buyer says they are registered for GST for this purchase;
  registration for an unrelated business does not count, and they check with their accountant if unsure. A short note that they
  can always talk to their financial adviser first. Their answer (and GST number, if given) is recorded on the offer.
- Advice prompts, one line each and unpressured: beside the builder's report, electrical and specified technical report
  conditions, and at the conditions step, that they can talk to a builder or a technical professional (engineer, electrician and
  so on) before going further. These sit alongside the lawyer note.
- Chattels review: the buyer sees the chattels included in the sale, adds any extra chattels they want included, and lists any
  expressly excluded (free-text rows), with the note that anything included as a chattel is expected to be in full working order
  at settlement (elements, bulbs and so on). In phase 1 the list comes from a list Tim types on the property (agent only); phase 2
  fills it from the blank. With none held the buyer sees "Tim will confirm the chattels list with you" and can still add and
  exclude items. The list shown is recorded on the offer from the server, not from the page.
- Lawyer details matter more: Tim never puts personal contact details on the REINZ form, only the lawyers' details, to protect
  both parties' privacy. The form asks for the lawyer's firm and person more firmly (still optional, with the reason), tells the
  buyer their own phone and email are used only by Tim and never go on the agreement, and the privacy notice says so. The
  buyer's contact details and the lawyer's details are stored as separate fields, so phase 2 can place only the lawyer's. No
  automatic lawyer lookup in phase 1.

Open questions for Tim before phase 2: the wording of his electrical and technical report clauses and the Specified
Due Diligence clauses as he wants them used (he is sending these).

## Phase 2 detail: drafting (built 23 November 2026, branch `offers-phase2`; revised after the first review; not applied, pushed or deployed)

Status: built and tested locally only (Tim was asleep; nothing live could be approved). Migration 019 passed its rollback block on a
local PostgreSQL 16 stand-in (`tests/pg-standin.sql`, then 010, 016 part A and 018), NOT the live project.

- Blank per listing (Offers tile, agent only): "Agreement blank: load the PDF" (file picker; drag and drop on a computer). The PDF
  is filed unchanged on the property file as kind "REINZ agreement blank" (agency papers, never shareable, never exported, filed
  only from the Offers tile). The server then reads the stored file itself and works out its SHA-256 and size (edge function
  `offer-draft`, `confirm_file`); the blank is registered only if that matches. A new blank keeps the old. Only an edition in the
  checked list (`EDITIONS` in `src/draft-core.js` and `offer_edition_ok()` in 019; now "Eleventh Edition 2022 (4)") can be mapped or
  drafted on; any other gets a plain message and is kept.
- Places (`src/draft-core.js`, pdf.js): found by anchoring on printed labels. Text the portal already filled in is read as
  "printed". Places are saved as versions; the newest approved version is used. The AI (Haiku, through `offer-draft`) proposes
  chattels, places to initial, sign or acknowledge, and notes. Every proposal, chattels included, starts unticked: Tim keeps, moves
  or deletes each, adds his own and approves. Approving sets the chattels buyers see on the offer form.
- Clause library (`offer_terms`): printed clauses by number only; Tim's own wording or a highlighted placeholder that blocks approval.
- Drafting: one tap on the offer. The original pages and content streams are kept byte for byte; text and marks are added on top.
  The draft is filed with its own SHA-256 (confirmed by the server from the stored file), the blank's fingerprint and the map.
- Privacy: a purchaser's or vendor's own phone or email never goes on the agreement, wherever it came from (the offer, Tim's edits,
  further terms, the buyer's own wording, chattels, a lawyer's field, the vendor's lawyer on file). Phones are compared by their
  national digits (+64 21..., 0064 21..., 021..., 21... all match), emails without regard to case, also inside a sentence. A hit is
  left off and blocks approval until Tim changes it.
- Anything that doesn't fit its space (other than the further terms) blocks approval. Further terms that don't fit continue on a
  page added straight after the Further Terms page, and that page says "Continued on the next page".
- Approval: only the newest draft, by its fingerprint, made from the offer exactly as it stands, on the newest approved places of
  the newest usable blank, with nothing blocking. A few blocking items (printed further terms already on the page) are cleared by
  Tim ticking that he has checked them; the ticks are kept with the approval.
- Lawyer lookup: the Anthropic web search tool through `fn/prefill_shared.ts`. A value is kept only if the search returned its page
  and a quote cited from that page contains it; a paused search is carried on a few times. A direct dial or mobile is used before
  the firm's main line. Each value is shown with its source for Tim's tick. Without web search it gives links to look it up by hand.

What Tim's own screen supplies, and is trusted as such: the edition read from the blank, the page sizes, the places, what was placed
on a draft, and which items are "blocking". Only Tim can call these functions, and his screen works them out from the files. The
fingerprints are the exception: the server works those out from the stored files and the database checks them.

Choices made while Tim was asleep (each easy to change):
1. Deposit clauses 21.2 and 21.3 are both left as printed. Each has a "strike it through when it doesn't apply" switch in the clause
   library, off for now. Clause 22.0's switch is on: it is struck through when the buyer doesn't choose lawyer's approval.
2. GST: the GST line on the front page is about the vendor, so Tim fills it in. The buyer's own answer goes only on Schedule 1, 2(a).
3. Condition dates given as working days are counted from the day of the draft. They show as a full date ("8 December 2026"), or as
   the date and the working days if Tim chooses. A date that isn't a working day becomes the working day before, with a note.
4. Settlement: when the offer differs from what the portal printed, every printed line is struck through and the offer's
   settlement is written below, with a note to check.
5. Clause 22.0: when the working days printed differ, the printed number is struck through and the new number is written in the
   margin at the end of that line, with a small caret under the struck word.
6. Chattels the buyer adds are written on Schedule 2; one they leave out is struck through there if it is listed. The library can
   switch this to a numbered further term.
7. Further terms that don't fit continue on an added page after the Further Terms page. When terms are already printed on that
   page, the offer's start below them, numbered on, and Tim ticks that he has checked the page.
8. The typed font is Helvetica. A name with letters it can't show (such as macrons) is not placed and blocks approval.
9. The vendor's lawyer is taken from the property file only when the blank has none, and only from a signed agreement of the
   current owners, with a note to check.
10. "Re-draft after a change" carries over the date format, extra terms and the ticked custom condition, but not Tim's edits to
    single values (so a corrected offer isn't overwritten by an old edit).
11. The PDF tools (pdf.js, pdf-lib) load from a pinned public CDN only when Tim needs them. pdf.js runs on the page, without a
    separate worker.

Questions for Tim:
- His wording for the electrical, specified technical, sale of another property and Specified Due Diligence clauses (placeholders
  until then).
- Should clause 21.2 be struck through when KiwiSaver funds the deposit, and 21.3 when it doesn't?
- Are choices 3 to 7 and 9 right for him?
- The sale of another property condition names the buyer's own address, so the vendors will see it. Is that acceptable to him, or
  should the term describe the property another way?
- Web search needs switching on for the Anthropic account before the lawyer lookup works.
- Are names with macrons common enough to need an embedded font?

Deploy steps (phase 2), after review and with Tim's approval:
1. Run the rollback block on the live project (`node onboarding/tests/offer-draft-rollback.js`): no CAPITALS. Then apply 019.
2. Push, then deploy `offer-draft` (fn/offer_draft.ts) pinned to that commit, with the gateway's JWT verification ON. doc-prefill
   and offer-public are unchanged.
3. For the lawyer lookup, Tim switches on web search for the Anthropic account (Anthropic console). Until then it falls back to links.

Known limits: strike-throughs the portal drew on the blank (Yes/No choices, struck chattels) are lines, not text, so they aren't
read; Tim checks them (the chattels note says so). The layout below printed further terms has only been tested on a synthetic blank.

## Rules for later phases (Tim, 23 November 2026)

Phase 2 (drafting):

- Purchaser and vendor contact details never go on the REINZ form; only the lawyers' details do.
- A lawyer lookup finds each lawyer's contact details from public sources (the firm's own website, the Law Society register). If no
  direct dial or mobile for the named lawyer is found, it uses the firm's reception or main line. It shows Tim each value with its
  source, for his tick, before use (the AI suggests, Tim ticks).
- The date at the top of the agreement is left blank until Tim has reviewed the document and it is fully agreed. Tim then types it
  in full with the month name (for example "23 November 2026").
- The AI reads each blank's form and content, because every pack is different. Examples: acknowledgements, deletions such as on an
  "as is, where is" property, unique title documents, an inserted LIM report, subdivision details for an off-the-plans sale. It
  proposes initialling and signing places, and acknowledgement places, wherever the buyer must acknowledge something or a point
  could be contentious and negotiated. Tim reviews and adjusts the places before release; nothing is placed without his tick.
- The chattels list on the offer form comes from the blank (phase 1 uses the list Tim types on the property).

Phases 3 and 4 (signing and counteroffers):

- Each signer initials every box that has been marked or filled.
- Each signer initials the bottom of every page, outside any box.
- Each appended or inserted further term is initialled by each party.
- Every part of the document can be marked with a finger or stylus.
- Deletion and undeletion (reinstatement). Deletion is a horizontal line through text, or a crossed box drawn across a passage or a
  box. Reinstatement restores struck text, with its own initials. Both are recorded in the trail with who and when.

Phase 4 (presentation):

- When presenting, the vendor is reminded that anything provided as a chattel must be in full working order at settlement.
