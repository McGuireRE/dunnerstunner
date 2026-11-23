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
Due Diligence clauses as he wants them used (he is sending these). Answered 24 November 2026: Tim's own clause wording will come from
his OneDrive folder McGuire > Forms > Clauses. The most recent version of each may be the right one, but the folder is disorganised, so
each needs his tick before it goes in the clause library.

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

Status: built and tested locally only (Tim was asleep). Migration 020 passed its rollback block on a local PostgreSQL 16 stand-in
(`tests/pg-standin.sql`, then 010, 016 part A, 018 and 019), NOT the live project. Phases 2 and 3 go live together, in order (019, then 020).

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
- Timeline: every offer event (all phases, from 020 on) carries the fingerprint of the one before it in its chain; "Check the
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
    (nothing removed). This is the one change to an existing table's rule in 020.
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
1. Run the rollback block on the live project (`node onboarding/tests/offer-sign-rollback.js`): no CAPITALS. Then apply 020.
   (The race test, `onboarding/tests/offer-sign-race.js`, is for a local stand-in only: it makes and drops a scratch database.)
2. Push, then deploy `offer-sign` (fn/offer_sign.ts) pinned to that commit, with the gateway's JWT verification OFF. Redeploy
   `offer-public` pinned to the same commit (JWT off, as now) for the narrower CORS.
3. Sign a test offer with four test purchasers (in person) and one by link to Tim's own second address.

Known limits: text that is drawn as lines or shapes (box borders, the portal's strike-throughs) isn't "printed words" to the check, so
initials may touch a box border. Pages of the real pack were checked by eye at pages 1 and 20 only. Marking and the place taps were tested with a mouse on a phone-sized screen,
not on a real phone or stylus.

## Phase 4 detail: presentation and counteroffers (built 24 November 2026, branch `offers-phase4`, on top of `offers-phase3`; not applied, pushed or deployed)

Status: built and tested locally only (Tim was asleep). Migration 021 passed its rollback block on a local PostgreSQL 16 stand-in
(`tests/pg-standin.sql`, then 010, 016 part A, 018, 019 and 020), NOT the live project. Phases 2, 3 and 4 go live together, in order
(019, 020, then 021).

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

Migration 021 (`021_offer_negotiation.sql`), additive: offer_documents; offer_agreements; columns on offer_signings (round_no, side,
document_id, base_round_id), offer_signers (person_id) and offer_rounds (document_id, doc_round, side, base_round_id, changes, lifted,
outstanding); kind 'insert' on offer_sign_marks and guide 'chattels' on offer_sign_receipts (check constraints widened, nothing removed);
the one-live-signing-per-draft index becomes per draft and round. It replaces some 020 functions with the same names and arguments,
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
7. Once agreed, `agent_offer_correct` (018, replaced in 021, otherwise unchanged) refuses. `offer_agreements.terms` holds the agreed terms
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
  `offer_settings.link_changes_default` (on by default; `agent_offer_link_changes_default`). It applies to the purchasers too when a
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
5. (Answered by Tim) Changes from a link are allowed for a round when Tim switches it on (on by default); Tim still looks at every round
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
1. Run the rollback block on the live project (`node onboarding/tests/offer-negotiation-rollback.js`): no CAPITALS. Then apply 021.
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
