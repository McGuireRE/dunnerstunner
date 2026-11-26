# Offers and negotiation build plan

Agreed with Tim on 23 November 2026. Tim's readable copy is the doc "Offers and negotiation build plan"
(https://claude.ai/artifact/UeHnyEdA6xhi1fPnyhxtNA). This file is the builder's copy. Build each phase the same way
as `BUILD-PLAN.md`: builder, tests against the mock database, independent reviewer, then push and deploy.

## Live status (26 November 2026)

- Live: phases 1 (offer form), 2 (drafting onto the REINZ blank), 3 (signing) and 4 (counteroffers). Database 001 to 024.
  Phases 3 and 4 went live 25 November about 12:55 (main 121c783; offer-sign v1, offer-public v3).
- Live: Offers fixes 1 (AI wording, no-blank warning), 25 November about 15:25 (main 06c2d22; offer-draft v3, offer-public v4,
  doc-prefill v5, all pinned to 06c2d22). Checked: the clause writer drafted a condition on the live site.
- Live: Offers fixes 2, hotfix 2 and migration 025 (25 and 26 November; offer-sign v5 at 92ebdd3).
- Live: Offers fixes 3 (undo and start again in every turn, Tim's "Start this round again", "Unfreeze and go back", Confirm held
  while frozen), 26 November about 10:55 NZT. Migration 026 applied (its live rollback test ran clean first); main 11e46da, pages
  published from 4df62e2 (an empty commit: the first push didn't start a Pages build); offer-sign v6 pinned to 11e46da, OPTIONS 200.
- Live: Offers hotfix 3 (re-draft with nothing changed stays on the same draft; drafting messages under the button pressed),
  26 November about 12:35 NZT, main ad6548c; page only, no database or function change.
- Edge functions and the commit each is pinned to: offer-sign 11e46da; offer-public, offer-draft, doc-prefill 06c2d22.
- Still to do: the test offer with Tim's own addresses (OFFERS-PLAN "Going live" step 5), then Tim's solicitor confirms the
  signing and counteroffer method before the first real offer. Phases 5 and 6 not built.
- Older "Status:" lines in the phase sections below are kept as the build history; this section is the current state.

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
Due Diligence clauses as he wants them used (he is sending these). Answered 24 November 2026: Tim's own clause wording will come from
his OneDrive folder McGuire > Forms > Clauses. The most recent version of each may be the right one, but the folder is disorganised, so
each needs his tick before it goes in the clause library.

## Phase 2 detail: drafting (LIVE 24 November 2026: 019 applied after the live rollback passed; main 181c875; offer-draft deployed, JWT on)

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
  until then). Answered 24 November 2026: it will come from his OneDrive folder McGuire > Forms > Clauses; the most recent version of
  each may be the right one, but the folder is disorganised, so Tim ticks each before use.
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

## Phase 3 detail: purchaser signing (built 24 November 2026, branch `offers-phase3`, on top of `offers-phase2`; not applied, pushed or deployed)

Status: built and tested locally only (Tim was asleep). Migration 023 (built as 020) passed its rollback block on a local PostgreSQL 16 stand-in
(`tests/pg-standin.sql`, then 010, 016 part A, 018 and 019), NOT the live project. Phases 2 and 3 go live together, in order (019, then 020). Now: 023 (see "Going live" below).

How it works:
- "Ready to sign" on an approved draft (the newest, the offer unchanged since). The places are made by `src/sign-core.js` from the draft
  and its map, with no set-up: each purchaser initials the foot of every page, every box the draft filled or marked (a struck line and
  the words beside it count as one change; each struck chattel is its own; a condition's Yes/No and its date are one row), and each
  further term (the draft now leaves a blank line after each term for this); signs in the signature block (a purchaser beyond the
  printed lines gets a signature and name place beneath the others, only if that space is clear of printed words); and does each
  acknowledgement, initial or signature place Tim kept on the map. The date at the top is never a place.
- Where initials go (after the first review): never over another place and never over printed words. First on the box's own row
  (in the blank part of the place, such as after a price or a date, then either side), then above or below, always within about
  40 points of the box, at full size first and then smaller (20 by 10, then 16 by 8 points), as a row, two rows or a column. Anything
  that can't be placed that way is listed on the Ready to sign screen with a short reason, and release waits. On the real 40-page
  pack: no place over printed words for one or three purchasers (0 overlaps), each condition row's initials on its own row; four
  purchasers are refused because the pack prints a footnote beneath the third signature line ("No room on the signature page for
  every purchaser. Add a signature page in the portal, then load the blank again."). The Client and Customer Acknowledgement is found by its heading; Tim can change its page numbers. He picks in person or by
  link (defaulting to what the buyer asked on the form). Nothing is sent: by link, he taps Send next.
- Each signer: agrees to sign electronically; receipts the Client and Customer Acknowledgement (its pages shown) and the REA sale and
  purchase guide (the same guide viewer and receipt as the agency agreement); draws a signature and initials once on a white pad; taps
  every place (a count, no "apply to all", Finish only when every place is done). Each tap is recorded with server time.
- In person: Tim's device, one purchaser at a time. Tim ticks that he saw them sign and picks the photo ID type (never a number), or
  "Known to Tim personally" (recorded as that on the execution record).
  Marks on Tim's screen only: a freehand note, a line through text, a crossed-out box, a reinstatement (of a line or box). They are an
  overlay; the draft is never altered. Any mark holds signing; Tim checks it and re-approves; every purchaser then initials beside
  it (anyone who had finished does those initials and finishes again).
- By link: each purchaser's own link by email (a 43-character token, kept only as a fingerprint, 14 days), then a 6-digit code by
  email as its own message (15 minutes, 5 tries, 5 codes an hour, held under simultaneous requests by locking the signer's record;
  and per network, 20 codes and 30 tries an hour), then a 2-hour session. They see only their own places, and the draft by a
  10-minute link only once they agree to sign electronically. They can't mark the page; "Ask Tim for a change" emails Tim. Send again
  makes new links. Once a purchaser has finished, or the signing is no longer open, their link sends no code, checks no code and
  opens nothing further, and their recorded device and network are never overwritten; once everyone has signed, no signer record
  changes at all.
- Changing how they sign: while nobody has started (agreed to sign or tapped a place), Tim can change in person to by link or back.
  The release is stopped ("cancelled", recorded, any links sent stop working) and the same draft is released again the other way.
  Once anyone has started, the screen says who and why it can't change (correct the offer and re-draft instead).
- Tweak and re-sign: Tim corrects the offer (phase 1). Signing the old version stops at once. He re-drafts, approves and taps Ready
  to sign: the old signing is "replaced", its signatures and taps kept but void, the old links dead. Everyone signs the new one.
- Locking: when the last purchaser finishes, the offer-sign edge function makes Round 1 (the draft checked against its fingerprint;
  signatures, initials and marks added on top; the execution record on pages at the end), stores it, takes its fingerprint from the
  stored file, and locks it (`offer_round_lock`). A file already at that place must be exactly the one just made, or nothing is
  locked. In person, Tim's screen asks the function to lock straight after. Tim is emailed. If locking fails at that moment, the last
  purchaser is told Tim will lock it, and Tim's screen locks it when he opens the signing.
- The execution record: per signer the name, the method, "email verified with a one-time code" and when (never the address) or "Tim
  saw them sign" and the ID type, consent time, guide receipts, first and last tap and finish (server time), the device, the network
  as a fingerprint, and the SHA-256 of what they saw; the marks; any replaced draft. No phone or email of anyone.
- Timeline: every offer event (all phases, from 023 on) carries the fingerprint of the one before it in its chain; "Check the
  timeline" on Round 1 checks it, and Round 1 records the newest fingerprint.

Edge function: `offer-sign` (new, fn/offer_sign.ts and fn/offer_sign_handler.ts), JWT verification OFF (buyers have no account; every
buyer action needs their token, then their session; Tim's send and lock check is_agent with his own token). Its CORS answers only
https://packages.dunnerstunner.co.nz (shared.ts `corsApp`); offer-public now uses the same (only the onboarding pages call either), so
offer-public needs redeploying too. offer-draft and doc-prefill are unchanged. The function imports `onboarding/src/sign-core.js` (a
plain script that sets globalThis.SIGN) by its relative path: checked locally with Deno 2.9.6, served over HTTP as text/plain as raw
GitHub serves it, including making a Round 1 PDF with npm:pdf-lib; `deno check` passes on fn/offer_sign.ts and fn/offer_public.ts.

Choices made while Tim was asleep (each easy to change):
1. One method per release: all in person or all by link. Mixing would be a later step. Tim can change it until someone starts.
2. The names typed by the draft under the signatures are part of the signature block, so they aren't initialled separately.
3. Further terms now have a blank line after each (for the initials); a condition's Yes/No and its date share one set of initials. It changes phase 2's layout slightly (terms continue onto an
   added page a little sooner); not yet live.
4. Four or more purchasers no longer block drafting: signing adds places beneath the printed lines when that space is clear of
   printed words; otherwise release is refused and Tim adds a signature page in the portal. On the real pack it is refused for four.
5. Every page of the pack, guides included, has foot initials, per Tim's rule. On the real 40-page pack that is 57 places each.
6. Each mark is initialled by every purchaser, reinstatements too, and holds signing until Tim re-approves.
7. Codes by email only (there is no text provider in the repository). Each code email is a separate message from the link.
8. Round 1 goes to Tim by email notice only. Purchasers aren't sent a copy yet.
11. "Known to Tim personally" is allowed instead of a photo ID type, as common practice.
12. The per-network code limits share offer_hits with the offer form: its kind check is widened to add 'sign_code' and 'sign_try'
    (nothing removed). This is the one change to an existing table's rule in 023.
9. Round 1 is stored with the offer (offer_rounds, property-files), not as an item on the property file's documents list.
10. Sealing: not done. See questions.

Questions for Tim:
- (Answered 24 November 2026) Text messages for the code: no. Codes go by email only for now, because some people, older ones
  especially, don't use mobiles. If ever wanted, a provider plugs in at `offer_sign_code` / the send_code action.
- Sealing the final PDF so a reader reports it unchanged needs a signing certificate (a document-signing certificate from a
  provider, or one McGuire Real Estate makes itself, which readers show as "unknown signer"). No pure-JS signing library is in the
  repository to test with here. Which do you want? Until then, the server-confirmed SHA-256 and the hash chain are the proof.
- Should each purchaser get a copy of Round 1 by email once it locks?
- Are foot initials wanted on every page of the pack (guides, title, LIM inserts), or only the agreement's own pages?
- Choices 2, 3, 6 and 8 above: right for you?
- (Answered 24 November 2026) Tim's solicitor will confirm the method before first live use (as the signing standard says).

Deploy steps (phase 3), after review and with Tim's approval, after phase 2's:
1. Run the rollback block on the live project (`node onboarding/tests/offer-sign-rollback.js`): no CAPITALS. Then apply 023.
   (The race test, `onboarding/tests/offer-sign-race.js`, is for a local stand-in only: it makes and drops a scratch database.)
2. Push, then deploy `offer-sign` (fn/offer_sign.ts) pinned to that commit, with the gateway's JWT verification OFF. Redeploy
   `offer-public` pinned to the same commit (JWT off, as now) for the narrower CORS.
3. Sign a test offer with four test purchasers (in person) and one by link to Tim's own second address.

Known limits: text that is drawn as lines or shapes (box borders, the portal's strike-throughs) isn't "printed words" to the check, so
initials may touch a box border. Pages of the real pack were checked by eye at pages 1 and 20 only. Marking and the place taps were tested with a mouse on a phone-sized screen,
not on a real phone or stylus.

## Phase 4 detail: presentation and counteroffers (built 24 November 2026, branch `offers-phase4`, on top of `offers-phase3`; not applied, pushed or deployed)

Status: built and tested locally only (Tim was asleep). Migration 024 (built as 021) passed its rollback block on a local PostgreSQL 16 stand-in
(`tests/pg-standin.sql`, then 010, 016 part A, 018, 019 and 020), NOT the live project. Phases 2, 3 and 4 go live together, in order
(019, 020, then 021). Now: 023 then 024 (see "Going live" below).

How it works (Tim's words, 24 November 2026: "I present the offer to the seller (never automated - I view each step and authorise
presentation), they make tweaks ... each time a change is made, I delete the other party's initials or signature at that location ...
The foundational REINZ document is never edited, text or marks are only ever added."):
- Documents and rounds: Round 1 (the purchasers signing, phase 3) opens Document 1. Each later round answers the one before. A round's
  overall number keeps counting for the offer (so it stays unique); the screens say "Document 2, Round 1".
- Present: once a round is locked, the offer page says nothing has gone to the other side and shows "Present to the vendors" (or "Present
  back to the purchasers"). Tim's present screen shows the working copy of the newest round (page by page, with what was lifted), who
  signs and how many places each has, and the method (in person on his device, or a personal link to each). He ticks that he has looked
  at it, then taps Present. Nothing is sent: by link he taps Send next, as in phase 3. Every trip needs his tap.
- The vendors: taken from the property's owners (legal names; their own emails for the link and code only, never printed). Identity as
  phase 3: a personal link and an emailed code, or in person with Tim recording he saw them sign and the ID type. Before they sign they
  read the reminder that every chattel must be in full working order at settlement (elements, bulbs and so on), with the chattels in this
  offer listed, and tick it (receipted with the time); every step tells them they can talk to their lawyer at any time. They see the
  purchasers' names and their lawyer, as on the agreement, never the purchasers' own phone, email or address. Their dashboard and journey
  map are untouched: the only door is the link, or Tim's device, for that one offer.
- Accept or counter, on the same signing screens as Round 1: the working copy is the approved draft with every round's ink on top.
  To accept, they initial and sign each place. To counter, they change the document first with the tools: line through text, cross out
  a passage, type words, write by hand, reinstate (an earlier line or crossed-out passage, from any round of the document). Each change
  is saved with everyone on that side's initials beside it (one place each, made by the core and checked by the database). Anyone on that
  side who had finished initials the new change and finishes again. Typed words are checked for any purchaser's or vendor's own phone or
  email (phase 2's rule, done in the database, so a link can't get round it).
- Lifting: where a change is made, the OTHER side's initials or signature at that place are lifted from the working copy (the ink touches
  the change, or belongs to the box the change is in, such as the price's whole line, or sits on the change's own line within 60 points).
  Every earlier locked round still shows them; nothing locked is ever changed. The round's record lists what was lifted.
- What each side does in a round: a side's first round (the vendors' Round 2) initials the foot of every page and every filled box and
  signs at its own signature block, as the purchasers did in Round 1. Every later round: initial each change not yet initialled by
  them (the other side's changes, and their own if the other side's later change lifted their initials there; a Round 1 mark the
  purchasers initialled on Tim's screen counts). Their earlier signature stands; a signer signs again only where a change lifted their
  signature. Tim's setting `resign_every_round` (off by default; `agent_offer_negotiation_setting`) makes everyone sign every round
  instead (the newer signature replaces the older on the working copy). The signers of a side's later round are the same people as its
  newest locked round, in the same order; if the owners on the property have changed since, presenting is refused and a fresh copy is
  needed. The purchasers don't receipt the guides again.
- Locking: when the last signer finishes, the offer-sign edge function makes the round from the draft and every round's layers (the
  negotiation core, `src/nego-core.js`), with the round's record on pages of its own at the end (who signed, how, ID type or code check,
  times, device, network fingerprint, each change with who and when, what was lifted, how much is still outstanding, the fingerprint of the
  round it answers), stores it, fingerprints it from the stored file and locks it. Tim is emailed that nothing has gone back yet.
- Agreement formed: when the newest round changed nothing and nothing is outstanding (every change initialled by every party, everyone's
  signature there), the offer page says so. Tim records when acceptance was communicated and types the date in full with the month name
  ("24 November 2026"; today, in New Zealand, is filled in for him). He ticks that he has looked, and confirms. The edge function makes the
  agreed copy (the same layers, the date as an overlay in the DATE place: the only time the date is added; a record page at the end
  listing every round's fingerprint), stores, fingerprints and locks it. The document is "agreed" and the offer "accepted". Tim's screen
  then moves the property to Under offer with the existing stage function (agent_set_stage). Other offers are left for Tim.
- Fresh copy: "Start a fresh copy" on the offer page, with a reason. The document is closed and filed as history (every round kept and
  listed on the offer page); anything out for signing on it stops. Tim corrects the offer to the terms as they stand (phase 1), re-drafts
  and approves (phase 2), and the purchasers sign Round 1 of the new document (phase 3). A closed document's draft can't be released again.
- Lawyers' pack: one button on the offer page. One zip holding every locked round of every document, the agreed copy if there is one,
  and Timeline.html: every event in order, each with its fingerprint and the one before it, checked, in plain words, with no contact
  details. Each file inside is the locked copy byte for byte (checked against its fingerprint first). Agent only.
- Withdrawal: "A side has withdrawn" on the offer page: the purchasers withdraw their offer (status "withdrawn") or the vendors decline it
  or withdraw their counteroffer (status "declined"), with the time and a note; the side is recorded. Every signing in progress stops with
  its own status "withdrawn" (distinct from Tim cancelling), links included, and the open document is closed as history. Phase 1's own
  "Withdrawn" or "Lapsed" does the same. Marking the offer current again doesn't re-open anything: presenting needs a fresh copy (correct,
  re-draft, Round 1 of a new document). None of this is possible once the agreement is made.

Migration 024 (`024_offer_negotiation.sql`, built as 021), additive: offer_documents; offer_agreements; columns on offer_signings (round_no, side,
document_id, base_round_id), offer_signers (person_id) and offer_rounds (document_id, doc_round, side, base_round_id, changes, lifted,
outstanding); kind 'insert' on offer_sign_marks and guide 'chattels' on offer_sign_receipts (check constraints widened, nothing removed);
the one-live-signing-per-draft index becomes per draft and round. It replaces some 023 functions with the same names and arguments,
keeping Round 1 as it was: offer_sign_places_ok (adds 'change'), offer_sign_current (adds: document open, no agreement), the receipt and
tap steps (the chattels reminder; no guides in later rounds), agent_signing_release (a fresh copy), agent_signing_mark (Round 1 only),
offer_sign_issue/open/state (side, round, layers, parties), offer_round_material and offer_round_lock (any round), and 018's
agent_offer_status (stops signings). New: agent_round_present, agent_round_change, agent_offer_layers, agent_document_close,
agent_negotiation_withdraw (Tim); offer_sign_change, offer_agreement_material, offer_agreement_lock (service role). Everything locked is
immutable with no TRUNCATE; a document changes only from open, through the functions. Row locks: the offer, then its document, then
the signing (presenting, closing, locking and agreeing all take them in that order; a change and a finish both lock the signing first).
Race test: `tests/offer-negotiation-race.js` (local stand-in only).

Edge function: `offer-sign` is extended (fn/offer_sign.ts, fn/offer_sign_handler.ts), JWT verification still OFF (vendors and buyers
have no account; every action by them needs their token, then their session; Tim's send, lock and the new "agree" check is_agent with
his own token). New actions: change (from a link) and agree (Tim). CORS stays `corsApp`. It now also imports `onboarding/src/nego-core.js`
by its relative path (`deno check` passes).

Checked on the real 40-page pack locally (nothing copied): the vendors' places for their first round, beside one, two or three
purchasers' Round 1: 54 each, none over printed words or over a purchaser's place, nothing blocking.

Review fixes (24 November 2026, after the first review):
1. A purchaser's Round 1 initials beside a mark Tim re-approved (phase 3, `why: 'mark'`) count as their initials for that change, in
   "nothing outstanding" and in what the next round asks for. (nego-core.test.js: a Round 1 mark, the vendors accept, the agreement forms.)
2. The privacy check on typed words (database `offer_private_hit`, and phase 2's `DRAFT.holdsOwn`) also covers the vendors on the
   property's agency agreements (`agreement_people`), makes every kind of space a plain space, full-width digits ordinary ones, takes / and
   _ between digits, and spaces around an @. On Tim's own screen, where the parties' details are loaded, the browser applies the same check straight away (only the
   parties' own phones and emails; dates and prices such as "20/12/2026", "2027-03-01" or "$1 250 000" are fine). A link signer's screen
   never has those details, so it doesn't pre-check; the database refuses and its message is shown plainly. (After the second review.) (Rollback block; draft-core.test.js; offers-nego.test.js.)
3. A change that reopens someone who had finished emails them (by link; their link still works) and Tim. In person, they are with Tim.
   (offer-nego-fn.test.js.)
4. The agreement date is from the New Zealand day acceptance was communicated to today, and is filled in with that day. (Rollback block;
   offers-nego.test.js.)
5. A side's later round signs with the same people as its newest locked round, in order; changed owners on the property refuse it,
   with a message to start a fresh copy; reordered owners don't matter. (Rollback block.)
6. Integrity of the agreed copy: pdf-lib can't write an incremental update reliably, so the fallback was taken. Every round from Round 2
   on keeps its title and drawing version (`nego-draw-1`) in its execution record; the agreed copy's record page and `offer_agreements`
   (`round_sha256`, `draw_version`) name the round it was drawn from, and the database refuses an agreed copy whose record names any other
   round. Tests show the drawing is deterministic: Round 2 drawn again from its stored layers and record reproduces its fingerprint
   exactly (nego-core.test.js and offer-nego-fn.test.js).
7. Once agreed, `agent_offer_correct` (018, 3-argument version replaced in 024, otherwise unchanged; main's 4-argument version from 021 calls it) refuses. `offer_agreements.terms` holds the agreed terms
   for later phases: price, settlement, conditions, the KiwiSaver answer as given, the drafted values (price, deposit,
   settlement, each condition and its date), the deposit as printed, the further terms, and every change in order. (Rollback block;
   offers-nego.test.js.)
8. Typed words are measured with Helvetica's own widths (the font they are drawn in). (nego-core.test.js.)
9. The database insists that the initials for a change are on its page, within about 60 points of it, both with the change and when
   presenting. (Rollback block.)
10. A change over the blank's date place is refused. (Rollback block.)
11. No date place on the blank: no agreement (no fallback position). (Rollback block; nego-core.test.js; offer-nego-fn.test.js.)
12. The agreed copy's record says the date and the record page are the only things added; withdrawal has its own status; the lawyers'
    timeline shows "Tim McGuire" for his sign-in; changes from a link are limited to 60 an hour per network (`offer_hits` kind
    'sign_change', widened) and 30 an hour per signer; `offer_sign_reviews` keeps `reviewed_by` for Tim's re-approvals only, with `kind`
    and `changed_by` for changes.

Tim's answers (24 November 2026, the morning after the build):
- Changes from a link: allowed, under Tim's control. Some vendors want to make changes themselves after a private discussion. Each round
  he presents has a switch, "Let them make changes from their link" (`offer_signings.link_changes`, recorded on the timeline and on the
  round's execution record as "Changes from link: allowed" or "not allowed"). Its starting position is his setting
  `offer_settings.link_changes_default` (off by default since 24 November 2026; `agent_offer_link_changes_default`). It applies to the purchasers too when a
  round goes back to them. Switched off, the link shows only accept (initial and sign), decline (a note to Tim) and "Ask Tim for a
  change", and the database refuses a change from the link, said plainly. On Tim's own device changes can always be made. Both negotiation
  settings (this one and signing again every round) are toggles under "Link and settings" on the property's Offers tile.
  (Rollback block; offers-nego.test.js; offer-nego-fn.test.js.)
- Signing codes go by email only for now, because some people, older ones especially, don't use mobiles. No SMS provider.
- Tim's solicitor will confirm the signing method before first live use.

Decisions from the coordinator: presenting defaults to in person; the vendors declining is "declined"; signing again only where lifted,
with the setting for every round; an offer marked current again after a withdrawal needs a fresh copy.

Choices made while Tim was asleep (each easy to change):
1. (Decided) A side signs again only where its signature was lifted; Tim's setting can make it every round.
2. Lifting reaches the box a change is in and 60 points either side on its line. A change elsewhere lifts nothing.
3. The vendors' first round initials the foot of every page and every filled box, as the purchasers did (Tim's rule "each signer").
   That is 54 places each on the real pack.
4. Vendors are the property's owners on its file (role owner), in their order there, by legal name.
5. (Answered by Tim) Changes from a link are allowed for a round when Tim switches it on (off by default since 24 November 2026); Tim still looks at every round
   before it goes anywhere.
6. A change can't be undone once saved (it is a record); strike it or reinstate it instead, as on paper.
7. (Decided) Present defaults to in person; Tim can choose a link.
8. (Decided) The purchasers withdrawing is "withdrawn"; the vendors declining or withdrawing their counteroffer is "declined".
9. The agreed copy carries the date and a record page; it isn't emailed to anyone yet (phase 6's roadmap emails).
10. The lawyers' pack is a zip of the original files rather than one merged PDF, so each round inside is exactly the locked copy.
11. A round's PDF holds only its own record; earlier rounds' records are in their own files (and listed by fingerprint).

Questions for Tim:
- Signing again: by default a side signs again only where a change lifted its signature, otherwise its first signature stands and it
  initials the changes. Is that right, or should everyone sign every round (the setting)?
- Choice 3: do the vendors initial every page foot and every filled box in their first round, or only sign and initial the changes?
- Is 60 points along the line the right reach for lifting the other side's initials (choice 2)?
- Should both sides get a copy of each locked round, and of the agreed copy, by email (and to the lawyers)?
- (Answered) Your solicitor confirms the method (phases 3 and 4) before first live use: Tim says he will.

Deploy steps (phase 4), after review and with Tim's approval, after phases 2 and 3:
1. Run the rollback block on the live project (`node onboarding/tests/offer-negotiation-rollback.js`): no CAPITALS. Then apply 024.
   (The race test is for a local stand-in only.)
2. Push, then deploy `offer-sign` pinned to that commit, JWT verification OFF.
3. A test negotiation with Tim's own addresses as vendor and purchaser: Round 1, a counter, an acceptance, the agreed copy, the pack.

Known limits: the agreed copy is drawn again from Round N's layers rather than appended to Round N's file; determinism is tested, but a
future pdf-lib upgrade must keep the drawing version's output byte for byte (or the version string changes). Lifting and initials are placed by shape, so a change drawn across a whole page lifts everything of the other side's on
it (as on paper). The working copy on screen draws ink as an overlay of images, so very small screens show initials small. Tested with a
mouse on a phone-sized screen, not a real phone or stylus. The agreed copy isn't sealed (see phase 3's question).

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

## Condition timing, further terms numbering and the review screen (Tim, 24 November 2026; LIVE 24 November 2026, main dae98d6, migration 021)

Built locally on `offers-timing` from main. Migration 021 is written and passed its rollback block on the local PostgreSQL 16 stand-in
(`tests/pg-standin.sql`, then 010, 016 part A, 018, 019; `node onboarding/tests/offer-timing-rollback.js`), NOT the live project.

- Timing for every condition: `{key, days}` and `{key, date}` (unchanged, live data reads as before) and new `{key, after, days}`: within
  N working days of the date another condition on the offer is satisfied or waived. Loops, a condition not on the offer, waiting for
  itself, and chains of more than three steps are refused (offers-core `chainProblem`, and `offer_clean` in 021). For the checks an
  "after" date is the other condition's date (worst case) plus N working days by its own rule (the LIM rule runs to 15 January); it
  feeds the last condition date, the one-week gap, the KiwiSaver warning, and shows as "at the latest".
- "Confirm all conditions on the same day" on the form (two or more conditions, off by default, not forced) and on the review screen
  (a recorded correction to the offer, then a re-draft). Kept on the offer as `line_up: true`.
- Drafting: `{timing}` ("within 10 working days of the date of this agreement", "on or before Friday 5 December 2026", "within 5 working
  days of the date the finance condition in clause 9.1 is satisfied or waived"); `{date}` for "after" gives the timing phrase and a
  check. Printed front-page lines: the short phrase if it fits, otherwise "see further term N" plus a further term setting out that
  date. Clause 22.0 "after": the printed count struck, "see further term N" beside it, the time in a further term. Wording with a
  token no longer has "Condition date: ..." added after it (before, Tim's live wording printed the date twice).
- The AI condition helper writes `{timing}`; the form says what it stands for.
- Further terms numbering: on from the last general terms clause and the highest clause printed on the appendix, both read from the
  blank (buildMap `numbering`), so 23.0 on Tim's packs. Written 23.0, 24.0 and so on, like the printed 22.0 (Tim, 24 November 2026):
  in the list, in references ("further term 23.0"), on front-page lines ("see further term 24.0") and in the starting-number note.
  When the further terms page already prints its own terms as "1.", "2.", ours continue in that style ("23.", named "further term 23").
- The further terms that set out a printed condition's date (front-page "see further term N", and clause 22.0) are tied to that
  condition and written with {timing} ("The time for the purchaser's lawyer's approval under clause 22.0 is {timing}."), so their
  timing chip corrects the offer like any other. Before any correction from the review screen the offer is read again; if it has
  changed since the screen opened, nothing is saved and Tim is asked to reopen the newest draft. The database checks this too, under
  the row lock (`agent_offer_correct(offer, details, note, expected)`, 021). If the correction saved but the new draft failed, Tim is
  told the offer was corrected and gets "Re-draft now".
- The date terms use the date form of the timing (`{timing_date}`): "The finance date is the date that is 5 working days after the
  date the building report condition in clause 9.4 is satisfied or waived" ("... after the date of this agreement"; "... is Friday 5
  December 2026").
- Blocking, tickable checks: a condition-tied term whose wording Tim edited so it no longer holds its {timing} ("Further term 23.0 no
  longer follows the offer's timing for ..."), and a typed-over front-page date or clause 22.0 count that differs from what the
  offer works out (both values named, compared once "see further term N" is resolved). Both are checked on every draft while the
  edit stands. Tim's own wording for the buyer's condition (custom_wording) counts too: without the buyer's {timing} or {date} it
  raises the same check, and no "Condition date" is added after his words. Once a correction has saved, its Done button stays off
  if the re-draft fails; only "Re-draft now" is offered. Phase 2 drafts (no number_style) show
  "1." style on the review screen, as their PDF does. A removed term's number is retired (`edits.retired_numbers`) and never reused;
  `term_last` on each plan is where the sequence is up to (phase 4 continues from it).
- Overflow: pages added straight after the further terms page, made from pictures of that page's own header and footer bands (PNG,
  rendered from the blank: pdf.js at scale 4 on Tim's screen, pdftoppm at 300 dpi in the tests; the page itself is never embedded, so
  none of its text or clauses is carried over), "(continued)" after the Appendix heading, the printed page number struck and the
  right one beside it (22 to 23, 24; "22 of 22" to "23 of 24", "24 of 24"). Each added page is a `kind: 'page'` item in placed with
  its source page and bands; a blocking, tickable check for Tim, and another when a later page of the agreement already prints a
  bare number the added pages now take. No bands, or no picture: the plain page, with its own blocking check. Every draft also says
  where the further terms start ("Further terms start at 23 (general terms to 20, appendix to 22)").
  Known limit: the bands are pictures, so their words (the heading, the edition line, the footer) can't be selected or searched on
  an added page; the struck page number is part of the picture, the new one is text.
- Review screen: clauses from the library (`edits.added_terms`), reorder (grip drag with pointer events, and Up and Down buttons;
  `edits.term_order`), remove a term Tim added, timing and date chips in each term's text. A timing chip in a term tied to one of the
  offer's conditions changes that condition on the offer (Tim, 24 November 2026): a recorded correction (agent_offer_correct, the
  buyer's original kept, loops refused), then a new draft, so the date checks (shown on the review screen, with the gap and KiwiSaver
  warnings) follow and older drafts can't be approved. "After another condition" is offered (never itself). A chip in a term tied to no
  condition, and a date or working-day count written in the wording, stay draft-only edits (`edits.term_timing`, `edits.items`), "Ask AI to write a clause" (offer-draft `write_clause`, Sonnet, daily cap with a reserved
  ai_calls row per call, `offer_agent_ai_claim` then `offer_agent_ai_done`; Tim edits
  and ticks; "Use in this offer only" or "Save to my clause library"), also in the clause library. Library terms can be "Only when I
  add it to a draft" (rule `{}`).
- Marks: Tim draws boxes on any page of the blank (initials or signature for the purchasers, the vendors or both; strike-out, a
  crossed box when taller than a line; text; highlight), moves and resizes them with 8 handles (finger-sized on touch), zoom control,
  kept inside the page, minimum 10 by 8 points. Filled places can be moved or resized the same way (`edits.moves`, from and to boxes;
  the map is unchanged). Checked on the server (`offer_draft_edits_ok` in agent_draft_add, 021).

For phases 3 and 4 (not changed here):
- sign-core (offers-phase3) `makePlaces` should turn placed items `kind: 'mark'` with `mark: 'initials' | 'signature'` and `who`
  (purchasers, vendors, both) into signing places for that side, at the item's box; strike, cross and highlight marks and moved items
  are "filled boxes" each signer initials. Placed items `kind: 'page'` (added continuation pages) need the footer initials like any page.
- phase 3/4 draft-core changes (`term_texts`, `placedFrom`) need merging with this branch's renderDraft continuation code.
- nego-core and 021: counteroffer changes are marks on the PDF, not changes to `details.conditions`, so "after" needs no change there.
  A change to a condition's date written by a party is free text; a condition that waits for another reads its timing phrase. A new
  further term added in a counteroffer must take its number from the newest draft's `term_last` (and never a retired number).
  `agent_offer_correct` in the negotiation migration (built as 021 on offers-phase4) calls `offer_clean`, so it takes `after` now that the timing migration is applied (it must not reapply the 018 version).

Deploy steps, with Tim's approval: run the rollback block on the live project (no CAPITALS), apply 021; push; deploy `offer-draft`
(write_clause) and `offer-public` (helper prompt) pinned to that commit. 021 must be applied before the page goes live, or `after` is
dropped by the live `offer_clean` without a word.

Before relying on the cap, confirm signed-in users can't write ai_calls on the live project (read only; every row should say false):

```sql
select r.rolname, p.priv, has_table_privilege(r.rolname, 'public.ai_calls', p.priv) as allowed
from (values ('anon'), ('authenticated')) r(rolname), (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv) order by 1, 2;
```

### Migration numbers (24 November 2026)
Numbers are taken when a migration is applied, not when it is built, because the portal chat also adds migrations (020 is its
`020_remove_spare_agent_login`). The timing work was built as 022 and applied as `021_offer_condition_timing`; the table privileges
tidy-up is `022_tighten_table_privileges`. The signing (offers-phase3, built as 020) and negotiation (offers-phase4, built as 021)
migrations take the next free numbers when they go live.

## Going live: phases 3 and 4 brought up to date with main (branch `offers-live`, 24 November 2026; not applied, pushed or deployed)

Tim made this the next priority on 24 November 2026. `offers-live` is main with `origin/offers-phase4` (which holds offers-phase3)
merged in, then fitted to the timing work and to portal phase 1. Both phases were independently reviewed READY on their own; this
merge needs its own review.

- Migrations renumbered: `023_offer_signing.sql` (built as 020) and `024_offer_negotiation.sql` (built as 021). Neither number is taken
  live (checked read only). 024 needs 023. Overlap with main: neither touches `offer_clean`, `agent_draft_add`, `offer_draft_edits_ok`
  or the AI cap functions. 024 replaces only the 3-argument `agent_offer_correct` (018's, word for word as live, plus "refused once the
  agreement is made"); main's 4-argument version (021, the "expected details" check) is untouched and calls it, so "after another
  condition" still works. `offer_hits_kind_check` is widened from exactly the live list. New tables follow 022: anon gets nothing,
  signed-in users read only (TRUNCATE, TRIGGER and REFERENCES revoked), as the live default privileges also give.
- 024 also gives a link signer the newest draft's further terms numbering (`offer_sign_state` -> signing.terms: term_last, retired
  numbers, style), so "A new further term" in a counteroffer takes the next number (23.0 style, never a retired one).
- Kept from the timing work: further terms numbered 23.0 with retired numbers never reused; continuation pages drawn from pictures
  of the header and footer bands; Tim's drawn initials and signature boxes are signing places for their side (purchasers, vendors or
  both); strike, text and highlight boxes and moved places are filled boxes every signer initials; added pages get foot initials;
  timing chips correct the offer through `agent_offer_correct(offer, details, note, expected)`.
- Edge functions: `offer-sign` and `offer-public` answer browsers on packages.dunnerstunner.co.nz and portal.dunnerstunner.co.nz
  (`fn/cors_app.ts`), because Tim's send, lock and agree run from the portal.
- Portal (PORTAL-PLAN.md P1): `properties/<p>/offers/<o>/draft/<d>/sign` (Ready to sign), `.../signing/<s>` (a round out for signing),
  `.../signing/<s>/turn/<signer>` (one signer's turn on Tim's device, in person from the start), `.../present` (presenting a round).
  Signers' pads `#sgSig`, `#sgInit` and the marking canvas `canvas.sg-draw` are in `VENDOR_PADS`; Tim has no pad in phases 3 and 4.
  Signing links stay at packages.dunnerstunner.co.nz/onboarding (`?sign=` opened at the portal goes there). Test: `offers-portal.test.js`.
- Locked rounds: stored with the offer in the property-files bucket and listed on the offer page; the lawyers' pack is a zip Tim
  downloads to his device. Nothing is saved to OneDrive and there is no OneDrive connection.

Tim's decisions of 24 November 2026, built on `offers-live` (all database pieces folded into 023 and 024, still unapplied):
- Emails are drafts Tim reviews, then sends from the page (`EMAIL-VOICE.md`). `offer_mail_drafts` and `offer_mail_log` (024). Signing
  links: "Prepare the emails" makes one draft per signer; the personal link is made only when that draft is sent. "Please initial
  again" after a change: a draft per reopened link signer. The agreed copy: one draft to the purchasers (cc their lawyer) and one to
  the vendors (cc theirs), the agreed copy attached, built from the agreement's data (`src/mail-core.js`), marked blanks where the
  data is silent; built as soon as Tim confirms the agreement. Each is edited on the page; Send, or Reviewed then Send all reviewed;
  marked blanks block sending; unsent drafts show in Needs you; the log keeps who, when and the exact text. Recipients are checked by
  the database (that side and its lawyer only), and so is privacy (no other party's own phone or email).
- Identity is a free choice: Known to the agent, ID checked (with what was seen), or neither. Blank never blocks (023).
- Changes from a link start off (`link_changes_default` false, 024); Tim switches them on per round.
- Tim mediates every round: before a signer confirms, the line "When you confirm, this goes straight to Tim McGuire, the agent. He will
  be in touch with the other party; they are not told until he does." shows once, beside Finish (never per place). Nobody but Tim is
  emailed when a party signs, initials, changes or submits; Tim is emailed once per submitted round (who, what changed, which round,
  the round's portal address). A party's own link never says what the other side or Tim decided ("This version is no longer being
  signed. Tim will be in touch."). The vendors' dashboard and journey map show no offer activity, and the property moves to Under
  offer only when Tim confirms the agreement.

Review fixes on `offers-live` (24 November 2026): a drawn box for both sides is shared (purchasers first half, vendors second; other
side's ink inside blocks); only the signature block counts as signed (core, 023, 024, mock); a turn's address is checked whole
(`agent_signing_turn_ok`, 023, and every new route); "Back to Tim's screen" asks first and Tim's page waits behind "I'm Tim, carry on";
a draft from before the numbering can't be signed (024 and the app); a counteroffer term number already used, retired or out of
order is refused by the server, which names the next free one, and the page retries once.

For Tim's information (no change): drafting leaves a blank initials line after each further term, so drafts are longer and run onto
continuation pages sooner; and more purchasers than the printed name places no longer blocks drafting (signing adds places beneath,
or refuses on a pack with no room, as on Tim's real pack for a fourth purchaser).

Second review (24 November 2026): one send at a time (a draft is "sending" with a pending log row; a second Send is refused; a send
the mail server took but that wasn't recorded says "This may have gone. Check before sending again", and Tim makes it a draft again only
once he has checked); marked blanks refused by the server; the deposit in Tim's words ("Deposit ($X): payable to Public Trust O/A NZ
Real Estate Trust once the agreement becomes unconditional"); from Round 2 on a correction shows the parties only the neutral reason, and
Tim is warned before correcting while a round is out; the vendors' agreed email only to this negotiation's vendor signers and their
lawyer; drafts open "Dear" (purchasers) and "Hello" (vendors); a signer sees "Document check code" behind Details.

Freeze and withdrawal (Tim, 24 November 2026): on the offer page Tim can Freeze now (one tap and a confirm; all signing on every round
stops at the server; links say only "This version is no longer being signed. Tim will be in touch."; nobody is emailed; Unfreeze lets
it carry on) and Withdraw now (who directed it, side and person, the reason, when and how he was told; everything freeze does, for good;
two draft emails, to that side with its lawyer and to the other side's lawyer, for Tim to read and send). A party can ask from their
own signing link (stop for now, or withdraw, with a reason from the list or their own words): it stops only their link ("Your request
has gone to Tim. He will contact you straight away."), Tim gets an urgent email at once, and it shows in red at the top of Home and on
the offer, with Freeze now, Withdraw now and Let them carry on. Everything is on the timeline and the lawyers' pack. The old "A side has
withdrawn" form is replaced by Withdraw now. The buyer's offer form has no per-buyer link, so requests come only from signing links.

Who holds the deposit (Tim, 24 November 2026): a choice above the agreed copy's emails: Public Trust O/A NZ Real Estate Trust (Tim's
trust account), the vendors' lawyer's trust account, or Other (typed). The recommended one (the vendors' lawyer when any KiwiSaver is
part of the deposit) is preselected and marked; another choice with KiwiSaver is warned but allowed, and the drafts keep "can't be
released before settlement". Each choice is kept with the agreement; unsent drafts are rebuilt to follow it.

Open points for Tim:
- One-time signing codes still go by themselves (a signer is waiting for it), holding only the code and who it is from.
- "I'm Tim, carry on" is a tap; P3's PIN or passkey replaces it.
- The roadmap's "when the deposit is paid" and the property page link are always blanks: the agreement's data doesn't hold them.
- `offer_sign_issue` (023/024, service role only) still exists for the database tests; the edge function no longer calls it.
- Phase 1's "Withdrawn or lapsed" buttons (agent_offer_status) still stop signing, but record no directing person or reason; Withdraw now is the full record.

Going live, with Tim's approval, in order:
1. Live rollback test: `node onboarding/tests/offer-negotiation-rollback.js --with-023` (023 and 024 together, both undone), run on the
   live project. Every line lower case, no CAPITALS, and nothing left behind (no `offer_signings` table afterwards).
2. Apply 023 (`023_offer_signing`), then 024 (`024_offer_negotiation`).
3. Merge `offers-live` into main and push.
4. Deploy `offer-sign` (new, JWT verification OFF) pinned to that commit, then redeploy `offer-public` (JWT OFF, as now) pinned to the
   same commit. `offer-draft` and `doc-prefill` are unchanged. `offer-sign` imports `onboarding/src/mail-core.js` by its relative path.
5. Test with Tim's own addresses: a test offer signed in person in the portal and by link (Prepare the emails, read, Send); present
   to a test vendor; a counter and an acceptance; check Tim's one email per round; the agreed copy and its two draft emails (fill the
   blanks, send); the lawyers' pack; a request from a test link (Tim's urgent email), Freeze now, Unfreeze and Withdraw now. Tim's solicitor confirms the method before the first real offer.

## Signing: full screen, zoom and page buttons; chattels initials; four more marks; Tim's own places (Tim, 26 November 2026; branch `signing-viewer`, from `offers-hotfix-3` 96a8178)

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

## Offers fixes 3 (Tim's decisions of 25 and 26 November 2026; branch `offers-fixes-3`, from main 92ebdd3)

Status: Live 26 November 2026 (see Live status). Waiting on Tim's live checks (step 5). Was: needs migration 026 (`026_offer_undo_revert_hold.sql`; its rollback test first,
then applied with Tim's OK) and offer-sign redeployed (pinned to the new commit). Mediation as always: no party learns of the other
side's activity until Tim releases it, and nobody is emailed but Tim.
1. Freeze blocks confirmation, held not sealed. While an offer is frozen, "Confirm the agreement" holds Tim's confirmation (the
   acceptance time and the date text) instead of making the agreement: `offer_confirm_holds`, checked as the agreement would be (the
   freeze set aside, a withdrawal never), one at a time. The offer page shows "Held while frozen: not locked, sealed or dated", with
   the round, the acceptance time and the date. Nothing is emailed. While frozen it can only be discarded; once unfrozen, "Complete the
   held confirmation" makes the agreement exactly as Confirm does (the offer-sign function, every check run again: the date no earlier
   than acceptance and not after today; the newest sealed round still the one held), and Tim's own email with the dated copy goes then.
   The database settles it: completed when that agreement is made (superseded if another is), discarded if the offer is withdrawn.
2. Going back to the last sealed round. On the frozen panel, "Unfreeze and go back to Round N" (one confirm, then at once): every round
   still out for signing stops (cancelled), what it held (taps, changes, finished signers) is listed on the timeline as discarded,
   every row kept, and the freeze is lifted in the same step. Tim then presents Round N again, or starts a fresh copy. With nothing
   sealed yet it goes back to before signing started (Tim releases the draft again). A party can ask for it from their own link only
   after a freeze on their round has been lifted ("Go back to Round N as it was signed", or "Start this round again from the beginning"
   in Round 1): it is a request like stop or withdraw (`offer_requests` kind `revert`, reason "Something important changed while
   signing was paused" or their own), it stops only their link, Tim gets one urgent email, and it shows in red on Home and the offer
   with "Go back to Round N" (Tim releases it) or "Let them carry on".
3. Undo always available. In every signing turn, in person and by link, a "Made a mistake?" box: "Undo my last step" (the newest place
   tapped or change made that still stands; the box names it, for example "Your initials on page 3") and "Start my turn again"
   (everything they did this round taken back; their drawn signature and initials kept unless they tick to clear them, then they draw
   again). A Round 1 mark waiting for Tim can be undone by its maker, and signing carries on. On the round's page Tim can "Start this
   round again" (with a reason, one confirm): every tap and change on it undone, anyone who finished opened again, the same people and
   links carrying on, drawn signatures kept. Undoing never removes anything: a tap or change stays exactly as made (023's triggers
   unchanged) and an `offer_sign_undos` row records what was undone, by whom, when and how; a place tapped again adds a "redo" row.
   A signature drawn again (only once every tap of theirs is undone) is an `offer_sign_redraws` row; the first drawing stays in
   `offer_signers` as 023 requires. Every reader of a round's work (signing, finishing, locking, presenting, the agreed terms, the
   link's state, Tim's screens) reads what stands through three views (`offer_sign_taps_live`, `_marks_live`, `_reviews_live`), so
   undone work is never on a sealed round. A change someone else has since reinstated can't be undone by its maker (Tim can start the
   round again). Frozen: nobody undoes. A further term number freed by an undone change can be used again.
- The timeline (and the lawyers' pack) says each in words: "Undone (kept on the record) by ...", "Tim started the round again",
  "Tim went back to the last sealed round ... discarded", "Confirmation held while frozen (not locked, sealed or dated)".
- For Tim's information: undoing a change leaves anyone's initial already tapped beside it on the record but no longer needed; signers
  reopened when that change was made sign Finish again. Opening a round again (Tim's restart) emails nobody: tell the link signers
  yourself.
- Edge function: offer-sign gains `undo` (their link and session) and the urgent email for a request to go back
  (`src/mail-core.js` `requestNotice`, the same words for freeze and withdraw as before). No new imports; `page-text-bundle` passes.
After the independent review (26 November 2026), fixed on the same branch:
- A sealed round can't change through the new tables, whoever writes to them (the service role included): undo and redraw rows are
  refused unless their round is still open (ready, signing, held or complete, with no sealed round row), the signer, tap or change is
  that round's own, and once everyone has signed only Tim's start-again rows are taken (`guard_offer_sign_open_work`, before insert).
- Undoing a change sets aside the unsent "please initial the change" drafts it made (void, with the reason, never removed; sent ones
  stay), so long as the signer has no other change left to initial; Tim's round page says how many and that they were not sent.
- At most 30 undos and 30 places tapped again an hour per signer, with a plain message to call Tim.
Before go-live (review READY at b01a70b; two notes):
- Tim's note on the round page also names who still needs to finish again ("<name> still needs to finish again: send them their
  link"), with "Make a \"please finish again\" email": a draft to that signer alone (`src/mail-core.js` `finishAgainDraft`), which Tim
  reads and sends himself. Nothing is sent by making it.
- `guard_offer_sign_open_work` takes the offer FOR KEY SHARE, then the signing FOR SHARE (the order everywhere), so a write arriving
  while a round is being locked waits for the lock and is then refused. `tests/offer-undo-race.js` (local stand-in only) shows it: the
  service role's undo and cleared drawing, and Tim's start-again, each wait and are refused, with no deadlock; the same test on the
  previous 026 let an undo into the round as it was sealed.
- After the next review: a place tapped again and a signature drawn again take the signing (FOR UPDATE) before the signer, as finishing,
  undoing and changes do, because their rows' guard reads the signing; one lock order everywhere (the offer, then the signing, then the
  signer). The race test adds the same signer's re-tap at the same moment as their undo (48 pairs), finish (40) and change (40): no
  deadlock (the previous 026 gave 13, 15 and 21).
Tests: `tests/offers-fixes3.test.js` (new), `tests/offer-undo-rollback.sql` and `.js` (new; run on the local stand-in through 025:
every line as expected, no capitals), `tests/offer-sign-fn.test.js` and `tests/mail-core.test.js` (extended), the mock (`tests/mock.js`)
mirrors 026. 024's rollback test, 025's rollback test and 024's race test were also run with 026 applied: the same results.

Going live, with Tim's approval, in order:
1. Live rollback test: `node onboarding/tests/offer-undo-rollback.js > /tmp/r26.sql`, run on the live project. Every line lower case,
   no CAPITALS, nothing left behind (no `offer_sign_undos` table afterwards).
2. Apply 026 (`026_offer_undo_revert_hold`).
3. Merge `offers-fixes-3` into main and push.
4. Redeploy offer-sign pinned to that commit (JWT verification OFF, as now). offer-public, offer-draft and doc-prefill are unchanged.
5. Tim checks on the live site: an undo in person and by link, Start this round again, Freeze then Unfreeze and go back, and Confirm
   while frozen (held, then completed).

## Offers hotfix 2 (26 November 2026; branch `offers-hotfix-2`)

Status: Built, awaiting review and Tim's approval. offer-sign to be redeployed; no database change.
Hotfix 1's top-level pdf.js import crashed the whole function on Supabase at start-up ("DOMMatrix is not defined"): even OPTIONS
answered 500, and offer-sign was rolled back to 7bdc9c6 within two minutes.
1. The struck-words check now reads the draft with unpdf 1.9.1's serverless pdf.js (no DOM globals, no worker file, no canvas),
   loaded lazily inside the check only. A library problem can only refuse a lock with a line through text, never stop the function.
   unpdf 1.9.1 (pdf.js 6.4) reads exactly the same words in the same places as the screen's pdf.js 6.2.108 (checked on the synthetic
   blank and a drafted agreement); unpdf 1.4.0 (pdf.js 5.4) does not, so it was not used.
2. `tests/page-text-bundle.test.js` bundles the real entry (fn/offer_sign.ts) and runs it with no file, network or system access and
   without DOMMatrix, Path2D, ImageData and OffscreenCanvas: the module loads, OPTIONS answers 200, and the reader gives the words and
   turns. The same run on 21b7dc7's code fails with "DOMMatrix is not defined", as it did live.
3. The signing cores also set their global when a bundler wraps them as CommonJS (the entry reads the globals).
4. A line made before hotfix 1 (with the form's printed "$" kept) still checks out at lock, so nothing already signed is stuck.
5. The offer form's privacy notice gives hello@timmcguire.co.nz.

## Offers hotfix 1 (live smoke test, 26 November 2026; branch `offers-hotfix-1`)

Status: Built, awaiting review and Tim's approval. offer-sign to be redeployed; no database change.
1. Every round with a line through text was refused at lock ("The struck words couldn't be checked"): in the edge bundle pdf.js
   tried to load its worker file from disk. The entry now imports pdf.js and its worker statically and hands the worker to pdf.js
   (`fn/page_text.ts`), so nothing is read from disk. Checked with a Deno bundle run with no file, network or system access
   (`tests/page-text-bundle.test.js`), which fails the old way without the worker.
2. A read failure still refuses the lock (fails safe); its cause now goes to the function log (never the document's words) and, on
   Tim's own lock request, a short reason shown with the message.
3. The lock-failed card names the round being locked ("Round 2 wasn't locked yet", "Make and lock Round 2"), not always Round 1.
4. A line through a filled-in figure no longer takes in the form's printed "$" beside it ("$ $990,000" became "$990,000").
5. The signing link page's tab title is "Sign your offer" (it said "Your agency agreement"), and the link and offer pages give
   Tim's current address, hello@timmcguire.co.nz (the agency agreement's own documents keep their wording).

## Offers fixes 2 (raised by Tim 25 November 2026 from his test offer; branch `offers-fixes-2`)

Status: Built, awaiting review and Tim's approval. Needs migration 025 (rollback test first, then applied with Tim's OK) and
offer-sign redeployed (pinned to the new commit). Found in Tim's live test offer (signing and counteroffers, phases 3 and 4).
1. Typed words invisible while signing. The page's translator guard wrapped figures such as "$690,000" in an HTML span inside the
   SVG text, which browsers don't draw. The guard now never touches SVG, and the marks layer is marked not to be translated. The
   words show on every screen that draws marks (signing, the working copy, the present screen, Tim's round views), at the place
   and size the locked copy prints them.
2. Line through text, precise (Tim: an underline-looking strike is ambiguous and could make him liable for the difference).
   The line is snapped to the printed words it crosses (`SIGN.snapStrike`, from the page's own text as pdf.js reads it): whole
   words, from the first letter to the last, through the middle of the letters (mid cap height for figures, mid x-height for
   words). A drag over no text is refused ("Drag along the words you want to strike through."). The line, and a crossed-out box,
   stay on the page until saved or cancelled. Before Save the signer sees 'This strikes through: "$655,000"'; the words are kept
   with the mark (geometry.text) and listed in the round's execution record ("a line through text striking ..."), Tim's round
   notice and his lists of marks. Records locked before this read exactly as before (so they redraw byte for byte). The locked
   copy draws the stored line, so it is exactly where the screen showed it. Tim's own draft editor has no "Line through text" (its
   strike-out is a box he draws), so it is unchanged.
3. Agreed-copy emails fill what the portal knows. The agreed price after the negotiation (`MAIL.agreedPrice`, from the rounds'
   change shapes: a struck price and one typed figure beside it, not itself struck; anything unclear, such as other typed words
   naming a price or handwriting over it, leaves "[Tim to fill: the agreed price after negotiation]"); the deposit from it when the
   agreement gives a percentage; each condition's due date and settlement day from the agreement date with working days and the
   province's holidays (`MAIL.agreedDates`, the offer form's counter). A date written on the agreement stands. What was worked
   out is shown once to Tim beside the editor ("Worked out for these emails (check each)"), never in the emails.
4. Wording and a lost tick. The vendors' round says "each vendor" (send box, held box, no-email warning, the link page's title).
   On the Present screen, changing "How they sign" keeps the "I've looked at Round N" tick.
5. The email privacy check refused Tim's own sign-off where Tim is the vendor (or buyer). Migration 025: `offer_settings.agent_phone`
   and `agent_email` (one place for Tim's own details), `offer_agent_own()`, and `offer_mail_side_hit` skipping the agent's own
   email or phone (phones compared by NSN). A real party's own phone or email is still refused. Rollback test:
   `tests/offer-mail-own-rollback.sql`.
6. Tim is emailed the final dated agreed copy at once when he confirms the agreement (Tim: "it is most important that I get an
   email once the document is finalised"): "Agreement confirmed: <address>", the locked copy attached (checked against its
   fingerprint; a portal link instead above 15 MB), the date, purchasers and vendors, the agreed price after the negotiation (the
   same `agreedPrice` as the parties' emails, with the round it changed in), each due date and settlement day, the deposit holder,
   the fingerprint and the offer's portal address. Only ever to Tim, logged in email_log. "Email me the agreed copy again" on the
   offer page sends it again (for the test agreement confirmed on 25 November). `offer_agreed_notice_material` (025) gives the
   function what it needs.
After the independent review (25 November 2026), fixed on the same branch:
- The agreed price is read only from a line through the price itself (inside the price place's own height; its recorded words hold
  the drafted figure, or, for a line from before the words were recorded, it runs across most of the drafted figure), and typed
  words that are a money figure and nothing else ("plus GST", "if settlement 1 March" and the like give the marked blank). A figure
  under half or over double the drafted price gives the marked blank.
- Any change the price doesn't account for blanks the deposit, settlement day and each condition's date in the parties' emails and
  Tim's own email; Tim's notes (and his email) list every change by round and page, with the struck and typed words. Every date
  shown has a "check" note.
- A page turned sideways (/Rotate) takes no marks ("Changes can't be marked on this page, because it is turned sideways. Ask Tim for
  a change instead."); a page with no words to read says to use a crossed-out box or a note, or ask Tim.
- The offer-sign function checks the struck words against the draft itself (pdf.js, `fn/page_text.ts`) before locking a round; a
  mismatch, a turned page or words it can't read refuses the lock in plain words.
- Tim's phone in every email is read from `offer_settings.agent_phone` at run time (Tim's screen, and the function through
  `offer_agent_contact`).
- An agreed copy that doesn't match its fingerprint when it is to be emailed is an integrity alarm: recorded on the offer's timeline
  (`offer_integrity_alarm`) and in email_log, and Tim is told plainly; nothing is sent.
- Confirm answers once the copy is locked; Tim's email goes after (EdgeRuntime.waitUntil) and his page checks the email log and says
  when it went or failed. Agreed-copy email_log rows carry the property's agency agreement. Typed words show on the page as they are
  typed. Dark mode checked for the new text.
After the re-review: a counter-counteroffer can strike the figure the other side typed in an earlier round. Those typed words
(still standing, not struck by an earlier line unless reinstated) count as words on the page (`NEGO.typedItems`), on screen and in
the function's check, so the line is snapped to them and recorded as striking them. Every line in a round locked now must carry its
words (rounds locked before are never checked again). 025 grants Tim's screen select on `agent_phone` and `agent_email`; the alarm's
own "what" wins over its detail; the function waits for Tim's email itself where the runtime can't carry work on; the page watches
only this offer's email, from the server's lock time.
Later (027; 026 is Offers fixes 3): `offer_private_hit` (the check on typed words in a counteroffer) has the same agent-is-a-party
problem as item 5; to be fixed the same way.
Decided by Tim, 25 November 2026: "Confirm the agreement" while an offer is frozen is held, not made (Offers fixes 3).
Tests: `tests/offers-fixes2.test.js` (new), `tests/strike-snap.test.js` (new), `tests/mail-core.test.js`, `tests/offer-nego-fn.test.js`,
`tests/offers-nego.test.js` (extended).

## Offers fixes 1 (raised by Tim 25 November 2026, built ahead of everything else; branch `offers-fixes-1`)

Status: Live 25 November 2026 about 15:25, with Tim's approval, after an independent review (READY; its should-fix points fixed
before release). No database change. offer-draft, offer-public and doc-prefill redeployed, pinned to 06c2d22.
1. AI wording always failed. Sonnet 5.5 refuses tool_choice "tool" and "any", so Tim's clause writer, the buyer's condition help
   and translation all failed (seen in ai_calls). Every request (translation, offer condition, clause writer, pack reading,
   document prefill) now goes through one helper in `fn/prefill_shared.ts` (answerByTool): tool_choice "auto", and a line in the
   system prompt: "Answer only by calling the X tool, exactly once. Do not reply in plain text." Haiku too, so a model change
   can't break it the same way. A reply with no tool answer gives a plain message ("The AI didn't give a usable answer. Try
   again, or write the condition yourself.") and is logged in ai_calls as not ok with the error "no tool answer".
2. No agreement blank ready. When a property has no usable blank (none loaded; loaded but its places not approved; or only an
   unchecked edition), a warning card (card warnc) shows on "Fill in an offer for a buyer" (before the form, entry not blocked),
   on the Offers tile (when the form is on or there is a live offer), on the offer page (#drNoBlank, now the card), and in "Needs
   you" (one item per property with a live offer: "Offer waiting: no agreement blank ready"). A live offer (one shared check,
   so the tile and Needs you agree): from the form or entered by Tim, not spam, not withdrawn, lapsed or declined. Nothing is
   shown for a property that has sold, settled or been withdrawn.
   After review: the clause writer's reserved ai_calls row is always finished, even if reading the answer fails; a reply cut
   off before any tool answer is logged as "max_tokens"; more room for the clause writer (1600) and condition help (1000). The
   button is "Load the agreement blank" (to the tile's blank section) or "Check the places on the blank" (opens the places
   checker). Agent screens only: the buyer's form is unchanged. Test: `tests/offers-noblank.test.js`.
