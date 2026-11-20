-- Onyx Media: row-level security.
--   * Admins (profiles.role = 'admin') can do everything.
--   * Clients can read only their own client, content_items, shoots and reports rows,
--     and can update only approval_status and client_comment on their own content_items.
--   * Anonymous visitors get no table access. Public website forms go through
--     Netlify Functions, which use the secret key (that key bypasses RLS).

-- ---------------------------------------------------------------- role helpers
-- SECURITY DEFINER so these can read profiles without tripping profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.my_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_id from public.profiles
  where id = (select auth.uid()) and role = 'client';
$$;

revoke all on function public.is_admin()     from public, anon;
revoke all on function public.my_client_id() from public, anon;
grant execute on function public.is_admin()     to authenticated;
grant execute on function public.my_client_id() to authenticated;

-- ---------------------------------------------------------------- enable RLS, lock out anon
do $$
declare t text;
begin
  foreach t in array array['leads', 'audit_requests', 'packages', 'package_offers', 'clients',
                           'client_packages', 'onboarding', 'content_items', 'shoots', 'reports', 'profiles']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- Admins: full access
    execute format('create policy admin_all on public.%I for all to authenticated
                    using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- client read access
create policy client_read_own on public.clients
  for select to authenticated
  using (id = (select public.my_client_id()));

create policy client_read_own on public.content_items
  for select to authenticated
  using (client_id = (select public.my_client_id()));

create policy client_read_own on public.shoots
  for select to authenticated
  using (client_id = (select public.my_client_id()));

create policy client_read_own on public.reports
  for select to authenticated
  using (client_id = (select public.my_client_id()));

-- Every signed-in user can read their own profile (the admin page uses this to check the role).
-- There is deliberately NO insert/update policy for non-admins: nobody can promote themselves.
create policy read_own_profile on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------- client content approvals
create policy client_update_own_approval on public.content_items
  for update to authenticated
  using (client_id = (select public.my_client_id()))
  with check (client_id = (select public.my_client_id()));

-- RLS can't limit which columns change, so this trigger does: a signed-in non-admin
-- may change approval_status and client_comment only. (The secret key used by
-- Netlify Functions has no auth.uid(), so server code is not affected.)
create or replace function public.content_items_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if (to_jsonb(new) - array['approval_status', 'client_comment', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['approval_status', 'client_comment', 'updated_at']) then
      raise exception 'Clients can only change approval_status and client_comment'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger content_items_client_guard
  before update on public.content_items
  for each row execute function public.content_items_client_guard();
