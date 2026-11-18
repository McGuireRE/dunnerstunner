-- The Otago Regional Council's map server, through the database (18 November 2026). maps.orc.govt.nz resets every connection from
-- the edge runtime, so the property-lookup function couldn't reach the ORC address finder or ORC Properties. From the database,
-- pg_net (already installed, 0.20.4) reaches every path the lookup needs (tested: the address finder and ORC Properties queries
-- both 200). The http extension was tried first and is not used: it fails on those query paths (TLS read errors) and only reaches
-- the bare service description.
-- pg_net is asynchronous: a request is sent only after the transaction that queued it commits. So it takes two calls:
--   * orc_http_start(url): checks the address, queues one GET (5 second timeout), records its id in orc_http_requests, returns it;
--   * orc_http_result(id): only for an id recorded there; 'pending' until pg_net has the answer, then the status and the parsed JSON
--     object only (never the raw text), refusing a timeout, a failure, anything not 2xx, anything over 2,000,000 characters, and
--     anything that isn't a JSON object with a JSON or plain-text content type.
-- Both are for the edge function only: service role, revoked from public, anon and authenticated. Only
-- https://maps.orc.govt.nz/arcgis/rest/services/... is accepted (exact host, no user part, no "..", plain URL characters, 2,000 at most).
-- pg_net follows redirects and that can't be turned off (tested: a redirect came back as the final page); so does the http extension.
-- A redirect from ORC's server would be followed; what comes back is still only accepted as a JSON object, and the function only ever
-- reads ArcGIS fields from it. Flagged for Tim.
-- pg_net keeps responses for 6 hours (pg_net.ttl). orc_http_requests keeps a small row per request (id, url, when); nothing removes them.
-- Additive: one table and two functions. No DELETE or DROP. Applied 18 November 2026 (live function bodies checked against this file).

create table public.orc_http_requests (
  id bigint primary key,            -- pg_net's request id
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.orc_http_requests enable row level security;   -- no policy: only the functions below read or write it
revoke all on public.orc_http_requests from anon, authenticated;

create or replace function public.orc_http_start(p_url text) returns bigint
language plpgsql security definer set search_path = public, net as $$
declare rid bigint;
begin
  if p_url is null or length(p_url) > 2000 or position('..' in p_url) > 0
     or p_url !~ '^https://maps\.orc\.govt\.nz/arcgis/rest/services/[A-Za-z0-9_.~%+=&*,:/?-]*$' then
    raise exception 'Not an allowed address';
  end if;
  rid := net.http_get(url := p_url, params := '{}'::jsonb, headers := '{"Accept":"application/json"}'::jsonb, timeout_milliseconds := 5000);
  insert into public.orc_http_requests (id, url) values (rid, p_url);
  return rid;
end $$;

create or replace function public.orc_http_result(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, net as $$
declare r net._http_response; j jsonb; ct text;
begin
  if not exists (select 1 from public.orc_http_requests where id = p_id) then raise exception 'Not a request made here'; end if;
  select * into r from net._http_response where id = p_id;
  if r.id is null then return jsonb_build_object('pending', true); end if;
  if coalesce(r.timed_out, false) then return jsonb_build_object('status', 0, 'error', 'timeout'); end if;
  if r.error_msg is not null or r.status_code is null then return jsonb_build_object('status', 0, 'error', 'network'); end if;
  if r.status_code < 200 or r.status_code >= 300 then return jsonb_build_object('status', r.status_code, 'error', 'http ' || r.status_code); end if;
  if length(coalesce(r.content, '')) > 2000000 then return jsonb_build_object('status', r.status_code, 'error', 'too large'); end if;
  ct := lower(coalesce(r.content_type, (select value from jsonb_each_text(coalesce(r.headers, '{}'::jsonb)) where lower(key) = 'content-type' limit 1), ''));
  if ct not like 'application/json%' and ct not like 'text/plain%' then return jsonb_build_object('status', r.status_code, 'error', 'not json'); end if;
  begin j := r.content::jsonb; exception when others then return jsonb_build_object('status', r.status_code, 'error', 'not json'); end;
  if jsonb_typeof(j) <> 'object' then return jsonb_build_object('status', r.status_code, 'error', 'not json'); end if;
  return jsonb_build_object('status', r.status_code, 'json', j);
end $$;

revoke all on function public.orc_http_start(text), public.orc_http_result(bigint) from public, anon, authenticated;
grant execute on function public.orc_http_start(text), public.orc_http_result(bigint) to service_role;
