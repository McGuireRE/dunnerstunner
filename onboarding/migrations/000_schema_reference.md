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
- One lock order everywhere (25 November 2026): the offer row first, then the signing (or draft), then the signer. Party and service
  steps take the offer FOR KEY SHARE first (`offer_lock_by_signer`, `offer_lock_by_signing`, 023); Tim's functions that change the
  offer's state (present, close, status, withdraw, withdraw now, freeze, unfreeze, correct, release, round and agreement locks, new
  email drafts) take it FOR UPDATE first. `offer_sign_ready` and `offer_sign_stop_for` give the neutral line before "replaced" once a
  hold is active, since a withdrawal voids places too.
  `offer_sign_ask` (Ask Tim for a change, Decline) takes the offer first too, and 024 redefines 019's `agent_draft_approve` word for
  word (checked against the live body by fingerprint) with the offer FOR UPDATE first; `agent_offer_deposit_holder` takes it FOR UPDATE.


## 025 The agent's own contact details, and the agreed copy emailed to Tim (Offers fixes 2, 25 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_settings.agent_phone` (default 027 562 7207) and `offer_settings.agent_email` (default hello@timmcguire.co.nz): the phone and email
  Tim's emails carry, in one place in the database (src/mail-core.js `TIM_PHONE` and fn/shared.ts `TIM_EMAIL` hold the same; a test keeps
  mail-core's equal to the default).
- `offer_agent_own()` → (emails text[], nsn text): every email in `agents` plus `agent_email`, and `agent_phone` as its national significant
  number (`offer_nsn`). Service role and definer functions only.
- `offer_mail_side_hit(offer, forbid, text)` redefined: as 024, except that a party email or phone equal to the agent's own is skipped
  (Tim's sign-off in an email to the purchasers on a property where Tim is the vendor, and the other way round). A real party's own phone
  or email is still refused; everything else is identical.
- `offer_agreed_notice_material(offer)` → jsonb (service role only; read only): the agreement (date, date text, fingerprint, path, size,
  terms), the address, the province, KiwiSaver, the draft's price place, the document's layers up to the agreed round (with every change's
  shape), and the newest deposit holder. The offer-sign function uses it to email Tim the locked dated copy when he confirms the agreement
  (and again from "Email me the agreed copy again"). Never used for an email to a party.
- After review: `offer_agent_contact()` → { phone, email } (service role), so the offer-sign function's wording reads the row at run time
  (Tim's screen reads `offer_settings` itself); `offer_agreed_notice_material` also gives `agency_agreement_id` (the property's newest
  signed agency agreement), so the agreed-copy email_log rows are filed with it; `offer_integrity_alarm(offer, what, detail)` (service
  role) puts an `integrity_alarm` event on the offer's hash-chained timeline when a stored copy doesn't match its fingerprint.
- `grant select (agent_phone, agent_email) on public.offer_settings to authenticated` (column privileges; never the salt).
- Rollback test: `tests/offer-mail-own-rollback.sql` (built by `tests/offer-mail-own-rollback.js`). Local run 25 November 2026 on the
  stand-in (pg-standin, 010, 016 part A, 018, 019, 021, 022, 023, 024): every line as expected, no CAPITALS. `offer_agreed_notice_material`
  was also run against the agreement 024's own rollback test makes (one block: 024, its checks to the agreement, then 025): it returned
  the agreement, three layers with the vendors' two changes, and the province.

## 026 Undo, going back to the last sealed round, and Confirm held while frozen (Offers fixes 3, 26 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_sign_undos` (append only, guard_offer_record, no truncate): signing, signer (whose work), `tap_id` or `mark_id` (one of
  them), action `undo` | `redo` (a place tapped again), scope `last` | `turn` | `round` (Tim) | `tap` (a redo), by_name, at. Taps and
  changes are never changed or removed; 023's triggers are unchanged.
