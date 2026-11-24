# Database reference (5 November 2026)

A snapshot of the live onboarding database (Supabase project hwpwyjxhdvlqrjwzxzqz), for builders. Read the live database
when in doubt. New changes go in numbered files beside this one (001_..., 002_...), each the exact SQL applied.

```
TABLE agents (email text, name text, created_at timestamptz)
TABLE agreement_events (id bigint, agreement_id uuid, at timestamptz, actor text, kind text, detail jsonb)
TABLE agreement_people (id uuid, agreement_id uuid, position integer, legal_name text, pref_name text, email text, phone text, user_id uuid, id_verified_at timestamptz, signed_at timestamptz, created_at timestamptz)
TABLE agreement_variations (id uuid, agreement_id uuid, number integer, status text, changes jsonb, summary jsonb, reason text, created_by text, created_at timestamptz, sent_at timestamptz, signing_mode text, signed_at timestamptz, withdrawn_at timestamptz, copy_sent_at timestamptz, copy_error text)
TABLE agreements (id uuid, ref text, address text, status text, agreement_version text, config jsonb, answers jsonb, legal jsonb, sent_at timestamptz, signed_at timestamptz, copy_sent_at timestamptz, cooling_off_until timestamptz, countersigned_at timestamptz, ended_at timestamptz, created_at timestamptz, updated_at timestamptz, copy_error text)
TABLE ai_calls (id bigint, at timestamptz, purpose text, model text, ok boolean, error text, input_tokens integer, output_tokens integer, files integer, agreement_id uuid, agent text)
TABLE aml_events (id bigint, aml_file_id uuid, at timestamptz, actor text, message text)
TABLE aml_files (id uuid, agreement_id uuid, person_id uuid, data jsonb, locked_at timestamptz, locked_by text, retain_until date, created_at timestamptz, updated_at timestamptz)
TABLE cancellation_requests (id uuid, agreement_id uuid, person_id uuid, requested_by text, reasons text, phone text, acks jsonb, user_agent text, requested_at timestamptz, within_cooling_off boolean, status text, agent_notes text, processed_at timestamptz, processed_by text, outcome text)
TABLE email_log (id bigint, agreement_id uuid, at timestamptz, kind text, recipients text, subject text, ok boolean, error text)
TABLE lawyer_links (id uuid, agreement_id uuid, token text, lawyer_name text, firm text, email text, sent_at timestamptz, first_opened_at timestamptz, last_opened_at timestamptz, open_count integer, expires_at timestamptz, emailed_at timestamptz, email_error text, sent_by text)
TABLE non_working_days (day date, label text)
TABLE prelisting_events (id bigint, prelisting_id uuid, at timestamptz, actor text, kind text, detail jsonb)
TABLE prelistings (id uuid, address text, contact_name text, contact_email text, status text, appraisal jsonb, answers jsonb, plan jsonb, question text, agreement_id uuid, user_id uuid, created_at timestamptz, updated_at timestamptz, invited_at timestamptz, proceeded_at timestamptz, submitted_at timestamptz, plan_published_at timestamptz, question_at timestamptz, accepted_at timestamptz)
TABLE prior_agency_notices (id uuid, agreement_id uuid, idx integer, agency text, agent_name text, email text, kind text, dated text, status text, reviewed_at timestamptz, sent_at timestamptz, sent_by text, sent_to text, sent_method text, send_error text, created_at timestamptz)
TABLE signatures (id uuid, agreement_id uuid, person_id uuid, signer_role text, signer_name text, image_path text, snapshot jsonb, snapshot_sha256 text, user_agent text, signed_at timestamptz)
TABLE variation_signatures (id uuid, variation_id uuid, agreement_id uuid, person_id uuid, signer_role text, signer_name text, image_path text, snapshot jsonb, snapshot_sha256 text, user_agent text, signed_at timestamptz)

FUNCTIONS (security definer unless marked)
agent_end_agency(a uuid, reason text) · agent_issue_variation(v, p_mode, p_image_path, p_snapshot, p_user_agent) · agent_new_variation(a) → uuid
agent_process_cancellation(rid, p_outcome, p_notes) · agent_send_to_lawyer(a, l_name, l_firm, l_email) → uuid · agent_set_legal(a, choice)
agent_sign_in_person(a, pid, p_image_path, p_snapshot, p_user_agent) → jsonb · agent_sign_variation_in_person(v, pid, ...) → jsonb · agent_withdraw_variation(v)
claim_my_agreements() → setof uuid · cooling_off_deadline(copy_given, unsolicited) [invoker] · is_agent() · is_party(a) · is_working_day(d) [invoker]
log_event(a, actor, kind, detail) · make_prior_notices(a) [internal] · on_agreement_signed() [trigger] · require_open(a)
pl_accept(p) → uuid · pl_mine(p) [internal] · pl_question(p, q) · pl_save(p, patch) · pl_signing_ready(p) → boolean · pl_submit(p, patch)
variation_after_sign(v) [internal] · vendor_forward_to_lawyer(a, l_name, l_firm, l_email) · vendor_request_cancellation(a, p_reasons, p_phone, p_acks, p_user_agent)
vendor_save(a, patch) · vendor_send_to_lawyer(a, ...) · vendor_set_legal(a, choice) · vendor_sign(a, p_image_path, p_snapshot, p_user_agent) → jsonb
vendor_sign_variation(v, ...) → jsonb · vendor_upsert_person(a, pid, p_legal, p_pref, p_email, p_phone) → uuid
Leftovers to tidy: is_prelisting_party(prelistings) is unused; on_agreement_signed() should have execute revoked from anon and authenticated.

ROW LEVEL SECURITY (every table has it on)
Agent (is_agent()) can read everything; writes go through the functions above or the agent policies.
Vendors (is_party(agreement_id)) read their own agreement, people, signatures, lawyer links, cancellation requests, prior notices, and issued variations.
Prelistings: the vendor reads their own by contact_email or user_id, while not closed. Writes only through pl_* functions.

TRIGGERS THAT PROTECT SIGNED RECORDS
guard_signed_agreement: once anyone has signed, address, answers and config can't change (except config.agent_notes).
guard_signed_person: a signed person's legal_name, email and position can't change.
guard_variation: an issued variation's terms can't change. guard_prior_notice: the signed notice text can't change.
signatures, agreement_events, aml_events: can't be updated or deleted. aml_files: locked files can't change.

STORAGE (bucket "private")
agreements/<agreement id>/signatures/... (vendors may upload their own signatures here) · imports/<batch uuid>/... (dropped-in documents, agent only)
```

