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
