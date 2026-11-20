-- Onyx Media: private storage buckets. Only admins can read or write files.
-- (Netlify Functions using the secret key bypass these policies.)

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false),
       ('audits',       'audits',       false)
on conflict (id) do update set public = false;

create policy onyx_admin_select on storage.objects
  for select to authenticated
  using (bucket_id in ('brand-assets', 'audits') and (select public.is_admin()));

create policy onyx_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('brand-assets', 'audits') and (select public.is_admin()));

create policy onyx_admin_update on storage.objects
  for update to authenticated
  using (bucket_id in ('brand-assets', 'audits') and (select public.is_admin()))
  with check (bucket_id in ('brand-assets', 'audits') and (select public.is_admin()));

create policy onyx_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('brand-assets', 'audits') and (select public.is_admin()));