## Added in phase 1 (migrations 001 to 003)
- `properties`: one record per property: address, title, owners on title, ownership, description, disclosures,
  `stage` (moves forward on its own; withdrawn when the last agreement ends or is cancelled), `cycle_at` (set when
  it starts again with new owners).
- `property_people`: the people on a property. `role` is owner (signs), contact (in touch, not a signer) or former
  (set aside: never deleted, never visible to vendors). `name_from` records where the legal name came from; a
  checked name (title, agreement, Tim) is never replaced by an informal one. Two people with different emails are
  never merged.
- `property_documents`: documents Tim drops in. Agent only.
- `prelistings.property_id`, `agreements.property_id`. Triggers keep the property current from the newest live
  agreement and from pre-listings; agreements are made from the owners only. Signed records are untouched.
- `agent_reopen_property(pid, new_owners)`: start a withdrawn or settled property again.
- Still to do with Tim's OK: drop the unused `is_prelisting_party(prelistings)`.

## Added in phase 2 (migration 005, written and tested in rollback blocks; to be applied with Tim's OK)
- `property_forms`: one per agreement and kind (`vendor_declaration`, `healthy_homes`), with `form_version`, `status`
  (draft, ready, signed), `data` (the vendors' answers), `agent_data` (Tim's Healthy Homes measurements),
  `countersigned_at` (the licensee signed the declaration), `filing_at` (the PDF is being made, claimed by one call),
  `document_id` (the filed PDF in `property_documents`, source 'generated') and `pdf_error`. Agent all; parties read.
- `form_signatures`: like `signatures`, can't be updated or deleted; `signer_role` client or agent (the licensee).
  The server adds the form's stored data to each snapshot before fingerprinting it.