- `offer_sign_redraws` (append only): a signature and initials drawn again (both, or both null for "cleared"), only once every tap
  of that signer has been undone. The first drawing stays in `offer_signers` (023's guard unchanged). `offer_sign_ink(signer)` gives
  the drawing as it stands (the newest redraw, else the first).
- Views, security invoker (Tim's own read rights apply; select only): `offer_sign_taps_live` (taps whose newest undo row is not an
  undo; `at` is when it was last tapped), `offer_sign_marks_live` (changes not undone), `offer_sign_reviews_live` (initials places
  whose marks are not all undone).
- `offer_confirm_holds`: offer, property, document, round (the newest sealed round), the freeze it was held under, accepted_at,
  date_text, agreement_date, held_by, held_at; resolved once (resolved_at, resolved_by, resolved_as `completed` | `discarded` |
  `superseded`, resolve_note) by the functions or the settle trigger (`guard_offer_confirm_hold`). One unresolved per offer.
  Triggers `offer_agreements_settle_holds` (completed, or superseded) and `offer_holds_settle_confirm` (a withdrawal: discarded).
- `offer_requests`: kind gains `revert`, handled_as gains `revert`, reason_key gains `material_change` (checks widened, nothing
  removed).
- Redefined to read what stands (each otherwise as 023/024 has it): `offer_sign_required`, `offer_doc_layers` (ink as it stands),
  `offer_sign_do_tap` (a redo for a place undone), `offer_sign_do_marks` (a redraw once every tap is undone), `offer_sign_do_finish`,
  `agent_signing_review`, `offer_sign_do_change`, `agent_round_present`, `agent_signing_mark`, `offer_round_lock`, `offer_agreed_terms`,
  `offer_round_material`, `offer_sign_state` (adds the signer's `last` step, `ever_tapped`, each change's `mine`, and `revert` when a
  freeze on the round has been lifted), `offer_sign_request` (kind `revert`, offered only then). `offer_agreement_check` now calls
  `offer_agreement_check_core(offer, accepted, date, ignore_freeze)` with false: the same for every caller as before.
- New: `offer_sign_do_undo(signer, scope, clear, by)` (internal), `agent_signing_undo(signer, scope, clear)` (Tim's device),
  `offer_sign_undo(token, session, scope, clear)` (service role), `agent_signing_revert_round(signing, reason)`,
  `agent_offer_revert_sealed(offer, note, request, unfreeze)`, `agent_offer_confirm_hold(offer, accepted_at, date_text)`,
  `agent_offer_confirm_held(offer)`, `agent_offer_confirm_hold_discard(offer, note)`, `offer_revert_offered(signing)` (internal: an
  `offer_unfrozen` event after the round's release on the offer's timeline). Lock order as everywhere: the offer first, then the
  signing, then the signer.
- After review: `guard_offer_sign_open_work` (before insert on `offer_sign_undos` and `offer_sign_redraws`): refused for a sealed or
  stopped round, for a signer, tap or change not of that round, and (round complete) for anything but Tim's start-again rows.
  `offer_mail_void_stale_reopened(signing, actor)` (internal) sets aside unsent `reopened` drafts that no longer ask for anything, after
  a change is undone or Tim starts the round again. Caps: 30 undos (sign_undone events) and 30 redos an hour per signer.
- Before go-live: `guard_offer_sign_open_work` is security definer and takes the offer FOR KEY SHARE, then the signing FOR SHARE, so a
  write during a round's lock waits and is refused. Race test: `tests/offer-undo-race.js` (local only, 26 November 2026: no errors).
- `offer_sign_do_tap` and `offer_sign_do_marks` take the signing FOR UPDATE after the offer and before the signer (their redo and redraw
  rows' guard reads the signing), so the lock order is the offer, the signing, the signer on every path that writes undo or redraw rows.
  The race test's 128 same-signer pairs (re-tap with undo, finish or change) ran with no deadlock.
- Events: `sign_undone`, `sign_redrawn`, `round_reset`, `round_reverted` (with what was discarded), `agreement_held`,
  `agreement_hold_discarded`; `offer_unfrozen` may carry `reverted: true`.
- Rollback test: `tests/offer-undo-rollback.sql` (built by `tests/offer-undo-rollback.js`). Local run 26 November 2026 on the stand-in
  (pg-standin, 010, 016 part A, 018, 019, 021, 022, 023, 024, 025): every line as expected, no CAPITALS. Also run on the stand-in with
  026 applied straight after 024: 024's own rollback test (output identical apart from the new tables in its truncate notice), 025's
  rollback test (identical) and 024's race test (no errors).

## 029 Signing places, chattels initials and four more marks (26 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_sign_marks`: kinds widened (nothing removed) with `own_initials`, `own_name`, `own_signature`; new column `ink_png` (only on a
  signer's own initials or signature: the database copies in that signer's own ink as it stands, `offer_sign_ink`); `offer_sign_marks_live`
  gains the column. Typed words (`insert`) may now be a Round 1 mark too. By link in Round 1 every mark kind (note, strike, cross, reinstate
  too) goes through `offer_sign_mark` (with a reinstatement's target) and holds the round as on Tim's screen.
- Triggers, before insert: `guard_offer_mark_place` (typed words and a signer's own marks sit inside the page, off the date place and off
  other signers' places; a signer's own mark carries exactly their own ink or name), `guard_offer_signing_chattels` (a side signing the
  whole agreement has each signer's initials inside the map's chattels area; refused with a plain message when the map has none).
- Functions: `offer_sign_do_mark` (inner), `offer_sign_mark` (service role, a link), `agent_signing_release_edited` and
  `agent_round_present_edited` (Tim's own changes to the places, recorded as `sign_places_edited`); helpers `offer_own_kind`,
  `offer_own_ok`, `offer_mark_rect`, `offer_hits_date`, `offer_overlap`, `offer_chattels_rect`, `offer_places_edits_ok`. Replaced word for
  word apart from the named lines: `agent_signing_mark`, `agent_signing_review`, `offer_round_lock`, `agent_round_present`,
  `offer_agreed_terms`, `offer_doc_layers`, `offer_round_material`, `offer_sign_state`. A signer's own mark is not a change (not counted,
  not initialled by others, not in the agreed terms' changes).
- Events: `sign_marked` (now with `by_link` and `text`), `sign_own_mark`, `sign_places_edited`.
- Rollback test: `tests/signing-marks-rollback.sql` (built by `tests/signing-marks-rollback.js`). Local run 26 November 2026 on the
  stand-in through 026: every line as expected, no CAPITALS. `tests/signing-marks-with-026.js`: 026's own rollback test with 029 applied
  straight after it gives the same lines (the counts include the chattels initials).
- Identity (Tim, 26 November 2026): `agent_signing_finish_checked` (offers in person: a photo ID type and Tim's tick; event
  `sign_id_checked`; 023's `agent_signing_finish` now refuses), `offer_photo_id_ok`; trigger `guard_signature_identity` on `signatures`,
  `variation_signatures` and `form_signatures` (in person: `snapshot.id_check` with type, tick, by, time, optional AML file, never a number;
  by link: no one else on the agreement with the same email). Layers and round material carry each signer's `id_checked_at`.
  The stand-in needs `tests/pg-standin-signatures.sql` for these tables.
  An explicit choice after a warning, to sign in person without an identity check, also passes (offers: `no_id_warned`, event
  `sign_no_id_check`, `no_id_check_at` on layers and round material; the agreement's tables: `id_check.type` none with `warned` and the
  note). An empty choice is refused. A vendor with no email may sign on Tim's device; Tim's handing over of the copy is an
  `agreement_events` row of kind `copy_handed_over`.

## 030 The agreed emails' lawyer cc (Agreed emails filled in, 26 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
- `offer_mail_allowed` redefined: as 024 (checked against the live body 26 November 2026), except that the `agreed_purchasers` branch
  also allows the agreed draft's `pl_email` and `pl_service` (the purchasers' lawyer as the contract's contact page has them; only text
  holding an @), unless it is a vendor's own address. After review: in `agreed_vendors`, a vendors' lawyer address (on the agreed draft,
  or the agency agreement's lawyer link) that is a purchaser's own is no longer allowed. New internal `offer_vendor_own_emails(offer)`
  and `offer_purchaser_own_emails(offer)` (each side's own addresses as `offer_mail_side_hit` reads them; Tim's own never a party's;
  the offer's lawyer email not the purchasers'). Every other kind is unchanged; execute revoked from public, anon and authenticated.
- Part 2 (Tim, 26 November 2026): `lawyer_links.phone` (text, optional; check `^[0-9+()\-. ]{6,40}$`, as the offer form's phones).
  Five-argument `vendor_send_to_lawyer`, `vendor_forward_to_lawyer` and `agent_send_to_lawyer` (`l_phone`) beside the four-argument ones,
  which are kept word for word; each is the old body with the phone checked (`offer_phone_ok`), stored and logged. A call without
  `l_phone` runs the old function. Execute: authenticated and service_role, not anon (as the old ones). Tim's own forward from the
  agreement page inserts the row with the phone itself (his `agent_all_lawyer` policy).
- Rollback test: `tests/agreed-mail-rollback.sql` (built by `tests/agreed-mail-rollback.js`). Local run 26 November 2026 on the stand-in
  (pg-standin, 010, 016 part A, 018, 019, 021 to 026, pg-standin-signatures, 029, then `tests/pg-standin-agency.sql`): every line as
  expected, no CAPITALS. `pg-standin-agency.sql` brings the agency agreement's tables, auth.users and their triggers and functions to
  the live definitions (read 27 November 2026; 28 functions checked identical to live by fingerprint); the block itself makes only
  fixtures, including a made-up auth.users row for the vendor (live's agreement_people.user_id key), and has 029's guard: a fixture
  error shows in CAPITALS. The first live run (before this) stopped at that key, nothing kept. The second (efb0d3c) read the vendor's log
  as the vendor, which live's RLS on agreement_events doesn't allow; the stand-in now has live's RLS and policies on those four
  tables, and the test reads the log after the role is reset.

## 028 The shared records (LW0, 26 November 2026; tested in a rollback block, NOT yet on the live project)
One home for each fact. Every new table has RLS; nobody writes them directly; every trigger here catches its own errors and records them
in `shared_record_log` (agent reads), so this layer can never stop a vendor's questionnaire, a signing or an offer. Signed records,
signatures and fingerprints are not touched.
- Property profile: `profile_keys` (the facts once: page 1's description keys, title and legal description, the council values; `vendor`
  false for `owners_relab`; `ql_column` the Quiet List column for the same fact), `property_fact_values` (every value from every source:
  council, reinz, relab, inspection, agreement, tim, first_visit, questionnaire, quiet_list; with display, source name, `as_of`,
  `recorded_at`, `recorded_by`; never changed or removed, `guard_fact_value`), `property_profile` (per property and fact: the chosen value,
  `chosen_by` auto or tim, `ticked`). `profile_record` (internal) decides, with p_choose: `tim` (Tim chose it here: chosen and ticked);
  `check` (a disclosures check answer: Tim's own choice, chosen and ticked, the file following as 012 writes it, unless an official figure
  from the property's documents differs, which then stays chosen, on the file and on an unsigned draft agreement, with his answer
  beside it); `agreement` (Tim's edit to page 1 of a draft agreement: his choice, chosen and ticked,
  the file following as 002 copies it; only a fact he cleared, a ticked official figure, or a value he chose on the profile after the
  agreement had one hold, with the agreement's value beside; after any agreement edit the file is put back to the profile wherever the
  profile keeps another value); bedrooms (`pBed`) are Tim's judgement: only his own entries (file, check, draft edit, profile choice) are
  ever chosen, all other counts sit beside; `profile_sync_draft` (internal) writes the chosen value to an agreement still a draft with nobody signed (never sent,
  parked or signed) when an official figure is chosen or holds, and when Tim chooses with `agent_profile_choose`; `official` (a record of title, cross lease or
  unit title document, or survey plan among `property_documents`, source `title`, from the reader's `read_result.fields` for land area and
  title reference that Tim ticked in the import review (`ticked`, with the value he `used`), trigger `profile_from_document`: chosen and
  ticked over a check answer or an informal value whichever came first, never over a fact he cleared or a value he chose on the profile
  once an official figure was there, which it sits beside; figures he didn't tick are suggestions, source `reader` ("not checked"), listed
  only; an archived document's figures go); `property_profile.chosen_by` `profile` marks Tim's own choice on the profile or file; `beside` (the backfill's council values and check answers: chosen and ticked unless Tim ticked a
  different value from another source or the chosen value is the property file's own, including a fact Tim cleared there; that then
  stays, with this one beside it; the backfill only lists official figures); `auto` (chosen only when nothing ticked stands, never over the property file's own
  value, never a record over a person's entry); `never` (kept as a value only). A source clearing its chosen value hands over to what the
  property file still says, else the newest other value. Whatever is chosen is written back to the file (`profile_sync_file`, internal;
  never to an agreement; skipped during the backfill, so applying 028 changes no property file). `profile_file_value` (internal). Values that
  are the same in another type (640 and "640") are not shown as different. Triggers: `profile_from_found` (council values Tim used are his;
  one that waited is a value only), `profile_from_inspection` (answers offered; his choice on the check applied), `profile_from_agreement`
  (page 1 as an automatic value). Read: `agent_property_profile(p)`, `my_property_profile(p)` (a party to the property, never Relab). Write:
  `agent_profile_set(p, key, value)` (Tim's entry on the file; clearing records his empty entry as the chosen one, not ticked, so no
  later source refills it by itself; `profile_read` gives it as `cleared`, with other values beside it),
  `agent_profile_choose(p, key, value_id)`, `agent_profile_tick(p, keys or null, on)`.
- Person: `person_links` (source property_people, agreement_people, prelisting, offer_signer, lawyer_link, ql_listing or ql_seller_lead,
  and its row; contact; property; role; `matched_by` email, name, record, new or tim; `doubt` and `doubt_contact_id` for Tim). Matching
  (`person_find`, `person_link`, `person_name_fits`, `person_joint`, `person_nick_fits`, `person_short_same`, all internal): the same email
  and a name that fits; with no email, the same legal name on the same property (a similar name there is kept apart and flagged). A name
  fits a checked legal name if it is the same person's name (`same_person_name`, or the same surname with a first name that fits: "Tim" for
  "Timothy"); an informal name also fits as the preferred name or a first name alone. A contact known only informally is filled by a name
  only when nothing contradicts it ("Bron" and "Bronwyn McGuire", never "Timothy John Smith"). A name that doesn't fit is never joined: a
  separate person with a doubt for Tim. A name holding two people ("A and B", "A & B") is never stored as one legal name and is flagged to be
  split. One email (or one name on a property) is matched at a time (advisory lock), so rows written together never make two records of
  one person. Triggers: `person_link_pp` (before; fills `property_people.contact_id`), `person_unlink_pp` (after delete: the link goes and
  the role it gave ends), `person_link_ap` (before; fills `agreement_people.contact_id` only while unsigned), `person_link_after` on
  prelistings, offer_signers (insert), lawyer_links and ql_seller_leads; `aml_file_contact` (a new AML file gets its person's contact).
  `agent_person_link_resolve(link, same)`: joining moves the row's working list with it (property_people, an unsigned agreement person, the
  Quiet List listing, answers filed with the row; never a signed row), ends the old record's role and archives a record left with nothing.
- Property and person link: `crm_property_links` is the home (role check gains trustee, executor and contact). It follows the name lists
  one way: property_people (and the other lists) write it through `person_link`, `person_unlink_pp` and `agent_person_link_resolve`; nothing
  edits it directly yet (People, P4, must write through these functions). property_people stays the working list of this round's owners
  (signing and vendor access read it). View `property_person_roles` (security invoker, agent only).
- Question bank: `qa_questions` (27 questions: goals, timing, price, plans, home and area, agents, the old questionnaire's nine, own words,
  and four of Tim's own, `vendor_visible` false) and `qa_answers` (question, property, contact, value, source appointment_confirmation,
  first_visit, questionnaire, quiet_list_seller_form, quiet_list_listing, seller_profile or tim; `source_ref`; `by_vendor`; `answered_at`;
  unique per question, source and source_ref). Triggers `qa_from_prelisting` (every answer to the questions before we meet, as saved),
  `qa_from_seller_lead`, `qa_from_profile` (crm_profiles seller: motivation, timeframe, price) and the Quiet List listing's m_* notes.
  `agent_qa_answer(...)`. A vendor reads their own answers (`qa_mine`) to vendor-visible questions only.
- Quiet List: `ql_listings` gains `property_id`, `vendor_contact_id`, `photo_doc_ids`. `ql_listing_shared` (before: empty fact columns filled
  from the profile when tied to a property; vendor linked) and `ql_listing_shared_after` (its facts as Quiet List values; Tim's notes to
  the bank). Its existing columns keep working.
- Photos and documents: `agent_ql_set_photos(listing, docs)` (photos of the listing's property only), `ql_listing_photos(listing)`,
  `inspection_photos(inspection)`. `property_inspections.photos` is no longer used (commented); no files move.
- Backfill: every name list linked (signed agreement people through person_links only), unlocked AML files filed with their contact and
  locked files' summary copied to the contact; each property file's own values on the profile first (as Tim's, "Property file"), then
  council values, agreements and inspections (a different value shown beside the file's); questionnaire answers into the bank. No property
  file changes. Preview from a copy of the live records: `tests/lw0-backfill-preview.sql` (result in `tests/out`, not committed).
- Privileges: every new definer function is closed to PUBLIC and anon; `profile_vendor_key` and `qa_mine` (read inside the vendor
  policies) are open to signed-in users only; the internal helpers to nobody but the functions that call them.
- Rollback test: `tests/shared-records-rollback.sql` (built by `tests/shared-records-rollback.js`); quick local stand-in
  `tests/lw0-standin-030.sql` (run on the stand-in built through 030: brings every table, policy and helper 028 builds on to its live
  definition, including 012's own `agent_inspection_save` and the questionnaire's triggers). Applying 028 needs 030 first.

## 031 The First visit (LW1, 27 November 2026; tested in a rollback block on a local PostgreSQL stand-in through 028, NOT yet on the live project)
- `first_visits` (id made on the phone, property_id, started_from address/appointment/nothing, prelisting_id, notes, decision present_now/book,
  decision_at, next_note, started_at, created_by), `first_visit_people` (id made on the phone, first_visit_id, property_person_id, contact_id,
  decision_maker, here), `property_rooms` (id made on the phone, property_id, first_visit_id, base, label, position, notes, measurements,
  features, use_now, tim_class bedroom/study/office/living/studio/sleepout/flexible, tim_note, vendor_view, photo_keys (property_documents
  client keys), archived_at), `tap_list_extras` (list, item, archived_at). RLS on all four: Tim reads; nobody writes directly; vendors none.
- `profile_keys` gains rooms_summary, dwellings, living_dining, extra_spaces, ensuites, toilets, garaging, parking_spaces, cladding, roofing,
  insulation, flooring, glazing, levels, chattels_std, chattels_featured, chattels_removed, outdoor, outlook. `qa_questions` gains why_talk and
  client_heart (not vendor_visible), story_* (six), ib_* (eight) and ideal_for.
- Functions (agent only): `agent_fv_start(id, property, address, from, prelisting, started_at)`, `agent_fv_set(id, patch)`,
  `agent_fv_person(visit, key, name, email, phone, owner, decision_maker, here)`, `agent_fv_answer(visit, person, question, value)`,
  `agent_fv_room(visit, room)`, `agent_fv_fact(visit, key, value)`, `agent_tap_extra(list, item, on)`. Internal: `fv_rooms_profile`
  (pBed and rooms_summary from Tim's calls only), `fv_fact_keys`, `fv_today`, `room_class_ok`.
- One chattels list: `fv_chattels_profile` (from `agent_fv_fact`) writes the profile's `chattels` and `chatOther` from the first visit's lists
  (`fv_chattels_agreement`, `fv_chattel_map`, `fv_agreement_chattels`) and an unsigned draft through `profile_sync_draft`; Tim's later draft
  edit wins. Trigger `profile_fv_chattels` (after update of answers on agreements, drafts only, `fv_chattels_from_agreement`) brings the
  agreement's chips back to `chattels_std` and `chattels_featured`. Helpers `fv_chosen`, `fv_chattel_name`, `fv_chattel_count` are internal.
- The visit's own values go through `fv_record` (only when new; beside, not chosen, once something else was chosen after the visit first
  noted the fact) and `fv_clear` (only the visit's own chosen value, with the file and an unsigned draft that still says it). Both internal.

## 033 Appraisal set-up (LW3 phase A, 27 November 2026; tested in a rollback block on a local PostgreSQL stand-in, NOT yet on the live project)
Builds on 032 (`appraisal_views`, live: one presentable appraisal per row, sections and fields in JSON, Tim only). Additive:
- `appraisal_views.setup` jsonb object, default `{}`: Tim's choices on the set-up page (`v` 1, `tabs`, `preparedFor`, `suburb`, `suburbLink`,
  `note`, `campaign` {kind standard|larger|land|weeks, weeks}, `method` deadline|tender|auction|eoi|negotiation, `methodText`, `basis`,
  `plan` digital|premium|elite|custom, `header` claude|own). A row with no `setup.v` (the one loaded by hand) is drawn and edited as in 032.
- `appraisal_views.kind` text, default 'standard', check standard|bespoke (bespoke comes in phase D).
- `appraisal_views.private_notes` text, default '': Tim's own notes, weak points included; never drawn on the vendor's page.
- `appraisal_views.status` check now draft|presented|archived|ready|sent (values added only).
- `ai_calls.appraisal_id` uuid, nullable, references appraisal_views on delete set null.
- `appraisal_wording_problem(jsonb)` (not callable by users): every string in the value, checked for "as is", fee and commission.
- `agent_appraisal_create(p_property, p_address, p_kind)`: is_agent; from a property on file, or from an address (a new property file,
  refused if the address is already on file); returns appraisal_id, property_id, created_property.
- `agent_appraisal_save(p_id, p_setup, p_fields, p_sections, p_title, p_prepared_for, p_private_notes, p_status)`: is_agent; a null leaves that
  part alone; refuses a sent appraisal, setting 'sent', the wording guard's finds (not on private notes), and a range without both
  figures or with its low not below its high; sets prepared_on the first time.
Both agent functions: security definer, search_path public, revoked from public and anon, granted to authenticated.
Tests: tests/appraisal-setup-rollback.js/.sql on tests/appraisal-setup-standin.sql; browser test tests/appraisal-setup.test.js.

## 034 Appraisal comparables, photos, the never-mix list and the market store (LW3 phase C, 27 November 2026; tested in a rollback block on a local PostgreSQL stand-in built to live 033, NOT yet on the live project)
Builds on 033 (live). Additive, plus `agent_appraisal_create` replaced with the same signature. Row Level Security on every new table:
one `for all` policy each, `to authenticated`, `is_agent()` both ways; nothing for anon (revoked) or vendors; truncate, trigger and
references revoked from authenticated.
- `appraisal_comps`: appraisal_id (cascade), position, shown, status sold|listed|context, address (3 to 300), suburb, price, sold_on,
  listed_on, method, days_to_sell, bedrooms, bathrooms (one decimal), floor_m2, land_m2, cv, agency, sold_by_tim, ad_text (quoted listing
  words, up to 8,000), compare_text and compare_ticked (only ticked wording reaches a vendor), private_note (Tim only, never drawn),
  ring suburb|750m|1500m|further, distance_m, source reinz|relab|listing|tim|other, source_ref (unique per appraisal and source),
  source_url (https only), gathered_at, photo_hints (jsonb list of {file, url} from a pack), created_by, created_at, updated_at.
  `guard_appraisal_comp`: nothing changes on a sent appraisal; a comparable stays on its appraisal; the wording guard on compare_text
  and method (ad_text is a quote: stored as given, shown only if it passes the guard).
- `appraisal_media`: appraisal_id (cascade), comp_id (cascade), path (unique, under appraisals/<appraisal>/comps/), file_name, mime_type
  and size_bytes (read from storage by the guard, never from the page), width, height, position, cover (the print photo), source
  upload|folder|url, source_url. `guard_appraisal_media`: not on a sent appraisal; the comparable belongs to the appraisal; the file is in
  storage already and is a JPEG, PNG or WebP; path, type, size and source never change.
- `suburb_groups` (Tim's never-mix list): name, kind never_mix, suburbs text[] (1 to 40), note.
- `market_months` (shared store): area, month (first of the month), median, lower_quartile, upper_quartile, sales, days_to_sell, bands
  (jsonb list of {from, to, count}), source, source_url, gathered_at; unique (area, month).
- `market_sales`: suburb, sold_on, price (public); address (Tim only); bedrooms, bathrooms, floor_m2, land_m2, property_type,
  days_to_sell, source, source_ref (unique with source), gathered_at.
- `guard_appraisal_view` on appraisal_views (before insert, update, delete): a 'sent' row never changes and is never removed; 'sent' is
  set only when `app.appraisal_send` is 'on' (phase E's send function, set_config(..., true) for its own transaction); the wording guard
  on every insert and on any update of title, sections, fields, setup, prepared_for or address. The 032 policies are unchanged.
- Functions (security definer, search_path public, revoked from public and anon, granted to authenticated; each checks is_agent):
  `agent_comps_import(p_appraisal, p_pack)` (pack mre.comps/1, APPRAISAL-PLAN.md; returns added, updated, kept_ticked, skipped, notes),
  `agent_comps_order(p_appraisal, p_ids)`, `agent_market_import(p_pack)` (pack mre.market/1; returns months_added, months_updated,
  sales_added, sales_updated, skipped). Internal (not callable by users): `appraisal_addr_parts`, `appraisal_addr_match` ('same', 'maybe'
  or ''), `appraisal_addr_same`,
  `appraisal_pack_text`, `_num`, `_date`, `_url`, `_ts`, and the three guards.
- `agent_appraisal_create(p_property, p_address, p_kind default 'standard', p_different default false)` (replaces the 033 three-argument
  function; existing calls work unchanged): the 033 body, plus a 'same' near-duplicate of an address on file (same number, street and
  suburb, or no suburb on either; no two different postcodes) is refused naming that property, unless p_different, when a new file is
  started and recorded in `property_events` (kind filed_as_different, detail {address, like: [{id, address}], appraisal_id}). A 'maybe'
  (one side names a suburb the other leaves out) is never refused: the page offers it.
- Storage: bucket `appraisal-media` (private, 15 MB, JPEG, PNG, WebP). Policies on storage.objects: `appraisal_media_agent_read`
  (select), `appraisal_media_agent_add` (insert under appraisals/<id>/comps/), `appraisal_media_agent_remove` (delete, not when the
  appraisal is sent). No vendor policy (phase E gives vendors short-lived links).
Tests: tests/appraisal-comps-rollback.js/.sql on tests/appraisal-comps-standin.sql (after appraisal-setup-standin.sql and 033); browser
test tests/appraisal-comps.test.js; address cases tests/files/addr-cases.json (both the SQL and the page run them).

## 035 Comparables from an uploaded report, photos from a listing page, case-by-case suburbs (LW3 phase C2, 27 November 2026; tested in a rollback block on a local PostgreSQL stand-in built to live 033 plus 034 and the live document store, NOT yet on the live project)
Builds on 034 (apply 034 first). Additive only: no existing column, row, policy, function or signed-record protection changes.
- `repo_kinds`: 'Comparables or market report' (agency, position 216, never shared, never exported). `guard_report_document` (before
  update on property_documents): such a report keeps its kind and is never shared; no other item becomes one.
- `appraisal_reports`: appraisal_id (cascade), document_id (property_documents), result (jsonb: report, comps and market, each item with
  its id and page), model, pages, read_by, read_at, imported (the ticked ids), imported_by, imported_at. Row Level Security: select for
  is_agent() only; insert, update, delete, truncate revoked from authenticated, everything from anon. `guard_appraisal_report`: a
  reading never changes, Tim's ticks are recorded once, nothing on a sent appraisal, kept unless its appraisal goes.
- `appraisal_buyer_checks`: appraisal_id (cascade), subject ({verdict owner|investor|unclear, reason}), comps ({comp id: {verdict,
  reason}}), model, checked_by, checked_at. Same access as appraisal_reports. `guard_buyer_check`: never changes, kept, none added once
  sent. Tim's only: never on a vendor page.
- `appraisal_media.page_url` (http or https, up to 1,000): the listing page a fetched photo came from; `guard_media_page_url` keeps it.
- `suburb_groups.mode` never_mix (default; every existing group) | case_by_case.
- Functions: `agent_report_imported(p_report, p_comps text[], p_months text[])` (security definer, is_agent, granted to authenticated).
  Service role only (revoked from public, anon and authenticated; granted to service_role), used by doc-prefill:
  `appraisal_report_source(p_appraisal, p_document)` (the appraisal from its set-up and not sent; the document a comparables report, a PDF
  in property-files, on the appraisal's property, not removed; returns its path), `appraisal_report_save(...)`, `appraisal_buyer_save(...)`.
Tests: tests/appraisal-reports-rollback.js/.sql on tests/appraisal-reports-standin.sql (after the 034 chain); browser test
tests/appraisal-c2.test.js; function tests tests/appraisal-fetch-fn.test.js and tests/appraisal-ai-fn.test.js.
