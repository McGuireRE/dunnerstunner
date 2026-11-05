-- Phase 1, second review (5 November 2026).
-- Two owners with the same first and last name but different emails stay two people (a father and son,
-- say), and a merge never replaces an email already known. An email corrected on the agreement corrects the
-- same person on the property instead of adding a second one.

create or replace function public.merge_property_person(pid uuid, p_name text, p_pref text, p_email text, p_phone text, p_user uuid, p_source text) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.property_people; em text := lower(trim(coalesce(p_email,''))); nm text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
begin
  if nm = '' and em = '' then return null; end if;
  select * into r from public.property_people where property_id = pid and role <> 'former' and em <> '' and lower(email) = em order by position limit 1;
  if r.id is null and nm <> '' then select * into r from public.property_people where property_id = pid and role <> 'former' and (em = '' or email = '') and public.same_person_name(legal_name, nm) order by position limit 1; end if;   -- never merge two people with different emails
  if r.id is null then
    insert into public.property_people (property_id, position, legal_name, pref_name, email, phone, user_id, source, name_from, role)
    values (pid, coalesce((select max(position) from public.property_people where property_id = pid and role <> 'former'), 0) + 1, nm, coalesce(trim(p_pref),''), em, coalesce(trim(p_phone),''), p_user, p_source, p_source, 'owner')
    returning id into r.id;
  else
    update public.property_people set
      legal_name = case when nm <> '' and (legal_name = '' or public.name_rank(p_source) >= public.name_rank(coalesce(name_from, source))) then nm else legal_name end,
      name_from = case when nm <> '' and (legal_name = '' or public.name_rank(p_source) >= public.name_rank(coalesce(name_from, source))) then p_source else name_from end,
      pref_name = case when coalesce(trim(p_pref),'') <> '' then trim(p_pref) else pref_name end,
      email = case when em <> '' and email = '' then em else email end,   -- an email once known is never replaced by a merge
      phone = case when coalesce(trim(p_phone),'') <> '' then trim(p_phone) else phone end,
      user_id = coalesce(user_id, p_user),
      role = case when role = 'contact' and p_source <> 'appraisal' then 'owner' else role end
     where id = r.id;
  end if;
  return r.id;
end $$;

create or replace function public.agreement_person_after() returns trigger language plpgsql security definer set search_path = public as $$
declare ag public.agreements; r public.agreement_people;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select * into ag from public.agreements where id = r.agreement_id;
  if ag.property_id is null or ag.status in ('ended','cancelled') then return null; end if;
  if tg_op = 'DELETE' then
    update public.property_people pp set role = 'former'
     where pp.property_id = ag.property_id and pp.role <> 'former'
       and ((r.email <> '' and lower(pp.email) = lower(r.email)) or (coalesce(r.email,'') = '' and public.norm_name(pp.legal_name) = public.norm_name(r.legal_name)))
       and not exists (select 1 from public.agreements x join public.agreement_people y on y.agreement_id = x.id
                        where x.property_id = ag.property_id and x.id <> ag.id and x.status not in ('ended','cancelled')
                          and ((pp.email <> '' and lower(y.email) = lower(pp.email)) or public.norm_name(y.legal_name) = public.norm_name(pp.legal_name)));
  else
    -- an email corrected on the agreement corrects the same person on the property
    if tg_op = 'UPDATE' and coalesce(old.email,'') <> '' and lower(old.email) <> lower(coalesce(new.email,'')) and coalesce(new.email,'') <> ''
       and not exists (select 1 from public.property_people where property_id = ag.property_id and role <> 'former' and lower(email) = lower(new.email)) then
      update public.property_people set email = lower(trim(new.email)) where property_id = ag.property_id and role <> 'former' and lower(email) = lower(old.email);
    end if;
    perform public.merge_property_person(ag.property_id, r.legal_name, r.pref_name, r.email, r.phone, r.user_id, 'agreement');
  end if;
  return null;
end $$;

revoke execute on function public.merge_property_person(uuid,text,text,text,text,uuid,text), public.agreement_person_after() from public, anon, authenticated;