- `guard_form`: once anyone has signed, the form's data can't change and it can't be removed. A direct write by a
  signed-in user can never set signed, countersigned, filed or being filed: only the functions below (and the edge
  function's service role, for filing) can.
- `guide_receipts`: the dated "Before you sell" receipt for the REA sale and purchase guide, with its version, file
  name (checked) and SHA-256. Permanent.
- Functions: `vendor_form_start(a, p_kind)`, `vendor_form_save(f, patch)` (declaration only, while unsigned),
  `vendor_form_sign(f, ...)`, `agent_form_sign_in_person(f, pid, ...)` (witnessed), `agent_form_countersign(f, ...)`
  (the licensee, after every vendor, declaration only), `vendor_guide_receipt(a, guide, version, file, sha256, ua)`.
  Signing needs the agreement still signed or countersigned, and a signature image uploaded for that form and signer.
- Form PDFs are printed from the stored form with the wording for its `form_version` (fn/pdf.ts FORM_TEXT).
- Agreement signatures from phase 2 carry `appendices` (Vendor Guide, Complaints, REA guide version and SHA-256) and,
  when the guide was shown, `rea_guides` (the receipt). No database change: they are part of the snapshot. Agreements
  whose first signature has no `appendices` print exactly as before. The server appends a guide only if it is
  listed in guides.json with that version and, when recorded, the same SHA-256.

## Added in phase 5 (migrations 009 and 010, written and tested in rollback blocks; to be applied with Tim's OK)
- `property_events`: a permanent record of stage changes on a property (`at`, `actor`, `kind` stage_changed or stage_back,
  `detail` with from, to and the reason). Agent reads; nobody writes directly; rows can't be changed or removed.
- `agent_set_stage(pid, p_stage, p_reason, p_confirmed)`: agent only. Needs `p_confirmed` true and an agreement that is
  countersigned. Moves signed to live, under_offer or sold; going back (sold to under_offer or live, under_offer to live) needs
  a reason; settled (from sold) and withdrawn end the agency by calling `agent_end_agency` on every agreement in force.
  Settled and withdrawn properties don't move (use `agent_reopen_property`). Logs to `property_events` and to the agreement's events.
- `campaign_stats`, `buyer_feedback`, `property_offers`: groundwork for the vendor reporting portal. Agent can read, add and
  correct; no vendor policy at all, so vendors see nothing; no delete. No screens use them yet.
- The review date is not stored as a field. It is worked out as the commencement (`config.start`, else the signing date) plus
  90 days, moved by any signed variation that changes `reviewUntil` (see `currentTerms` in app.js). Tim ticking a reminder off is an
  agreement event of kind `review_checked` with the date.

## Property inspection (migration 012, written and tested in a rollback block on the live project; to be applied with Tim's OK)
- `property_inspections`: Tim's walk-round of a property, before or after listing. `facts` (description and disclosure keys, as on
  the property file), `declaration` (Vendor Declaration keys to `{a, d}`, and `tenanted` to `{a}`), `notes` (one per section:
  outside, structure, inside, services, history, tenancy), `photos` (an empty list kept for later; nothing writes it yet),
  `applied` (what it wrote to the property file and what was there before), `conflicts` (facts an agreement in force holds
  differently, not written until Tim chooses), `resolved`, `sent_form_id` and `sent_at`, `status` (in_progress, finished),
  `created_by`, `started_at`, `finished_at`. Agent reads only; nobody writes directly; vendors have no policy, so they see nothing.
- Functions (agent only, revoked from public and anon): `agent_inspection_start(p_property, p_address)` (a new property at
  Appraisal from an address alone, refusing an address already on file, or an existing property; carries on an unfinished one),
  `agent_inspection_save(iid, p_facts, p_decl, p_notes)` (patches; a blank value clears; facts go to `properties` unless the newest
  agreement in force holds a different value), `agent_inspection_resolve(iid, p_key, p_use)` (inspection or agreement; an unsigned
  agreement is updated too, a signed one never), `agent_inspection_finish(iid)`, `agent_inspection_send(iid)` (after listing:
  starts or adds to the unsigned Vendor Declaration on the newest signed agreement; never replaces a vendor's answer, and returns
  those it kept so Tim sees the difference; refused once anyone has signed).
- Tim's notes in a declaration: `data.pre[k] = 'inspection'`, `data.noted[k]` (a copy of Tim's answer, for comparing),
  `data.insp = {id, on, by}`. Who dealt with each note is `data.checked[k] = {by, name, at, changed}` (the agreement person, their
  legal name, when, and whether the answer now differs from Tim's note, compared by value: choice and details, key order and an
  empty details field make no difference). Written only by `vendor_form_save`, never taken from the page: any change to the
  answer replaces whoever checked it with the person changing it; setting it back to Tim's answer is a check (`changed` false);
  ticking "This is right" checks the answer as it stands. A changed answer counts as dealt with for signing. Any other change to
  that answer (or to `tenanted`) clears it. On screen, in the locked view, in the signed snapshot and in the PDF each such answer
  reads "Noted by Timothy McGuire at the inspection on {date}; checked by {name}." or, if changed, "Timothy McGuire noted {his
  answer} at the inspection on {date}; changed by {name}." A Tenancy row is printed only when Tim noted the tenancy; declarations
  without notes print as before. Tim's own form page says the vendors check his notes on their own sign-in, with how many are left.
- `decl_same(x, y)`: two declaration answers compared by value (revoked from anon).
- `latest_inspection(pid)`: the newest inspection of this round of owners, with the declaration notes merged across all of them
  (newest answer per question, by the phone's time). `agent_inspection_save` takes `p_stamps` (the phone's time per answer): an
  older answer never replaces a newer one, and a refused answer is named in the error ("Not saved (d:pegs): ...").
- Replaced: `vendor_form_save` merges per key on the server (answers per question; only the vendor's own fields; `pre`, `insp`
  and confirmations never from the page; nothing unsent removed). `agreement_after` (002) is unchanged except that a blank
  answer on an agreement no longer wipes a value already on the property file (`pick_keep`).
