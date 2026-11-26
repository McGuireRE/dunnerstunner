-- Added to the local PostgreSQL stand-in built through 030 (tests/pg-standin.sql, 010, 016 part A, 018, 019, 021 to 026,
-- tests/pg-standin-signatures.sql, 029, tests/pg-standin-agency.sql, 030) for migration 028's rollback test: every table and helper 028
-- builds on, brought to its LIVE definition, read with SELECTs on pg_catalog on 27 November 2026 (never written to the live project):
-- the columns (types, defaults, NOT NULLs) of the tables 028 and its test touch, their checks, unique keys and foreign keys
-- (agreement_people.user_id to auth.users included, as live), the crm tables, the questionnaire (prelistings), the Quiet List tables,
-- and these functions word for word: crm_norm_value, stamp_ts, inspection_decl_keys, inspection_note_keys, pl_mine, pl_save,
-- agent_inspection_start, agent_inspection_save (012, the real one: it writes the file and the draft agreement and records conflicts),
-- crm_aml_sync, crm_methods_before, is_property_party, prelisting_before (a questionnaire's contact becomes one of the property's people),
-- prelisting_after, touch_prelisting, ql_listing_ref; with their live triggers.
-- Row level security as live: every policy on these tables replaced by the live ones, word for word.
-- Left out: aml_on_lock and aml_lock_guard on aml_files (the test never updates an AML file).
-- Run once on that stand-in, before 028. NEVER on the live project.

