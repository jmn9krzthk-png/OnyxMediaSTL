-- Onyx Media: ad attribution on audit requests (Google Ads landing pages /lp/*).
-- Adds nullable columns only, so the existing /audit form keeps working unchanged.
-- Row-level security is untouched: audit_requests already has RLS enabled, anon has no
-- access, admins have full access, and the public forms write through Netlify Functions
-- with the secret key. New columns inherit those table-level rules.
-- Safe to re-run (IF NOT EXISTS / constraint guard).

alter table public.audit_requests
  add column if not exists lead_source      text,   -- e.g. 'lp-paid-ads', 'lp-social-media'; null = /audit form
  add column if not exists service_interest text,   -- 'paid_ads' | 'social_media'
  add column if not exists gclid            text,
  add column if not exists utm_source       text,
  add column if not exists utm_medium       text,
  add column if not exists utm_campaign     text,
  add column if not exists utm_term         text,
  add column if not exists utm_content      text,
  add column if not exists landing_page     text,
  add column if not exists referrer         text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_requests_lead_source_chk') then
    alter table public.audit_requests
      add constraint audit_requests_lead_source_chk
      check (lead_source is null or lead_source ~ '^[a-z0-9][a-z0-9-]{0,39}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'audit_requests_service_interest_chk') then
    alter table public.audit_requests
      add constraint audit_requests_service_interest_chk
      check (service_interest is null or service_interest in ('paid_ads', 'social_media'));
  end if;
end;
$$;

create index if not exists audit_requests_lead_source_idx on public.audit_requests (lead_source);