- New triggers (additive; `guard_form` and the signature triggers are unchanged): `inspection_prefill_form` (a new Vendor
  Declaration, including one the vendors start with `vendor_form_start`, opens with the latest inspection of this round of owners),
  `guard_form_checks` (a direct write by a signed-in user, Tim included, can't add a declaration with answers, change its `data`
  at all, change a form to or from a declaration, or remove one; Healthy Homes `agent_data` is unaffected), and
  `form_sign_needs_checks` on `form_signatures` (a vendor signature is refused while any of Tim's notes is unconfirmed).

## Public council records (migration 013, written and tested in a rollback block on the live project; to be applied with Tim's OK)
- `council_lookups`: every public-records lookup (`asked`, `asked_norm` generated, `matched_address`, `council`, `status` ok, weak,
  choose, choose_unit, not_found, slow or unavailable, `result` jsonb as `fn/property_lookup_core.ts` returned it, `created_by`,
  `created_at`, `property_id` once tied). Written only by the `property-lookup` edge function (service role). Agent reads; nobody
  writes directly; vendors see nothing. Reused for 30 days; "Look again" makes a new one (at most one fresh lookup per address a minute).
- `council_use_log`: who used, removed or cleared which public-record values on which property, from which lookup, and when. Agent
  reads; nobody writes directly; vendors see nothing.
- `properties.found` (jsonb, per key: value, display, label, kind, note, source, source_name, source_url, as_of, as_of_label,
  fetched_at, field, written, matched_address, unit_address, council, used_at; never who used it or a lookup id) and
  `properties.provenance` (jsonb, per field title_ref, legal_description, pLand: where the value now on the file came from, its date
  label, and what the field held before, `was`). Written only by the functions below; `guard_found` refuses any other change.
  Readable by a party to the property (Tim's decision: rating information is public).
- Functions (agent only, revoked from public and anon): `agent_council_cached(p_asked, p_property)` (newest usable lookup under 30
  days that fits both the property's address and the address asked, never one tied to another property),
  `agent_council_accept(p_property, p_lookup, p_keys, p_replace, p_keep)` (values from the stored lookup only; refused when the
  lookup's address doesn't fit the property's; a different value on the file or the agreement waits for a choice; a draft agreement
  nobody has signed is brought into line, a sent or parked one is left alone, a signed one is never changed),
  `agent_council_remove(p_property, p_key)` (takes one value back out; the field gets back what it held before unless the agreement in
  force holds the public value). `agent_reopen_property` (replaced, same signature): new owners also start with no public-record
  values (cleared and logged). Helpers `council_norm`, `council_same`, `council_addr_key`, `council_addr_fits`, `council_lookup_fits`.

## ORC map server through the database (migration 015, written and tested in a rollback block on the live project; to be applied with Tim's OK)
- Why: maps.orc.govt.nz resets connections from the edge runtime; the database reaches it with pg_net (0.20.4, already installed).
- `orc_http_requests` (id = pg_net's request id, url, created_at): one small row per request made through `orc_http_start`. RLS on,
  no policy, revoked from anon and authenticated; only the two functions below touch it. Nothing removes its rows.
- `orc_http_start(p_url)` returns the request id: only `https://maps.orc.govt.nz/arcgis/rest/services/...` (no "..", plain URL
  characters, 2,000 at most); one GET queued with a 5 second timeout (sent once the call has committed).
- `orc_http_result(p_id)`: only for an id recorded by `orc_http_start`; `{pending: true}` until pg_net has the answer, then
  `{status, json}` with the parsed JSON object only, or `{status, error}` for a timeout, a network failure, a status outside 2xx,
  over 2,000,000 characters, or anything that isn't a JSON object.
- Both security definer, service role only (revoked from public, anon and authenticated). pg_net follows redirects and that can't be
  turned off; what comes back is still only accepted as a JSON object. The http extension was tested and is not used.

## Photos and documents on the property file (migration 016, written and tested in a rollback block on the live project; to be applied with Tim's OK)
- `repo_kinds` (kind, folder, position, shareable, exportable): the kinds of item, DwellHub's document type names and folders one to one
  (title, council, plans, reports, work, systems, insurance, photos, rental, valuation, other), plus folder `agency` (never exported;
  Appraisal, Offer, Identity document, AML record, CRM export and the Sale and purchase agreement are never shared). Read by any
  signed-in user; nobody writes it. The same list is `KINDS` in `src/repo-core.js` (the test compares them).
- `property_documents` gains `folder` (set by the database from the kind), `title`, `issued_on`, `mime_type`, `size_bytes`, `sha256`,
  `thumb_path`, `bucket` ('private' for everything before; 'property-files' for uploads), `client_key` (unique: the phone's key for the
  item), `inspection_id`, `room`, `caption`, `taken_at`, `width`, `height`, `shared_at`/`shared_by`, `archived_at`/`archived_by`, `updated_at`.
- `guard_property_document` (before insert, update, delete): no row is ever deleted (Remove archives); a generated document never
  changes; path, bucket, source, key, inspection, fingerprint, size and type never change once set; only a shareable kind, not
  archived and not generated, can be shared; removing unshares; a file in property-files sits under its own property.
- `property_document_events`: permanent (added, changed, shared, unshared, archived, restored, exported), written by the
  `log_property_document` trigger and the export; agent reads.
- Functions: `agent_repo_add(p_property, p_item)` (checks the stored file's size and type in storage, the path by key, the kind, a
  fingerprint; the same key returns the same row), `agent_repo_set(p_id, p_patch)` (kind, title, issued_on, room, caption),
  `agent_repo_share(p_id, p_on)` (only items in property-files), `agent_repo_archive(p_id, p_on)`,
  `agent_property_export(p_property, p_details default false)` (the "mre.property/1" JSON, `schema/mre.property-1.schema.json`; the
  vendors' written disclosure details only when p_details, otherwise named in `left_out.withheld`), `repo_party(pid)` (an owner on
  the property now, or a person on an agreement made in this round of owners; not contacts, not the pre-listing contact, not
  earlier rounds), `vendor_repo_list(p_property)` and `repo_vendor_can_read(name)` (items shared in this round, to `repo_party`
  only), `repo_shareable`, `repo_mime_ok`, `repo_object` (internal).
- `agent_reopen_property` replaced: the 013 body plus, for new owners, every shared item unshared (logged).
- Indexes on `path` and `thumb_path`; TRUNCATE revoked from anon and authenticated.
- Storage: bucket `property-files` (private, 25 MB, PDF, JPEG, PNG, WebP, Word, Excel, text and CSV). Agent reads and adds under
  `properties/<id>/docs|photos/`; no update or delete policy, and no vendor policy: vendors get a 600-second link from the
  `repo-link` edge function (`fn/repo_link.ts`, gateway JWT on), which asks `repo_vendor_can_read` with their own token.

## 017 Wellbeing (19 November 2026)
- `wellbeing_docs` (user_id, path, body jsonb, updated_at; primary key user_id + path). Tim's personal wellbeing app at
  `/wellbeing/`. `path` is `config/main` or `days/YYYY-MM-DD`. One policy, `wb_own`: the signed-in agent reads and writes
  only their own rows. Vendors and anon have no access. `wellbeing_touch` trigger sets `updated_at`.

## 018 The offer form (offers phase 1, 23 November 2026; written and tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project. The live rollback run must happen, with Tim's approval, before 018 is applied)
- `offer_links` (property_id, token 43 url-safe characters, open (default false), province (holidays for working days), chattels
  (the list Tim types; buyers see it), opened_at, closed_at, regenerated_at, updated_by). Agent reads; nobody writes directly.
- `offer_settings` (one row: ks_warn_working_days default 15, ai_daily_cap default 40, net_salt never readable by signed-in users).
- `offer_clauses` (Tim's own wording for electrical, technical, sale, sdd; REINZ conditions are never held). Agent reads.
- `offer_events`: permanent record (link made, opened, closed, regenerated, province, chattels; offer submitted, read, corrected with
  before, after and note, status, gap override). Agent reads; rows can't be changed or removed.
- `offer_hits`: rate limiting for the public door (hashed network address only). No policy at all; kept two days.
- `property_offers` gains source (manual, buyer, agent), submission (what was sent, never changed), details (as it stands),
  kiwisaver, lawyer_approval, needs_date_help, related_party, province, as_at, read_at/by, status_at/by, gap_override_reason/by/at,
  net_hash, notified_at, notify_error, suspected_spam (the form's hidden field was filled: kept, shown apart, nobody emailed).
  `guard_offer`: no offer is ever deleted; submission, source, property and net_hash never change; outside the functions a form
  offer may change only notes and expires_at; a 'manual' row (010) can't later be given a submission, details or the spam flag.
  `offer_events` and `property_offers` can't be truncated (statement triggers).
- Rate limits (offer_public_submit): 3 per network in 10 minutes and 10 a day; 60 per property in 10 minutes and 200 a day; 1000
  a day across all properties. Refusals name the limit (busy_network, busy_property, busy_site). Tokens that aren't live are
  counted per network (at most 30 an hour recorded) and never block a live token.
- Offer details (jsonb, `offer_clean`): email, phone (the buyer's own, never on the agreement), seen_docs, sign, price, settlement
  ({kind relative, days} or {kind date, date}), conditions ([{key, days or date, detail, wording, request, ai}]), lawyer_approval,
  sale_address, kiwisaver, entity, nominee, purchasers ([{first, last, email, phone}], 1 to 12), comments, lawyer ({firm, person,
  email, phone}, kept apart from the buyer's details), related, date_help, privacy, chattels_add, chattels_exclude,
  chattels_listed (from the link, never the page), gst_registered, gst_number, v.
- Public door, service role only (the offer-public edge function): `offer_public_info(token, net)`, `offer_public_submit(token,
  offer, net, spam)`, `offer_public_ai_claim(token, net)`, `offer_public_notified(offer, error)`. Anon and signed-in users can run none.
- Tim: `agent_offer_link(property, action get|open|close|regenerate|province, province)` (open only at signed, live or under
  offer), `agent_offer_add`, `agent_offer_correct(offer, details, note)`, `agent_offer_status(offer, withdrawn|lapsed|received, at,
  note)`, `agent_offer_read`, `agent_offer_gap(offer, reason)`, `agent_offer_settings(ks_days)`, `agent_offer_clause(key, wording)`,
  `agent_offer_chattels(property, items)`, `agent_offer_not_spam(offer)` (out of "Possible spam": a new unread offer, recorded). Vendors: no policy and no function: they see nothing.

## 019 Drafting offers onto the REINZ blank (offers phase 2, 23 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `repo_kinds` gains 'REINZ agreement blank' (agency, not shareable, not exported). `guard_blank_document`: a blank keeps its kind and
  is never shared; no other item becomes one. In `src/repo-core.js` it is in `SPECIAL_KINDS`, not the general uploader's list.
- `offer_blanks` (property_id, document_id unique, sha256 and size from the filed item, file_name, pages, sizes [[w,h]...], edition,
  edition_checked via `offer_edition_ok`). `offer_blank_maps` (blank_id, version, places, proposals with Tim's decisions, chattels,
  notes, missing, approved): every save a new version. `offer_blank_reads` (the AI's proposals, from the edge function).
- `offer_terms` (key, title, kind further_term or printed, clause number, wording (Tim's own only), wording_from (his offer_clauses
  key or custom), rule {when, strike_when_unused, where}, position, active) seeded with deposit_nzret 21.2, deposit_kiwisaver 21.3,
  lawyer_approval 22.0, electrical, technical, sale, sdd, custom, chattels. Switched off, never removed. `offer_term_changes`.
- `offer_drafts` (offer, property, number, blank and its sha256, map, details from the server, Tim's edits, placed, needs, path,
  sha256, size, note). `offer_draft_approvals` (draft unique, sha256, by, at). `offer_lawyer_lookups` (offer, firm, person, model,
  ok, result with each value's source).
- `offer_file_hashes` (path, sha256, size, confirmed_by, confirmed_at): the fingerprint of a stored blank or draft, worked out by the
  offer-draft edge function from the file itself (`offer_file_confirm`, service role). `agent_blank_add` and `agent_draft_add` accept
  only a fingerprint and size confirmed here. The edition, page sizes, places, what was placed and which items block come from Tim's
  screen and are trusted as such.
- All of these: agent read only; nobody writes directly; rows can't be changed or removed (`guard_offer_record`) or the tables
  emptied; vendors and anon see nothing.
- Functions (agent): `agent_blank_add(document, pages, sizes, edition)`, `agent_blank_map_save(blank, places, proposals, chattels,
  notes, missing, approve)` (approving sets the offer form's chattels), `agent_offer_term(key, title, wording, rule, position,
  active)`, `agent_draft_add(offer, map, path, sha256, size, placed, needs, edits, note)` (the newest approved map, the stored file
  checked), `agent_draft_approve(draft, sha256, checked)` (newest draft, the offer unchanged since, the newest approved
  places of the newest usable blank, nothing blocking except "ackable" items Tim ticked as checked, kept in `offer_draft_approvals.checked`), `agent_lawyer_use(lookup, keys)` (email and phone
  only, from the stored lookup). Service role (offer-draft): `offer_ai_read_save`, `offer_lawyer_save`, `offer_file_confirm`.

## 021 Condition timing (built as 022) and the review screen (24 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_clean` replaced: a condition may be `{key, after, days}` (within N working days, 1 to 250, of the date the condition `after`
  on the same offer is satisfied or waived); refused when it waits for itself or a condition not on the offer, loops, or runs more
  than three steps. `line_up: true` kept when the buyer asks for all conditions on the same day. Old `{days}`/`{date}` unchanged.
- `offer_box_ok(box, sizes, min)`, `offer_draft_edits_ok(edits, sizes)`: the shape of Tim's review-screen edits (marks, moves,
  added_terms, term_order, retired_numbers, term_timing); marks and moved places on a page of the blank. Not callable by users.
- `agent_draft_add` replaced: 019's, plus `offer_draft_edits_ok`.
- `offer_agent_ai_claim(actor, purpose)`: the daily cap (offer_settings.ai_daily_cap) for Tim's clause writer. One claim at a time
  (advisory transaction lock); counts ai_calls ('offer clause draft') since midnight NZ and, under the cap, inserts a reservation row
  (ok false, error 'pending') and returns its id. `offer_agent_ai_done(id, ok, error, in, out)` finishes that row after the model call.
  Both service role only.
- `offer_draft_edits_ok` also checks extra_terms (at most 60; a string up to 4,000, or {id, title up to 200, text up to 4,000, ai}),
  term_order entries (ids), items (id keys, text up to 4,000) and custom_wording.
- `agent_offer_correct(offer, details, note, expected)`: 018's correction, refused unless the offer's details are still `expected`
  (checked under the row lock). For corrections from the review screen.

## 022 Table privileges (24 November 2026, live)
- anon and authenticated lose TRUNCATE, TRIGGER and REFERENCES on every public table, and on tables made later by postgres. Revoke only.

## 023 Purchaser signing (offers phase 3, built as 020, 24 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_events` gains `chain` (the offer id, or `p:` and the property id), `seq`, `prev_hash`, `body` (the exact text fingerprinted) and
  `hash` = SHA-256 of prev_hash, a new line and body, set by the `offer_event_chain` trigger. Earlier events have none. `offer_chain_verify`.
- `offer_hits` kind check widened: also 'sign_code' and 'sign_try' (per-network limits on emailing and typing signing codes).
- `offer_signings` (draft, method in_person or link, pages, places and their SHA-256, cca_pages, status ready, signing, held, complete,
  locked, replaced or cancelled; one live signing per draft). `offer_signers` (per purchaser: name and own email from the draft's details; token, code and session as
  fingerprints only, never readable by signed-in users; consent, drawn signature and initials, ID type, witness, finished, seen_sha256,
  user agent, network fingerprint, void). `offer_sign_taps`, `offer_sign_receipts` (cca, sale_purchase), `offer_sign_marks` (note,
  strike, cross, reinstate), `offer_sign_reviews`, `offer_sign_asks`, `offer_rounds` (Round 1: path, server-confirmed SHA-256, execution
  record, chain_last). Agent read only; nothing written directly; signings and signers change only through the functions; everything
  else never changes; no table can be emptied; vendors and anon see nothing.
- Tim: `agent_signing_release`, `agent_signing_start`, `agent_signing_consent`, `agent_signing_receipt`, `agent_signing_marks`,
  `agent_signing_tap`, `agent_signing_finish` (ID type, or known_to_tim), `agent_signing_mark`, `agent_signing_review`,
  `agent_signing_cancel` (change the method before anyone starts), `agent_offer_chain_check`.
  Service role (offer-sign): `offer_sign_issue`, `offer_sign_open`, `offer_sign_code`, `offer_sign_verify`, `offer_sign_state`,
  `offer_sign_consent`, `offer_sign_receipt`, `offer_sign_marks`, `offer_sign_tap`, `offer_sign_ask`, `offer_sign_finish`,
  `offer_round_material`, `offer_round_lock`.

## 024 Presentation and counteroffers (offers phase 4, built as 021, 24 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_documents` (offer, number, draft and its sha256, status open, closed or agreed, closed_at/by/reason, agreed_at; one open per
  offer; changed only from open through the functions). Made when a Round 1 locks. `offer_agreements` (offer unique, document, round,
  path, sha256, size, agreement_date, date_text, accepted_at, record, chain_last, confirmed_by): never changed or removed.
- `offer_signings` gain round_no, side (purchaser or vendor), document_id, base_round_id (one live signing per draft and round).
  `offer_signers` gain person_id. `offer_rounds` gain document_id, doc_round, side, base_round_id, changes, lifted, outstanding (number
  keeps counting for the offer). `offer_sign_marks.kind` may be 'insert'; `offer_sign_receipts.guide` may be 'chattels'.
- Tim: `agent_round_present(offer, method, places, checked, note)`, `agent_round_change(signer, id, kind, page, geometry, target, places)`,
  `agent_offer_layers(offer, document)`, `agent_document_close(offer, reason)`, `agent_negotiation_withdraw(offer, side, at, note)`;
  `agent_offer_status` now stops signings in progress. Service role (offer-sign): `offer_sign_change`, `offer_agreement_material`,
  `offer_agreement_lock`; `offer_round_material` and `offer_round_lock` serve every round. Vendors: no policy and no agent function.
- After review: `offer_signings.status` may be 'withdrawn' (a side withdrew or declined). `offer_sign_reviews` gains `kind` (review or
  change) and `changed_by`; `reviewed_by` is for Tim's re-approvals only. `offer_hits.kind` may be 'sign_change'. `offer_settings` gains
  `resign_every_round` (default false; `agent_offer_negotiation_setting`). `offer_agreements` gains `round_sha256`, `draw_version` and
  `terms` (the agreed terms for later phases). `agent_offer_correct` refuses once agreed. `offer_private_hit` also checks
  `agreement_people`. Withdrawing, declining or lapsing closes the open document.
- Tim's answers: `offer_settings.link_changes_default` (default false, Tim, 24 November 2026; `agent_offer_link_changes_default`) and `offer_signings.link_changes`
  (set when Tim presents a round, `agent_round_present(..., p_link_changes)`); `offer_sign_change` refuses when it is off.
- Merged with main (branch `offers-live`): `offer_sign_state` also gives `signing.terms` (the newest draft's `term_last`, `retired_numbers`
  and further terms style; 23.0 style when the draft has no further terms), for a new further term in a counteroffer. 024's
  `agent_offer_correct(offer, details, note)` is the live 018 body plus the agreement refusal; 021's 4-argument version is unchanged.
- Emails as drafts (Tim, 24 November 2026; folded into 024): `offer_mail_drafts` (offer, signing, signer, agreement, kind sign_link,
  reopened, agreed_purchasers or agreed_vendors; to, cc, subject, body, attach; status draft, sent or void; reviewed, edited, sent and
  set-aside stamps; changed only through the functions and never once sent) and `offer_mail_log` (exactly what was sent, never changed).
  Tim: `agent_mail_draft_add`, `agent_mail_draft_edit`, `agent_mail_draft_review`, `agent_mail_draft_void`. Service role (offer-sign):
  `offer_mail_draft_sys` (reopened), `offer_mail_take` (a signing link's token is made here), `offer_mail_done`. Internal:
  `offer_mail_allowed`, `offer_mail_side_hit`, `offer_mail_check`. `link_changes_default` now defaults to false.
  `offer_sign_current` gives a party no reason beyond "no longer being signed". `agent_signing_release` refuses a draft without
  `term_last` or term boxes; `offer_sign_do_change` refuses a taken counteroffer term number. 023 adds `agent_signing_turn_ok`; its
  `agent_signing_finish` takes no identity choice as well; `offer_sign_places_ok` counts only block signatures.
- Second review (24 November 2026): a draft is 'sending' between `offer_mail_take` and `offer_mail_done`, and `offer_mail_log` rows go
  pending, then sent, failed or unconfirmed (only that outcome is ever filled in, once). `offer_mail_done(draft, log, actor, ok, error)`;
  `agent_mail_draft_unstick` (Tim checked a send that may have gone did not arrive). Sending refuses marked blanks. The vendors' agreed
  email may go only to this negotiation's vendor signers and the vendors' lawyer.
- Freeze and withdrawal (Tim, 24 November 2026): `offer_holds` (kind freeze | withdraw; side and person who directed a withdrawal;
  reason; told_at and told_how in_person | phone | email | link_request; request_id; made_by/at; a freeze lifted once with a note; a
  withdrawal never lifted; no delete) and `offer_requests` (a party's own request from their signing link: kind freeze | withdraw,
  reason_key from the list or 'other', reason, handled once as freeze | withdraw | carry_on). Both read by Tim only, written only by
  the functions (`guard_offer_hold`). `offer_hold_active(offer)`; `offer_sign_current` gives the neutral line while one is active, so
  every signer action, code, link and in-person turn stops; a requester alone is stopped by `offer_sign_ready` and `offer_sign_stop_for`
  ("Your request has gone to Tim. He will contact you straight away."). `agent_offer_freeze(offer, reason, asked_by, request)`,
  `agent_offer_unfreeze(offer, note)`, `agent_offer_withdraw_now(offer, side, person, reason, told_at, told_how, request)` (runs
  `agent_negotiation_withdraw`, then a permanent hold), `agent_offer_request_carry_on(request, note)`, and
  `offer_sign_request(token, session, kind, reason_key, reason, net)` (service role; the edge function then emails Tim at once).
  Presenting, releasing, the agreement and signing emails are refused while a hold is active. Mail kinds `withdraw_party` (the side
  that directed it and its lawyer) and `withdraw_lawyer` (the other side's lawyer only); `offer_mail_side(kind, signer, offer)`.
  023: `offer_sign_code` and `offer_sign_verify` refuse ('stopped') once `offer_sign_current` gives a reason.
- Deposit holder (Tim, 24 November 2026): `offer_deposit_holders` (append-only; holder nzret | vendor_lawyer | other with its text;
  recommended; kiwisaver; warned; by_default, true when the recommendation was used for the emails before Tim chose; with the
  agreement) and `agent_offer_deposit_holder(offer, holder, other, p_default)`. The newest row stands.
- Final review (25 November 2026): `withdraw_party` to the vendors goes only to this negotiation's vendor signers and the property's
  owners (`property_people.role = 'owner'`; never a contact or former owner). `offer_sign_request` locks the signer and allows one open
  request at a time. `offer_sign_ask` (and decline) refuses while frozen, withdrawn or with a request open; 023's `offer_sign_code` and
  `offer_sign_verify` use `offer_sign_stop_for` (023 defines it; 024 adds holds and requests). `offer_sign_do_finish` locks the offer,
  then the signing, then the signer, so a finish can't complete after a freeze. `agent_offer_withdraw_now` checks the request is this offer's.