set search_path = public, extensions;
create sequence if not exists public.ql_listing_seq;
-- crm_contacts
create table if not exists public.crm_contacts (id uuid primary key default gen_random_uuid());
alter table public.crm_contacts add column if not exists id uuid default gen_random_uuid() not null;
alter table public.crm_contacts add column if not exists kind text default 'person'::text not null;
alter table public.crm_contacts add column if not exists display_name text not null;
alter table public.crm_contacts add column if not exists first_name text;
alter table public.crm_contacts add column if not exists last_name text;
alter table public.crm_contacts add column if not exists preferred_name text;
alter table public.crm_contacts add column if not exists legal_name text;
alter table public.crm_contacts add column if not exists salutation text;
alter table public.crm_contacts add column if not exists organisation_name text;
alter table public.crm_contacts add column if not exists status text default 'active'::text not null;
alter table public.crm_contacts add column if not exists lead_source text;
alter table public.crm_contacts add column if not exists primary_agent_email text;
alter table public.crm_contacts add column if not exists summary text;
alter table public.crm_contacts add column if not exists notes text;
alter table public.crm_contacts add column if not exists marketing_consent text default 'unknown'::text not null;
alter table public.crm_contacts add column if not exists consent_source text;
alter table public.crm_contacts add column if not exists consent_at timestamp with time zone;
alter table public.crm_contacts add column if not exists lockedon_client_id text;
alter table public.crm_contacts add column if not exists external_ids jsonb default '{}'::jsonb not null;
alter table public.crm_contacts add column if not exists custom jsonb default '{}'::jsonb not null;
alter table public.crm_contacts add column if not exists last_contacted_at timestamp with time zone;
alter table public.crm_contacts add column if not exists created_at timestamp with time zone default now() not null;
alter table public.crm_contacts add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.crm_contacts add column if not exists archived_at timestamp with time zone;
alter table public.crm_contacts add column if not exists aml_status text default 'none'::text not null;
alter table public.crm_contacts add column if not exists aml_checked_at timestamp with time zone;
alter table public.crm_contacts add column if not exists aml_cdd_level text;
alter table public.crm_contacts add column if not exists aml_risk text;
alter table public.crm_contacts add column if not exists aml_pep text;
alter table public.crm_contacts add column if not exists aml_next_review_on date;
alter table public.crm_contacts add column if not exists aml_latest_file_id uuid;
-- crm_contact_methods
create table if not exists public.crm_contact_methods (id uuid primary key default gen_random_uuid());
alter table public.crm_contact_methods add column if not exists id uuid default gen_random_uuid() not null;
alter table public.crm_contact_methods add column if not exists contact_id uuid not null;
alter table public.crm_contact_methods add column if not exists kind text not null;
alter table public.crm_contact_methods add column if not exists label text;
alter table public.crm_contact_methods add column if not exists value text not null;
alter table public.crm_contact_methods add column if not exists value_norm text default ''::text not null;
alter table public.crm_contact_methods add column if not exists is_primary boolean default false not null;
alter table public.crm_contact_methods add column if not exists opted_out_at timestamp with time zone;
alter table public.crm_contact_methods add column if not exists bounced_at timestamp with time zone;
alter table public.crm_contact_methods add column if not exists source text;
alter table public.crm_contact_methods add column if not exists created_at timestamp with time zone default now() not null;
-- crm_property_links
create table if not exists public.crm_property_links (id uuid primary key default gen_random_uuid());
alter table public.crm_property_links add column if not exists id uuid default gen_random_uuid() not null;
alter table public.crm_property_links add column if not exists contact_id uuid not null;
alter table public.crm_property_links add column if not exists property_id uuid not null;
alter table public.crm_property_links add column if not exists role text not null;
alter table public.crm_property_links add column if not exists is_current boolean default true not null;
alter table public.crm_property_links add column if not exists started_on date;
alter table public.crm_property_links add column if not exists ended_on date;
alter table public.crm_property_links add column if not exists notes text;
alter table public.crm_property_links add column if not exists source text;
alter table public.crm_property_links add column if not exists created_at timestamp with time zone default now() not null;
alter table public.crm_property_links add column if not exists updated_at timestamp with time zone default now() not null;
-- crm_profiles
create table if not exists public.crm_profiles (id uuid primary key default gen_random_uuid());
alter table public.crm_profiles add column if not exists id uuid default gen_random_uuid() not null;
alter table public.crm_profiles add column if not exists contact_id uuid not null;
alter table public.crm_profiles add column if not exists profile_type text not null;
alter table public.crm_profiles add column if not exists status text default 'active'::text not null;
alter table public.crm_profiles add column if not exists property_id uuid;
alter table public.crm_profiles add column if not exists price_min numeric;
alter table public.crm_profiles add column if not exists price_max numeric;
alter table public.crm_profiles add column if not exists suburbs text[] default '{}'::text[] not null;
alter table public.crm_profiles add column if not exists bedrooms_min integer;
alter table public.crm_profiles add column if not exists criteria jsonb default '{}'::jsonb not null;
alter table public.crm_profiles add column if not exists motivation text;
alter table public.crm_profiles add column if not exists timeframe text;
alter table public.crm_profiles add column if not exists price_expectation numeric;
alter table public.crm_profiles add column if not exists notes text;
alter table public.crm_profiles add column if not exists source text;
alter table public.crm_profiles add column if not exists created_at timestamp with time zone default now() not null;
alter table public.crm_profiles add column if not exists updated_at timestamp with time zone default now() not null;
-- prelistings
create table if not exists public.prelistings (id uuid primary key default gen_random_uuid());
alter table public.prelistings add column if not exists id uuid default gen_random_uuid() not null;
alter table public.prelistings add column if not exists address text not null;
alter table public.prelistings add column if not exists contact_name text;
alter table public.prelistings add column if not exists contact_email text not null;
alter table public.prelistings add column if not exists status text default 'appraisal'::text not null;
alter table public.prelistings add column if not exists appraisal jsonb default '{}'::jsonb not null;
alter table public.prelistings add column if not exists answers jsonb default '{}'::jsonb not null;
alter table public.prelistings add column if not exists plan jsonb default '{}'::jsonb not null;
alter table public.prelistings add column if not exists question text;
alter table public.prelistings add column if not exists agreement_id uuid;
alter table public.prelistings add column if not exists user_id uuid;
alter table public.prelistings add column if not exists created_at timestamp with time zone default now() not null;
alter table public.prelistings add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.prelistings add column if not exists invited_at timestamp with time zone;
alter table public.prelistings add column if not exists proceeded_at timestamp with time zone;
alter table public.prelistings add column if not exists submitted_at timestamp with time zone;
alter table public.prelistings add column if not exists plan_published_at timestamp with time zone;
alter table public.prelistings add column if not exists question_at timestamp with time zone;
alter table public.prelistings add column if not exists accepted_at timestamp with time zone;
alter table public.prelistings add column if not exists property_id uuid;
-- ql_listings
create table if not exists public.ql_listings (id uuid primary key default gen_random_uuid());
alter table public.ql_listings add column if not exists id uuid default gen_random_uuid() not null;
alter table public.ql_listings add column if not exists ref text;
alter table public.ql_listings add column if not exists status text default 'draft'::text not null;
alter table public.ql_listings add column if not exists headline text;
alter table public.ql_listings add column if not exists street text;
alter table public.ql_listings add column if not exists show_street boolean default false not null;
alter table public.ql_listings add column if not exists suburb text;
alter table public.ql_listings add column if not exists city text default 'Dunedin'::text not null;
alter table public.ql_listings add column if not exists property_type text;
alter table public.ql_listings add column if not exists beds integer;
alter table public.ql_listings add column if not exists baths numeric;
alter table public.ql_listings add column if not exists living integer;
alter table public.ql_listings add column if not exists parking integer;
alter table public.ql_listings add column if not exists land_m2 numeric;
alter table public.ql_listings add column if not exists floor_m2 numeric;
alter table public.ql_listings add column if not exists year_built text;
alter table public.ql_listings add column if not exists price_display text;
alter table public.ql_listings add column if not exists qualify_price numeric;
alter table public.ql_listings add column if not exists req_cash boolean default false not null;
alter table public.ql_listings add column if not exists req_no_sale boolean default false not null;
alter table public.ql_listings add column if not exists description text;
alter table public.ql_listings add column if not exists features text[] default '{}'::text[] not null;
alter table public.ql_listings add column if not exists viewing text;
alter table public.ql_listings add column if not exists rv numeric;
alter table public.ql_listings add column if not exists photos jsonb default '[]'::jsonb not null;
alter table public.ql_listings add column if not exists agreement_id uuid;
alter table public.ql_listings add column if not exists published_at timestamp with time zone;
alter table public.ql_listings add column if not exists created_at timestamp with time zone default now() not null;
alter table public.ql_listings add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.ql_listings add column if not exists vendor_name text;
alter table public.ql_listings add column if not exists vendor_email text;
alter table public.ql_listings add column if not exists vendor_phone text;
alter table public.ql_listings add column if not exists vendor_token text default encode(gen_random_bytes(18), 'hex'::text);
alter table public.ql_listings add column if not exists m_price text;
alter table public.ql_listings add column if not exists m_motivation text;
alter table public.ql_listings add column if not exists m_time text;
alter table public.ql_listings add column if not exists m_notes text;
alter table public.ql_listings add column if not exists discretion boolean default false not null;
alter table public.ql_listings add column if not exists nudges text default 'auto'::text not null;
alter table public.ql_listings add column if not exists leeway_review date;
alter table public.ql_listings add column if not exists nudge_stage integer default 0 not null;
alter table public.ql_listings add column if not exists last_nudge_at timestamp with time zone;
alter table public.ql_listings add column if not exists market_interest_at timestamp with time zone;
alter table public.ql_listings add column if not exists to_market_at timestamp with time zone;
alter table public.ql_listings add column if not exists share_enabled boolean default false not null;
alter table public.ql_listings add column if not exists share_slug text;
alter table public.ql_listings add column if not exists share_summary text;
alter table public.ql_listings add column if not exists share_photo text;
alter table public.ql_listings add column if not exists share_image_url text;
alter table public.ql_listings add column if not exists share_show_price boolean default false not null;
alter table public.ql_listings add column if not exists share_show_street boolean default false not null;
alter table public.ql_listings add column if not exists agreement_held boolean default false not null;
alter table public.ql_listings add column if not exists seller_price_low numeric;
alter table public.ql_listings add column if not exists seller_price_high numeric;
-- ql_seller_leads
create table if not exists public.ql_seller_leads (id uuid primary key default gen_random_uuid());
alter table public.ql_seller_leads add column if not exists id uuid default gen_random_uuid() not null;
alter table public.ql_seller_leads add column if not exists created_at timestamp with time zone default now() not null;
alter table public.ql_seller_leads add column if not exists name text not null;
alter table public.ql_seller_leads add column if not exists email text not null;
alter table public.ql_seller_leads add column if not exists phone text not null;
alter table public.ql_seller_leads add column if not exists address text not null;
alter table public.ql_seller_leads add column if not exists property_type text;
alter table public.ql_seller_leads add column if not exists beds text;
alter table public.ql_seller_leads add column if not exists expected_price text;
alter table public.ql_seller_leads add column if not exists appraised text;
alter table public.ql_seller_leads add column if not exists reason text;
alter table public.ql_seller_leads add column if not exists motivation text;
alter table public.ql_seller_leads add column if not exists "time" text;
alter table public.ql_seller_leads add column if not exists time_when text;
alter table public.ql_seller_leads add column if not exists privacy text;
alter table public.ql_seller_leads add column if not exists also_buying boolean default false not null;
alter table public.ql_seller_leads add column if not exists comments text;
alter table public.ql_seller_leads add column if not exists status text default 'new'::text not null;
alter table public.ql_seller_leads add column if not exists notified_at timestamp with time zone;
alter table public.ql_seller_leads add column if not exists listing_id uuid;
alter table public.ql_seller_leads add column if not exists price_low numeric;
alter table public.ql_seller_leads add column if not exists price_high numeric;
-- properties
create table if not exists public.properties (id uuid primary key default gen_random_uuid());
alter table public.properties add column if not exists id uuid default gen_random_uuid() not null;
alter table public.properties add column if not exists address text default ''::text not null;
alter table public.properties add column if not exists title_ref text;
alter table public.properties add column if not exists legal_description text;
alter table public.properties add column if not exists owners_on_title text;
alter table public.properties add column if not exists ownership jsonb default '{}'::jsonb not null;
alter table public.properties add column if not exists description jsonb default '{}'::jsonb not null;
alter table public.properties add column if not exists disclosures jsonb default '{}'::jsonb not null;
alter table public.properties add column if not exists stage text default 'appraisal'::text not null;
alter table public.properties add column if not exists stage_at timestamp with time zone default now() not null;
alter table public.properties add column if not exists created_at timestamp with time zone default now() not null;
alter table public.properties add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.properties add column if not exists cycle_at timestamp with time zone;
alter table public.properties add column if not exists found jsonb default '{}'::jsonb not null;
alter table public.properties add column if not exists provenance jsonb default '{}'::jsonb not null;
-- property_people
create table if not exists public.property_people (id uuid primary key default gen_random_uuid());
alter table public.property_people add column if not exists id uuid default gen_random_uuid() not null;
alter table public.property_people add column if not exists property_id uuid not null;
alter table public.property_people add column if not exists "position" integer default 1 not null;
alter table public.property_people add column if not exists legal_name text default ''::text not null;
alter table public.property_people add column if not exists pref_name text default ''::text not null;
alter table public.property_people add column if not exists email text default ''::text not null;
alter table public.property_people add column if not exists phone text default ''::text not null;
alter table public.property_people add column if not exists user_id uuid;
alter table public.property_people add column if not exists source text;
alter table public.property_people add column if not exists created_at timestamp with time zone default now() not null;
alter table public.property_people add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.property_people add column if not exists role text default 'owner'::text not null;
alter table public.property_people add column if not exists name_from text;
alter table public.property_people add column if not exists contact_id uuid;
-- agreements
create table if not exists public.agreements (id uuid primary key default gen_random_uuid());
alter table public.agreements add column if not exists id uuid default gen_random_uuid() not null;
alter table public.agreements add column if not exists ref text;
alter table public.agreements add column if not exists address text default ''::text not null;
alter table public.agreements add column if not exists status text default 'draft'::text not null;
alter table public.agreements add column if not exists agreement_version text default 'v3.15-26102026'::text not null;
alter table public.agreements add column if not exists config jsonb default '{}'::jsonb not null;
alter table public.agreements add column if not exists answers jsonb default '{}'::jsonb not null;
alter table public.agreements add column if not exists legal jsonb default '{}'::jsonb not null;
alter table public.agreements add column if not exists sent_at timestamp with time zone;
alter table public.agreements add column if not exists signed_at timestamp with time zone;
alter table public.agreements add column if not exists copy_sent_at timestamp with time zone;
alter table public.agreements add column if not exists cooling_off_until timestamp with time zone;
alter table public.agreements add column if not exists countersigned_at timestamp with time zone;
alter table public.agreements add column if not exists ended_at timestamp with time zone;
alter table public.agreements add column if not exists created_at timestamp with time zone default now() not null;
alter table public.agreements add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.agreements add column if not exists copy_error text;
alter table public.agreements add column if not exists property_id uuid;
-- agreement_people
create table if not exists public.agreement_people (id uuid primary key default gen_random_uuid());
alter table public.agreement_people add column if not exists id uuid default gen_random_uuid() not null;
alter table public.agreement_people add column if not exists agreement_id uuid not null;
alter table public.agreement_people add column if not exists "position" integer default 1 not null;
alter table public.agreement_people add column if not exists legal_name text default ''::text not null;
alter table public.agreement_people add column if not exists pref_name text default ''::text not null;
alter table public.agreement_people add column if not exists email text default ''::text not null;
alter table public.agreement_people add column if not exists phone text default ''::text not null;
alter table public.agreement_people add column if not exists user_id uuid;
alter table public.agreement_people add column if not exists id_verified_at timestamp with time zone;
alter table public.agreement_people add column if not exists signed_at timestamp with time zone;
alter table public.agreement_people add column if not exists created_at timestamp with time zone default now() not null;
alter table public.agreement_people add column if not exists contact_id uuid;
-- lawyer_links
create table if not exists public.lawyer_links (id uuid primary key default gen_random_uuid());
alter table public.lawyer_links add column if not exists id uuid default gen_random_uuid() not null;
alter table public.lawyer_links add column if not exists agreement_id uuid not null;
alter table public.lawyer_links add column if not exists token text default encode(gen_random_bytes(24), 'hex'::text) not null;
alter table public.lawyer_links add column if not exists lawyer_name text not null;
alter table public.lawyer_links add column if not exists firm text default ''::text not null;
alter table public.lawyer_links add column if not exists email text not null;
alter table public.lawyer_links add column if not exists sent_at timestamp with time zone default now() not null;
alter table public.lawyer_links add column if not exists first_opened_at timestamp with time zone;
alter table public.lawyer_links add column if not exists last_opened_at timestamp with time zone;
alter table public.lawyer_links add column if not exists open_count integer default 0 not null;
alter table public.lawyer_links add column if not exists expires_at timestamp with time zone default (now() + '30 days'::interval) not null;
alter table public.lawyer_links add column if not exists emailed_at timestamp with time zone;
alter table public.lawyer_links add column if not exists email_error text;
alter table public.lawyer_links add column if not exists sent_by text;
alter table public.lawyer_links add column if not exists phone text;
-- property_inspections
create table if not exists public.property_inspections (id uuid primary key default gen_random_uuid());
alter table public.property_inspections add column if not exists id uuid default gen_random_uuid() not null;
alter table public.property_inspections add column if not exists property_id uuid not null;
alter table public.property_inspections add column if not exists status text default 'in_progress'::text not null;
alter table public.property_inspections add column if not exists facts jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists declaration jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists notes jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists photos jsonb default '[]'::jsonb not null;
alter table public.property_inspections add column if not exists stamps jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists applied jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists conflicts jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists resolved jsonb default '{}'::jsonb not null;
alter table public.property_inspections add column if not exists sent_form_id uuid;
alter table public.property_inspections add column if not exists sent_at timestamp with time zone;
alter table public.property_inspections add column if not exists created_by text not null;
alter table public.property_inspections add column if not exists started_at timestamp with time zone default now() not null;
alter table public.property_inspections add column if not exists finished_at timestamp with time zone;
alter table public.property_inspections add column if not exists created_at timestamp with time zone default now() not null;
alter table public.property_inspections add column if not exists updated_at timestamp with time zone default now() not null;
-- property_documents
create table if not exists public.property_documents (id uuid primary key default gen_random_uuid());
alter table public.property_documents add column if not exists id uuid default gen_random_uuid() not null;
alter table public.property_documents add column if not exists property_id uuid not null;
alter table public.property_documents add column if not exists kind text;
alter table public.property_documents add column if not exists name text not null;
alter table public.property_documents add column if not exists path text not null;
alter table public.property_documents add column if not exists source text default 'dropped'::text not null;
alter table public.property_documents add column if not exists read_result jsonb;
alter table public.property_documents add column if not exists created_by text;
alter table public.property_documents add column if not exists created_at timestamp with time zone default now() not null;
alter table public.property_documents add column if not exists folder text;
alter table public.property_documents add column if not exists title text;
alter table public.property_documents add column if not exists issued_on date;
alter table public.property_documents add column if not exists mime_type text;
alter table public.property_documents add column if not exists size_bytes bigint;
alter table public.property_documents add column if not exists sha256 text;
alter table public.property_documents add column if not exists thumb_path text;
alter table public.property_documents add column if not exists bucket text default 'private'::text not null;
alter table public.property_documents add column if not exists client_key uuid;
alter table public.property_documents add column if not exists inspection_id uuid;
alter table public.property_documents add column if not exists room text;
alter table public.property_documents add column if not exists caption text;
alter table public.property_documents add column if not exists taken_at timestamp with time zone;
alter table public.property_documents add column if not exists width integer;
alter table public.property_documents add column if not exists height integer;
alter table public.property_documents add column if not exists shared_at timestamp with time zone;
alter table public.property_documents add column if not exists shared_by text;
alter table public.property_documents add column if not exists archived_at timestamp with time zone;
alter table public.property_documents add column if not exists archived_by text;
alter table public.property_documents add column if not exists updated_at timestamp with time zone default now() not null;
-- offer_signings
create table if not exists public.offer_signings (id uuid primary key default gen_random_uuid());
alter table public.offer_signings add column if not exists id uuid default gen_random_uuid() not null;
alter table public.offer_signings add column if not exists offer_id uuid not null;
alter table public.offer_signings add column if not exists property_id uuid not null;
alter table public.offer_signings add column if not exists draft_id uuid not null;
alter table public.offer_signings add column if not exists draft_sha256 text not null;
alter table public.offer_signings add column if not exists method text not null;
alter table public.offer_signings add column if not exists pages jsonb not null;
alter table public.offer_signings add column if not exists places jsonb not null;
alter table public.offer_signings add column if not exists places_sha256 text not null;
alter table public.offer_signings add column if not exists cca_pages integer[] default '{}'::integer[] not null;
alter table public.offer_signings add column if not exists status text default 'ready'::text not null;
alter table public.offer_signings add column if not exists released_by text not null;
alter table public.offer_signings add column if not exists released_at timestamp with time zone default now() not null;
alter table public.offer_signings add column if not exists sent_at timestamp with time zone;
alter table public.offer_signings add column if not exists held_at timestamp with time zone;
alter table public.offer_signings add column if not exists completed_at timestamp with time zone;
alter table public.offer_signings add column if not exists locked_at timestamp with time zone;
alter table public.offer_signings add column if not exists replaced_at timestamp with time zone;
alter table public.offer_signings add column if not exists replaced_by uuid;
alter table public.offer_signings add column if not exists round_no integer default 1 not null;
alter table public.offer_signings add column if not exists side text default 'purchaser'::text not null;
alter table public.offer_signings add column if not exists document_id uuid;
alter table public.offer_signings add column if not exists base_round_id uuid;
alter table public.offer_signings add column if not exists link_changes boolean;
-- offer_signers
create table if not exists public.offer_signers (id uuid primary key default gen_random_uuid());
alter table public.offer_signers add column if not exists id uuid default gen_random_uuid() not null;
alter table public.offer_signers add column if not exists signing_id uuid not null;
alter table public.offer_signers add column if not exists "position" integer not null;
alter table public.offer_signers add column if not exists name text not null;
alter table public.offer_signers add column if not exists email text;
alter table public.offer_signers add column if not exists token_hash text;
alter table public.offer_signers add column if not exists link_sent_at timestamp with time zone;
alter table public.offer_signers add column if not exists link_expires_at timestamp with time zone;
alter table public.offer_signers add column if not exists code_hash text;
alter table public.offer_signers add column if not exists code_expires_at timestamp with time zone;
alter table public.offer_signers add column if not exists code_tries integer default 0 not null;
alter table public.offer_signers add column if not exists codes_sent integer default 0 not null;
alter table public.offer_signers add column if not exists codes_window_at timestamp with time zone;
alter table public.offer_signers add column if not exists session_hash text;
alter table public.offer_signers add column if not exists session_expires_at timestamp with time zone;
alter table public.offer_signers add column if not exists opened_at timestamp with time zone;
alter table public.offer_signers add column if not exists verified_at timestamp with time zone;
alter table public.offer_signers add column if not exists consent_at timestamp with time zone;
alter table public.offer_signers add column if not exists sig_png text;
alter table public.offer_signers add column if not exists init_png text;
alter table public.offer_signers add column if not exists marks_at timestamp with time zone;
alter table public.offer_signers add column if not exists id_sighted text;
alter table public.offer_signers add column if not exists witnessed_by text;
alter table public.offer_signers add column if not exists finished_at timestamp with time zone;
alter table public.offer_signers add column if not exists seen_sha256 text;
alter table public.offer_signers add column if not exists user_agent text;
alter table public.offer_signers add column if not exists net_hash text;
alter table public.offer_signers add column if not exists void_at timestamp with time zone;
alter table public.offer_signers add column if not exists person_id uuid;
-- aml_files
create table if not exists public.aml_files (id uuid primary key default gen_random_uuid());
alter table public.aml_files add column if not exists id uuid default gen_random_uuid() not null;
alter table public.aml_files add column if not exists agreement_id uuid not null;
alter table public.aml_files add column if not exists person_id uuid;
alter table public.aml_files add column if not exists data jsonb default '{}'::jsonb not null;
alter table public.aml_files add column if not exists locked_at timestamp with time zone;
alter table public.aml_files add column if not exists locked_by text;
alter table public.aml_files add column if not exists retain_until date;
alter table public.aml_files add column if not exists created_at timestamp with time zone default now() not null;
alter table public.aml_files add column if not exists updated_at timestamp with time zone default now() not null;
alter table public.aml_files add column if not exists contact_id uuid;
CREATE OR REPLACE FUNCTION public.crm_norm_value(p_kind text, p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v text := coalesce(trim(p_value),'');
begin
  if p_kind = 'email' then return lower(v); end if;
  if p_kind in ('mobile','phone') then
    v := regexp_replace(v, '[^0-9+]', '', 'g');
    if v like '+64%' then v := '0' || substr(v, 4);
    elsif v like '64%' and length(v) >= 10 then v := '0' || substr(v, 3); end if;
    return v;
  end if;
  return lower(regexp_replace(v, '\s+', ' ', 'g'));
end $function$
;
CREATE OR REPLACE FUNCTION public.stamp_ts(t text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then return null; end if;
  return t::timestamptz;
exception when others then return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.inspection_decl_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['pegs','unpaid','history','meth','chattels','repairs','faults','era','wt','dux','asbestos','pipes','reno','consents','lim','claims','reports','hazard',
               'water','sewer','storm','power','internet','insulation','glazing','hai','burner','tenanted'];
$function$
;
CREATE OR REPLACE FUNCTION public.inspection_note_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['outside','structure','inside','services','history','tenancy'];
$function$
;
CREATE OR REPLACE FUNCTION public.pl_mine(p uuid)
 RETURNS prelistings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.prelistings;
begin
  select * into r from public.prelistings where id = p;
  if r.id is null or r.status = 'closed' or not (r.user_id = auth.uid() or lower(r.contact_email) = lower(coalesce(auth.jwt()->>'email',''))) then raise exception 'Not found'; end if;
  if r.user_id is null then update public.prelistings set user_id = auth.uid() where id = p; end if;
  return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.agent_inspection_save(iid uuid, p_facts jsonb, p_decl jsonb, p_notes jsonb, p_stamps jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.property_inspections; pr public.properties; ag public.agreements;
  k text; v jsonb; tgt text; cur jsonb; was jsonb; dsc jsonb; dis jsonb; sk text; ts timestamptz; old_ts timestamptz;
  skipped jsonb := '{}'::jsonb; draft jsonb := '{}'::jsonb; draft_ok boolean := false;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into i from public.property_inspections where id = iid for update;
  if not found then raise exception 'Inspection not found'; end if;
  if (p_facts is not null and jsonb_typeof(p_facts) <> 'object') or (p_decl is not null and jsonb_typeof(p_decl) <> 'object')
     or (p_notes is not null and jsonb_typeof(p_notes) <> 'object') or (p_stamps is not null and jsonb_typeof(p_stamps) <> 'object') then raise exception 'Bad answers'; end if;
  if length(coalesce(p_facts, '{}')::text) + length(coalesce(p_decl, '{}')::text) + length(coalesce(p_notes, '{}')::text) > 60000 then raise exception 'Too much to save at once'; end if;

  for k, v in select * from jsonb_each(coalesce(p_notes, '{}'::jsonb)) loop
    sk := 'n:' || k;
    if not (k = any (public.inspection_note_keys())) then raise exception 'Not saved (%): unknown section', sk; end if;
    ts := public.stamp_ts(p_stamps->>sk); old_ts := public.stamp_ts(i.stamps->>sk);
    if ts is not null and old_ts is not null and old_ts > ts then skipped := skipped || jsonb_build_object(sk, coalesce(i.notes->k, 'null'::jsonb)); continue; end if;
    i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp()));
    if public.jblank(v) then i.notes := i.notes - k;
    elsif jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 4000 then raise exception 'Not saved (%): a note can be up to 4000 characters', sk;
    else i.notes := i.notes || jsonb_build_object(k, v); end if;
  end loop;

  for k, v in select * from jsonb_each(coalesce(p_decl, '{}'::jsonb)) loop
    sk := 'd:' || k;
    if not (k = any (public.inspection_decl_keys())) then raise exception 'Not saved (%): unknown question', sk; end if;
    ts := public.stamp_ts(p_stamps->>sk); old_ts := public.stamp_ts(i.stamps->>sk);
    if ts is not null and old_ts is not null and old_ts > ts then skipped := skipped || jsonb_build_object(sk, coalesce(i.declaration->k, 'null'::jsonb)); continue; end if;
    if public.jblank(v) or (jsonb_typeof(v) = 'object' and public.jblank(v->'a') and public.jblank(v->'d')) then
      i.declaration := i.declaration - k; i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp())); continue;
    end if;
    if jsonb_typeof(v) <> 'object' then raise exception 'Not saved (%): not an answer', sk; end if;
    if k = 'tenanted' then
      if coalesce(v->>'a', '') not in ('now','will','no') then raise exception 'Not saved (%): not one of the choices', sk; end if;
      i.declaration := i.declaration || jsonb_build_object(k, jsonb_build_object('a', v->>'a'));
    else
      if not public.jblank(v->'a') and coalesce(v->>'a', '') not in ('yes','no','unknown') then raise exception 'Not saved (%): not one of the choices', sk; end if;
      if length(coalesce(v->>'d', '')) > 4000 then raise exception 'Not saved (%): details can be up to 4000 characters', sk; end if;
      i.declaration := i.declaration || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object('a', nullif(v->>'a', ''), 'd', coalesce(v->>'d', ''))));
    end if;
    i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp()));
  end loop;

  if p_facts is not null and p_facts <> '{}'::jsonb then
    select * into pr from public.properties where id = i.property_id for update;
    select * into ag from public.agreements where property_id = i.property_id and status not in ('ended','cancelled') order by created_at desc limit 1;
    draft_ok := ag.id is not null and ag.status = 'draft' and not exists (select 1 from public.agreement_people where agreement_id = ag.id and signed_at is not null);
    dsc := pr.description; dis := pr.disclosures;
    for k, v in select * from jsonb_each(p_facts) loop
      sk := 'f:' || k;
      if not (k = any (public.desc_keys() || public.disc_keys())) then raise exception 'Not saved (%): unknown property detail', sk; end if;
      if not public.jblank(v) and not (jsonb_typeof(v) = 'string' and length(v #>> '{}') <= 4000)
         and not (jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 40 and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string')) then
        raise exception 'Not saved (%): not a property detail', sk;
      end if;
      ts := public.stamp_ts(p_stamps->>sk); old_ts := public.stamp_ts(i.stamps->>sk);
      if ts is not null and old_ts is not null and old_ts > ts then skipped := skipped || jsonb_build_object(sk, coalesce(i.facts->k, 'null'::jsonb)); continue; end if;
      i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp()));
      tgt := case when k = any (public.desc_keys()) then 'description' else 'disclosures' end;
      cur := case when tgt = 'description' then dsc -> k else dis -> k end;
      if public.jblank(v) then
        -- cleared: take back only what this inspection put there
        if i.applied ? k and cur is not distinct from (i.applied -> k -> 'v') then
          was := i.applied -> k -> 'was';
          if tgt = 'description' then dsc := case when public.jblank(was) then dsc - k else dsc || jsonb_build_object(k, was) end;
          else dis := case when public.jblank(was) then dis - k else dis || jsonb_build_object(k, was) end; end if;
        end if;
        -- 014: "no hazards" noted while the agreement in force lists some is a difference for Tim to choose, not a silent clear
        --      (even when the agreement's value came from this inspection's earlier Yes: Tim then confirms the change to the draft)
        if k in ('hazards', 'hazOther') and ag.id is not null and not public.jblank(ag.answers -> k) then
          i.facts := i.facts || jsonb_build_object(k, v); i.applied := i.applied - k; i.resolved := i.resolved - k;
          i.conflicts := i.conflicts || jsonb_build_object(k, jsonb_build_object('agreement_id', ag.id, 'ref', ag.ref, 'agreement', ag.answers -> k, 'inspection', v));
          continue;
        end if;
        i.facts := i.facts - k; i.conflicts := i.conflicts - k; i.applied := i.applied - k; i.resolved := i.resolved - k;
        continue;
      end if;
      i.facts := i.facts || jsonb_build_object(k, v);
      i.resolved := i.resolved - k;
      if ag.id is not null and not public.jblank(ag.answers -> k) and (ag.answers -> k) is distinct from v then
        i.conflicts := i.conflicts || jsonb_build_object(k, jsonb_build_object('agreement_id', ag.id, 'ref', ag.ref, 'agreement', ag.answers -> k, 'inspection', v));
        continue;
      end if;
      i.conflicts := i.conflicts - k;
      was := case when i.applied ? k then i.applied -> k -> 'was' else coalesce(cur, 'null'::jsonb) end;
      i.applied := i.applied || jsonb_build_object(k, jsonb_build_object('v', v, 'was', was));
      if tgt = 'description' then dsc := dsc || jsonb_build_object(k, v); else dis := dis || jsonb_build_object(k, v); end if;
      if draft_ok and (ag.answers -> k) is distinct from v then draft := draft || jsonb_build_object(k, v); end if;   -- the draft had no value for it
    end loop;
    if dsc is distinct from pr.description or dis is distinct from pr.disclosures then
      update public.properties set description = dsc, disclosures = dis where id = pr.id;
    end if;
    if draft <> '{}'::jsonb then
      update public.agreements set answers = answers || draft where id = ag.id;
      perform public.log_event(ag.id, coalesce(auth.jwt()->>'email', 'agent'), 'inspection_applied', jsonb_build_object('keys', (select jsonb_agg(x) from jsonb_object_keys(draft) x)));
    end if;
  end if;

  update public.property_inspections set facts = i.facts, declaration = i.declaration, notes = i.notes, applied = i.applied,
         conflicts = i.conflicts, resolved = i.resolved, stamps = i.stamps where id = iid;
  return jsonb_build_object('conflicts', i.conflicts, 'resolved', i.resolved, 'skipped', skipped);
end $function$
;
CREATE OR REPLACE FUNCTION public.agent_inspection_start(p_property uuid, p_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid := p_property; addr text := trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g')); iid uuid; made boolean := false; cyc timestamptz;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if pid is null then
    if length(addr) < 3 then raise exception 'Add the address'; end if;
    if exists (select 1 from public.properties where lower(trim(regexp_replace(address, '\s+', ' ', 'g'))) = lower(addr)) then
      raise exception 'That address is already on file. Choose it from the list';
    end if;
    insert into public.properties (address) values (addr) returning id into pid;
    made := true;
  elsif not exists (select 1 from public.properties where id = pid) then
    raise exception 'Property not found';
  end if;
  select cycle_at into cyc from public.properties where id = pid;
  select id into iid from public.property_inspections
   where property_id = pid and status = 'in_progress' and started_at >= coalesce(cyc, '-infinity'::timestamptz)
   order by started_at desc limit 1;
  if iid is not null then return jsonb_build_object('inspection_id', iid, 'property_id', pid, 'created_property', made, 'resumed', true); end if;
  insert into public.property_inspections (property_id, created_by) values (pid, coalesce(auth.jwt()->>'email', 'agent')) returning id into iid;
  return jsonb_build_object('inspection_id', iid, 'property_id', pid, 'created_property', made, 'resumed', false);
end $function$
;
CREATE OR REPLACE FUNCTION public.crm_aml_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.contact_id is null then return new; end if;
  if new.locked_at is not null then
    update public.crm_contacts c set
      aml_status = 'verified',
      aml_checked_at = new.locked_at,
      aml_cdd_level = new.data->>'cdd',
      aml_risk = new.data->>'risk',
      aml_pep = new.data->>'pep',
      aml_latest_file_id = new.id
    where c.id = new.contact_id
      and (c.aml_checked_at is null or c.aml_checked_at <= new.locked_at);
  else
    update public.crm_contacts c set aml_status = 'in_progress', aml_latest_file_id = new.id
    where c.id = new.contact_id and c.aml_status in ('none','review_due');
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.crm_methods_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.value_norm := public.crm_norm_value(new.kind, new.value); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.is_property_party(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    exists (select 1 from public.property_people pp where pp.property_id = pid and pp.role <> 'former' and (pp.user_id = auth.uid() or (pp.email <> '' and lower(pp.email) = lower(coalesce(auth.jwt()->>'email','')))))
    or exists (select 1 from public.agreements a where a.property_id = pid and a.status not in ('ended','cancelled') and public.is_party(a.id))
    or exists (select 1 from public.prelistings pl join public.properties p on p.id = pl.property_id where pl.property_id = pid and pl.status <> 'closed'
               and pl.created_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
               and (pl.user_id = auth.uid() or lower(pl.contact_email) = lower(coalesce(auth.jwt()->>'email','')))));
$function$
;
CREATE OR REPLACE FUNCTION public.pl_save(p uuid, patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.prelistings;
begin
  r := public.pl_mine(p);
  if r.status <> 'appraisal' then raise exception 'Your answers have already been sent to Tim'; end if;
  update public.prelistings set answers = answers || coalesce(patch,'{}'::jsonb), proceeded_at = coalesce(proceeded_at, now()) where id = p;
end $function$
;
CREATE OR REPLACE FUNCTION public.prelisting_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o jsonb; ids uuid[] := '{}'; rid uuid;
begin
  if new.property_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.address is distinct from old.address and not exists (select 1 from public.agreements a where a.property_id = new.property_id and a.status not in ('ended','cancelled')) then
    update public.properties set address = new.address where id = new.property_id;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    for o in select * from jsonb_array_elements(coalesce(new.answers->'owners','[]'::jsonb)) loop
      rid := public.merge_property_person(new.property_id, o->>'name', o->>'pref', o->>'email', o->>'mobile', null, 'questionnaire');
      if rid is not null then ids := ids || rid; end if;
    end loop;
    if array_length(ids, 1) > 0 then
      update public.property_people set role = 'contact'
       where property_id = new.property_id and role = 'owner' and source = 'appraisal' and not (id = any(ids));
    end if;
  end if;
  perform public.bump_stage(new.property_id, case new.status
    when 'appraisal' then case when new.proceeded_at is not null then 'questionnaire' else 'appraisal' end
    when 'submitted' then 'questionnaire' when 'plan' then 'plan' when 'question' then 'plan' when 'accepted' then 'accepted' else 'appraisal' end);
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.prelisting_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid;
begin
  if new.property_id is null then
    insert into public.properties (address) values (coalesce(new.address,'')) returning id into pid;
    new.property_id := pid;
  end if;
  perform public.merge_property_person(new.property_id, coalesce(new.contact_name,''), '', new.contact_email, '', new.user_id, 'appraisal');
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.ql_listing_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.ref is null then new.ref := 'QL-' || lpad(nextval('public.ql_listing_seq')::text, 4, '0'); end if;
  if new.status in ('live','under_offer') and new.published_at is null then new.published_at := now(); end if;
  if new.status = 'to_market' and new.to_market_at is null then new.to_market_at := now(); end if;
  new.updated_at := now();
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.touch_prelisting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at := now(); return new; end $function$
;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contacts_aml_latest_file_id_fkey') then alter table public.crm_contacts add constraint crm_contacts_aml_latest_file_id_fkey FOREIGN KEY (aml_latest_file_id) REFERENCES aml_files(id) ON DELETE SET NULL; end if; exception when others then raise notice 'crm_contacts_aml_latest_file_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contacts_aml_status_check') then alter table public.crm_contacts add constraint crm_contacts_aml_status_check CHECK ((aml_status = ANY (ARRAY['none'::text, 'in_progress'::text, 'verified'::text, 'review_due'::text, 'refused'::text]))); end if; exception when others then raise notice 'crm_contacts_aml_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contacts_kind_check') then alter table public.crm_contacts add constraint crm_contacts_kind_check CHECK ((kind = ANY (ARRAY['person'::text, 'company'::text, 'trust'::text, 'organisation'::text, 'household'::text]))); end if; exception when others then raise notice 'crm_contacts_kind_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contacts_marketing_consent_check') then alter table public.crm_contacts add constraint crm_contacts_marketing_consent_check CHECK ((marketing_consent = ANY (ARRAY['unknown'::text, 'opted_in'::text, 'opted_out'::text]))); end if; exception when others then raise notice 'crm_contacts_marketing_consent_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contacts_status_check') then alter table public.crm_contacts add constraint crm_contacts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'do_not_contact'::text, 'deceased'::text, 'archived'::text]))); end if; exception when others then raise notice 'crm_contacts_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contact_methods_contact_id_kind_value_norm_key') then alter table public.crm_contact_methods add constraint crm_contact_methods_contact_id_kind_value_norm_key UNIQUE (contact_id, kind, value_norm); end if; exception when others then raise notice 'crm_contact_methods_contact_id_kind_value_norm_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contact_methods_contact_id_fkey') then alter table public.crm_contact_methods add constraint crm_contact_methods_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE; end if; exception when others then raise notice 'crm_contact_methods_contact_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_contact_methods_kind_check') then alter table public.crm_contact_methods add constraint crm_contact_methods_kind_check CHECK ((kind = ANY (ARRAY['email'::text, 'mobile'::text, 'phone'::text, 'address'::text, 'website'::text, 'social'::text]))); end if; exception when others then raise notice 'crm_contact_methods_kind_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_property_links_contact_id_property_id_role_key') then alter table public.crm_property_links add constraint crm_property_links_contact_id_property_id_role_key UNIQUE (contact_id, property_id, role); end if; exception when others then raise notice 'crm_property_links_contact_id_property_id_role_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_property_links_contact_id_fkey') then alter table public.crm_property_links add constraint crm_property_links_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE; end if; exception when others then raise notice 'crm_property_links_contact_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_property_links_property_id_fkey') then alter table public.crm_property_links add constraint crm_property_links_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; end if; exception when others then raise notice 'crm_property_links_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_property_links_role_check') then alter table public.crm_property_links add constraint crm_property_links_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'vendor'::text, 'purchaser'::text, 'prospective_buyer'::text, 'tenant'::text, 'landlord'::text, 'occupier'::text, 'solicitor'::text, 'broker'::text, 'enquirer'::text, 'open_home_attendee'::text, 'neighbour'::text, 'referrer'::text, 'other'::text]))); end if; exception when others then raise notice 'crm_property_links_role_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_profiles_contact_id_fkey') then alter table public.crm_profiles add constraint crm_profiles_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE; end if; exception when others then raise notice 'crm_profiles_contact_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_profiles_property_id_fkey') then alter table public.crm_profiles add constraint crm_profiles_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL; end if; exception when others then raise notice 'crm_profiles_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_profiles_profile_type_check') then alter table public.crm_profiles add constraint crm_profiles_profile_type_check CHECK ((profile_type = ANY (ARRAY['buyer'::text, 'seller'::text, 'investor'::text, 'landlord'::text, 'tenant'::text, 'developer'::text, 'referrer'::text]))); end if; exception when others then raise notice 'crm_profiles_profile_type_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'crm_profiles_status_check') then alter table public.crm_profiles add constraint crm_profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'won'::text, 'lost'::text, 'closed'::text]))); end if; exception when others then raise notice 'crm_profiles_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'prelistings_agreement_id_fkey') then alter table public.prelistings add constraint prelistings_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE SET NULL; end if; exception when others then raise notice 'prelistings_agreement_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'prelistings_property_id_fkey') then alter table public.prelistings add constraint prelistings_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id); end if; exception when others then raise notice 'prelistings_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'prelistings_status_check') then alter table public.prelistings add constraint prelistings_status_check CHECK ((status = ANY (ARRAY['appraisal'::text, 'submitted'::text, 'plan'::text, 'question'::text, 'accepted'::text, 'closed'::text]))); end if; exception when others then raise notice 'prelistings_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_ref_key') then alter table public.ql_listings add constraint ql_listings_ref_key UNIQUE (ref); end if; exception when others then raise notice 'ql_listings_ref_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_share_slug_key') then alter table public.ql_listings add constraint ql_listings_share_slug_key UNIQUE (share_slug); end if; exception when others then raise notice 'ql_listings_share_slug_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_vendor_token_key') then alter table public.ql_listings add constraint ql_listings_vendor_token_key UNIQUE (vendor_token); end if; exception when others then raise notice 'ql_listings_vendor_token_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_agreement_id_fkey') then alter table public.ql_listings add constraint ql_listings_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE SET NULL; end if; exception when others then raise notice 'ql_listings_agreement_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_m_motivation_check') then alter table public.ql_listings add constraint ql_listings_m_motivation_check CHECK ((m_motivation = ANY (ARRAY['yes'::text, 'partly'::text, 'no'::text]))); end if; exception when others then raise notice 'ql_listings_m_motivation_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_m_price_check') then alter table public.ql_listings add constraint ql_listings_m_price_check CHECK ((m_price = ANY (ARRAY['yes'::text, 'partly'::text, 'no'::text]))); end if; exception when others then raise notice 'ql_listings_m_price_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_m_time_check') then alter table public.ql_listings add constraint ql_listings_m_time_check CHECK ((m_time = ANY (ARRAY['yes'::text, 'partly'::text, 'no'::text]))); end if; exception when others then raise notice 'ql_listings_m_time_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_nudges_check') then alter table public.ql_listings add constraint ql_listings_nudges_check CHECK ((nudges = ANY (ARRAY['auto'::text, 'paused'::text]))); end if; exception when others then raise notice 'ql_listings_nudges_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_share_slug_check') then alter table public.ql_listings add constraint ql_listings_share_slug_check CHECK ((share_slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'::text)); end if; exception when others then raise notice 'ql_listings_share_slug_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_share_summary_check') then alter table public.ql_listings add constraint ql_listings_share_summary_check CHECK ((length(share_summary) <= 200)); end if; exception when others then raise notice 'ql_listings_share_summary_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_listings_status_check') then alter table public.ql_listings add constraint ql_listings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'under_offer'::text, 'sold'::text, 'withdrawn'::text, 'to_market'::text]))); end if; exception when others then raise notice 'ql_listings_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_seller_leads_listing_id_fkey') then alter table public.ql_seller_leads add constraint ql_seller_leads_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES ql_listings(id) ON DELETE SET NULL; end if; exception when others then raise notice 'ql_seller_leads_listing_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'ql_seller_leads_status_check') then alter table public.ql_seller_leads add constraint ql_seller_leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'appraisal'::text, 'listed'::text, 'not_proceeding'::text]))); end if; exception when others then raise notice 'ql_seller_leads_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'properties_stage_check') then alter table public.properties add constraint properties_stage_check CHECK ((stage = ANY (ARRAY['appraisal'::text, 'questionnaire'::text, 'plan'::text, 'accepted'::text, 'agreement'::text, 'signed'::text, 'live'::text, 'under_offer'::text, 'sold'::text, 'settled'::text, 'withdrawn'::text]))); end if; exception when others then raise notice 'properties_stage_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_people_contact_id_fkey') then alter table public.property_people add constraint property_people_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL; end if; exception when others then raise notice 'property_people_contact_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_people_property_id_fkey') then alter table public.property_people add constraint property_people_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; end if; exception when others then raise notice 'property_people_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_people_role_check') then alter table public.property_people add constraint property_people_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'contact'::text, 'former'::text]))); end if; exception when others then raise notice 'property_people_role_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'agreements_ref_key') then alter table public.agreements add constraint agreements_ref_key UNIQUE (ref); end if; exception when others then raise notice 'agreements_ref_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'agreements_property_id_fkey') then alter table public.agreements add constraint agreements_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id); end if; exception when others then raise notice 'agreements_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'agreements_status_check') then alter table public.agreements add constraint agreements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'parked'::text, 'signed'::text, 'countersigned'::text, 'cancelled'::text, 'ended'::text]))); end if; exception when others then raise notice 'agreements_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'agreement_people_agreement_id_fkey') then alter table public.agreement_people add constraint agreement_people_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE; end if; exception when others then raise notice 'agreement_people_agreement_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'agreement_people_contact_id_fkey') then alter table public.agreement_people add constraint agreement_people_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL; end if; exception when others then raise notice 'agreement_people_contact_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'agreement_people_user_id_fkey') then alter table public.agreement_people add constraint agreement_people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id); end if; exception when others then raise notice 'agreement_people_user_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'lawyer_links_token_key') then alter table public.lawyer_links add constraint lawyer_links_token_key UNIQUE (token); end if; exception when others then raise notice 'lawyer_links_token_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'lawyer_links_agreement_id_fkey') then alter table public.lawyer_links add constraint lawyer_links_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE; end if; exception when others then raise notice 'lawyer_links_agreement_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'lawyer_links_phone_check') then alter table public.lawyer_links add constraint lawyer_links_phone_check CHECK (((phone IS NULL) OR (phone ~ '^[0-9+()\-. ]{6,40}$'::text))); end if; exception when others then raise notice 'lawyer_links_phone_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_inspections_property_id_fkey') then alter table public.property_inspections add constraint property_inspections_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id); end if; exception when others then raise notice 'property_inspections_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_inspections_sent_form_id_fkey') then alter table public.property_inspections add constraint property_inspections_sent_form_id_fkey FOREIGN KEY (sent_form_id) REFERENCES property_forms(id); end if; exception when others then raise notice 'property_inspections_sent_form_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_inspections_status_check') then alter table public.property_inspections add constraint property_inspections_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'finished'::text]))); end if; exception when others then raise notice 'property_inspections_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_inspection_id_fkey') then alter table public.property_documents add constraint property_documents_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES property_inspections(id); end if; exception when others then raise notice 'property_documents_inspection_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_property_id_fkey') then alter table public.property_documents add constraint property_documents_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; end if; exception when others then raise notice 'property_documents_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_bucket_check') then alter table public.property_documents add constraint property_documents_bucket_check CHECK ((bucket = ANY (ARRAY['private'::text, 'property-files'::text]))); end if; exception when others then raise notice 'property_documents_bucket_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_sha256_check') then alter table public.property_documents add constraint property_documents_sha256_check CHECK (((sha256 IS NULL) OR (sha256 ~ '^[0-9a-f]{64}$'::text))); end if; exception when others then raise notice 'property_documents_sha256_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_size_check') then alter table public.property_documents add constraint property_documents_size_check CHECK (((size_bytes IS NULL) OR ((size_bytes > 0) AND (size_bytes <= 26214400)))); end if; exception when others then raise notice 'property_documents_size_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_source_check') then alter table public.property_documents add constraint property_documents_source_check CHECK ((source = ANY (ARRAY['dropped'::text, 'uploaded'::text, 'generated'::text]))); end if; exception when others then raise notice 'property_documents_source_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'property_documents_text_check') then alter table public.property_documents add constraint property_documents_text_check CHECK (((COALESCE(length(title), 0) <= 200) AND (COALESCE(length(caption), 0) <= 1000) AND (COALESCE(length(room), 0) <= 60))); end if; exception when others then raise notice 'property_documents_text_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_base_round_id_fkey') then alter table public.offer_signings add constraint offer_signings_base_round_id_fkey FOREIGN KEY (base_round_id) REFERENCES offer_rounds(id); end if; exception when others then raise notice 'offer_signings_base_round_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_document_id_fkey') then alter table public.offer_signings add constraint offer_signings_document_id_fkey FOREIGN KEY (document_id) REFERENCES offer_documents(id); end if; exception when others then raise notice 'offer_signings_document_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_draft_id_fkey') then alter table public.offer_signings add constraint offer_signings_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES offer_drafts(id); end if; exception when others then raise notice 'offer_signings_draft_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_offer_id_fkey') then alter table public.offer_signings add constraint offer_signings_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES property_offers(id); end if; exception when others then raise notice 'offer_signings_offer_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_property_id_fkey') then alter table public.offer_signings add constraint offer_signings_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id); end if; exception when others then raise notice 'offer_signings_property_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_replaced_by_fkey') then alter table public.offer_signings add constraint offer_signings_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES offer_signings(id); end if; exception when others then raise notice 'offer_signings_replaced_by_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_draft_sha256_check') then alter table public.offer_signings add constraint offer_signings_draft_sha256_check CHECK ((draft_sha256 ~ '^[0-9a-f]{64}$'::text)); end if; exception when others then raise notice 'offer_signings_draft_sha256_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_method_check') then alter table public.offer_signings add constraint offer_signings_method_check CHECK ((method = ANY (ARRAY['in_person'::text, 'link'::text]))); end if; exception when others then raise notice 'offer_signings_method_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_pages_check') then alter table public.offer_signings add constraint offer_signings_pages_check CHECK ((jsonb_typeof(pages) = 'array'::text)); end if; exception when others then raise notice 'offer_signings_pages_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_places_check') then alter table public.offer_signings add constraint offer_signings_places_check CHECK ((jsonb_typeof(places) = 'array'::text)); end if; exception when others then raise notice 'offer_signings_places_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_places_sha256_check') then alter table public.offer_signings add constraint offer_signings_places_sha256_check CHECK ((places_sha256 ~ '^[0-9a-f]{64}$'::text)); end if; exception when others then raise notice 'offer_signings_places_sha256_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_round_doc') then alter table public.offer_signings add constraint offer_signings_round_doc CHECK ((((round_no = 1) AND (document_id IS NULL) AND (base_round_id IS NULL) AND (side = 'purchaser'::text)) OR ((round_no > 1) AND (document_id IS NOT NULL) AND (base_round_id IS NOT NULL)))); end if; exception when others then raise notice 'offer_signings_round_doc: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_round_no_check') then alter table public.offer_signings add constraint offer_signings_round_no_check CHECK ((round_no >= 1)); end if; exception when others then raise notice 'offer_signings_round_no_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_side_check') then alter table public.offer_signings add constraint offer_signings_side_check CHECK ((side = ANY (ARRAY['purchaser'::text, 'vendor'::text]))); end if; exception when others then raise notice 'offer_signings_side_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signings_status_check') then alter table public.offer_signings add constraint offer_signings_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'signing'::text, 'held'::text, 'complete'::text, 'locked'::text, 'replaced'::text, 'cancelled'::text, 'withdrawn'::text]))); end if; exception when others then raise notice 'offer_signings_status_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_signing_id_position_key') then alter table public.offer_signers add constraint offer_signers_signing_id_position_key UNIQUE (signing_id, "position"); end if; exception when others then raise notice 'offer_signers_signing_id_position_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_token_hash_key') then alter table public.offer_signers add constraint offer_signers_token_hash_key UNIQUE (token_hash); end if; exception when others then raise notice 'offer_signers_token_hash_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_person_id_fkey') then alter table public.offer_signers add constraint offer_signers_person_id_fkey FOREIGN KEY (person_id) REFERENCES property_people(id); end if; exception when others then raise notice 'offer_signers_person_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_signing_id_fkey') then alter table public.offer_signers add constraint offer_signers_signing_id_fkey FOREIGN KEY (signing_id) REFERENCES offer_signings(id); end if; exception when others then raise notice 'offer_signers_signing_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_id_sighted_check') then alter table public.offer_signers add constraint offer_signers_id_sighted_check CHECK (((id_sighted IS NULL) OR (id_sighted = ANY (ARRAY['nz_driver_licence'::text, 'passport'::text, 'nz_firearms_licence'::text, 'kiwi_access_card'::text, 'other_photo_id'::text, 'known_to_tim'::text])))); end if; exception when others then raise notice 'offer_signers_id_sighted_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_init_png_check') then alter table public.offer_signers add constraint offer_signers_init_png_check CHECK (((init_png IS NULL) OR ((length(init_png) <= 200000) AND (init_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'::text)))); end if; exception when others then raise notice 'offer_signers_init_png_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_name_check') then alter table public.offer_signers add constraint offer_signers_name_check CHECK (((length(name) >= 1) AND (length(name) <= 250))); end if; exception when others then raise notice 'offer_signers_name_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_position_check') then alter table public.offer_signers add constraint offer_signers_position_check CHECK ((("position" >= 1) AND ("position" <= 12))); end if; exception when others then raise notice 'offer_signers_position_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_seen_sha256_check') then alter table public.offer_signers add constraint offer_signers_seen_sha256_check CHECK (((seen_sha256 IS NULL) OR (seen_sha256 ~ '^[0-9a-f]{64}$'::text))); end if; exception when others then raise notice 'offer_signers_seen_sha256_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'offer_signers_sig_png_check') then alter table public.offer_signers add constraint offer_signers_sig_png_check CHECK (((sig_png IS NULL) OR ((length(sig_png) <= 400000) AND (sig_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'::text)))); end if; exception when others then raise notice 'offer_signers_sig_png_check: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'aml_files_person_id_key') then alter table public.aml_files add constraint aml_files_person_id_key UNIQUE (person_id); end if; exception when others then raise notice 'aml_files_person_id_key: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'aml_files_agreement_id_fkey') then alter table public.aml_files add constraint aml_files_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE RESTRICT; end if; exception when others then raise notice 'aml_files_agreement_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'aml_files_contact_id_fkey') then alter table public.aml_files add constraint aml_files_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE RESTRICT; end if; exception when others then raise notice 'aml_files_contact_id_fkey: %', sqlerrm; end $c$;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'aml_files_person_id_fkey') then alter table public.aml_files add constraint aml_files_person_id_fkey FOREIGN KEY (person_id) REFERENCES agreement_people(id) ON DELETE RESTRICT; end if; exception when others then raise notice 'aml_files_person_id_fkey: %', sqlerrm; end $c$;

-- the live triggers on these tables
drop trigger if exists crm_contacts_touch on public.crm_contacts; create trigger crm_contacts_touch before update on public.crm_contacts for each row execute function public.touch_updated();
drop trigger if exists crm_profiles_touch on public.crm_profiles; create trigger crm_profiles_touch before update on public.crm_profiles for each row execute function public.touch_updated();
drop trigger if exists crm_pl_touch on public.crm_property_links; create trigger crm_pl_touch before update on public.crm_property_links for each row execute function public.touch_updated();
drop trigger if exists crm_methods_norm on public.crm_contact_methods; create trigger crm_methods_norm before insert or update on public.crm_contact_methods for each row execute function public.crm_methods_before();
drop trigger if exists aml_files_crm_sync on public.aml_files; create trigger aml_files_crm_sync after insert or update of locked_at, contact_id, data on public.aml_files for each row execute function public.crm_aml_sync();
drop trigger if exists prelisting_property_after on public.prelistings; create trigger prelisting_property_after after insert or update on public.prelistings for each row execute function public.prelisting_after();
drop trigger if exists prelisting_property_before on public.prelistings; create trigger prelisting_property_before before insert on public.prelistings for each row execute function public.prelisting_before();
drop trigger if exists touch_prelisting on public.prelistings; create trigger touch_prelisting before update on public.prelistings for each row execute function public.touch_prelisting();
drop trigger if exists touch_property_inspections on public.property_inspections; create trigger touch_property_inspections before update on public.property_inspections for each row execute function public.touch_updated();
drop trigger if exists ql_listing_ref on public.ql_listings; create trigger ql_listing_ref before insert or update on public.ql_listings for each row execute function public.ql_listing_ref();
grant select, insert, update, delete on public.crm_contacts, public.crm_contact_methods, public.crm_property_links, public.crm_profiles, public.prelistings, public.ql_listings, public.ql_seller_leads, public.property_inspections to authenticated, service_role;
grant usage on sequence public.ql_listing_seq to authenticated, service_role;


-- row level security as live (read 27 November 2026): every policy on these tables dropped, then the live ones created word for word
do $p$ declare r record; begin
  for r in select p.polname, c.relname from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace
             and c.relname in ('properties','property_people','prelistings','agreements','agreement_people','property_documents','ql_listings','ql_seller_leads','crm_contacts','crm_contact_methods','crm_property_links','crm_profiles','property_inspections','lawyer_links','aml_files','offer_signers','offer_signings') loop
    execute format('drop policy %I on public.%I', r.polname, r.relname);
  end loop;
end $p$;
alter table public.properties enable row level security; alter table public.property_people enable row level security; alter table public.prelistings enable row level security;
alter table public.agreements enable row level security; alter table public.agreement_people enable row level security; alter table public.property_documents enable row level security;
alter table public.ql_listings enable row level security; alter table public.ql_seller_leads enable row level security; alter table public.crm_contacts enable row level security;
alter table public.crm_contact_methods enable row level security; alter table public.crm_property_links enable row level security; alter table public.crm_profiles enable row level security;
alter table public.property_inspections enable row level security; alter table public.lawyer_links enable row level security; alter table public.aml_files enable row level security;
alter table public.offer_signers enable row level security; alter table public.offer_signings enable row level security;
create policy agent_all_people on public.agreement_people as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy party_read_people on public.agreement_people as permissive for select to authenticated using (is_party(agreement_id));
create policy agent_all_agreements on public.agreements as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy party_read_agreements on public.agreements as permissive for select to authenticated using (is_party(id));
create policy agent_all_aml on public.aml_files as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy crm_contact_methods_agent on public.crm_contact_methods as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy crm_contacts_agent on public.crm_contacts as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy crm_profiles_agent on public.crm_profiles as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy crm_property_links_agent on public.crm_property_links as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy agent_all_lawyer on public.lawyer_links as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy party_read_lawyer on public.lawyer_links as permissive for select to authenticated using (is_party(agreement_id));
create policy osr_agent_read on public.offer_signers as permissive for select to public using (is_agent());
create policy osg_agent_read on public.offer_signings as permissive for select to public using (is_agent());
create policy pl_agent_all on public.prelistings as permissive for all to public using (is_agent()) with check (is_agent());
create policy pl_party_read on public.prelistings as permissive for select to public using (((status <> 'closed'::text) AND ((user_id = auth.uid()) OR (lower(contact_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))))));
create policy prop_agent on public.properties as permissive for all to public using (is_agent()) with check (is_agent());
create policy prop_party_read on public.properties as permissive for select to public using (is_property_party(id));
create policy pd_agent on public.property_documents as permissive for all to public using (is_agent()) with check (is_agent());
create policy pi_agent_read on public.property_inspections as permissive for select to public using (is_agent());
create policy pp_agent on public.property_people as permissive for all to public using (is_agent()) with check (is_agent());
create policy pp_party_read on public.property_people as permissive for select to public using (((role <> 'former'::text) AND is_property_party(property_id)));
create policy ql_listings_agent on public.ql_listings as permissive for all to authenticated using (is_agent()) with check (is_agent());
create policy ql_leads_agent on public.ql_seller_leads as permissive for all to authenticated using (is_agent()) with check (is_agent());

