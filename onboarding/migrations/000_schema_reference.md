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
