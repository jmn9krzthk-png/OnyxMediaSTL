-- Onyx Media: core schema (tables, constraints, indexes, updated_at triggers).
-- Safe to run once on a fresh Supabase project. Run files in this folder in order.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- leads
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  business        text,
  email           text,
  phone           text,
  industry        text,
  source          text not null default 'website'
                  check (source in ('website', 'facebook', 'referral', 'walk_in', 'other')),
  status          text not null default 'new'
                  check (status in ('new', 'contacted', 'audit_sent', 'meeting_set', 'proposal_sent', 'won', 'lost')),
  notes           text,
  next_follow_up  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index leads_status_idx         on public.leads (status);
create index leads_next_follow_up_idx on public.leads (next_follow_up);
create index leads_email_idx          on public.leads (lower(email));
create index leads_created_at_idx     on public.leads (created_at desc);

-- ---------------------------------------------------------------- audit_requests
create table public.audit_requests (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.leads (id) on delete cascade,
  website              text,
  facebook_url         text,
  instagram_url        text,
  google_business_url  text,
  runs_ads             boolean,
  monthly_ad_spend     text,   -- a range label, e.g. "$500–$1,500"
  biggest_goal         text,
  status               text not null default 'requested'
                       check (status in ('requested', 'in_progress', 'sent')),
  audit_pdf_path       text,   -- path inside the private "audits" storage bucket
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index audit_requests_lead_id_idx on public.audit_requests (lead_id);
create index audit_requests_status_idx  on public.audit_requests (status);

-- ---------------------------------------------------------------- packages
create table public.packages (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  category       text not null check (category in ('content', 'ads')),
  monthly_price  numeric(10, 2) not null check (monthly_price >= 0),
  setup_fee      numeric(10, 2) not null default 0 check (setup_fee >= 0),
  deliverables   text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- package_offers
create table public.package_offers (
  id                     uuid primary key default gen_random_uuid(),
  lead_id                uuid not null references public.leads (id) on delete cascade,
  package_ids            uuid[] not null default '{}',  -- selected rows from public.packages
  custom_notes           text,
  custom_monthly_price   numeric(10, 2),  -- optional override of the package total
  custom_setup_fee       numeric(10, 2),
  public_token           text not null unique
                         default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  sent_at                timestamptz,
  viewed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index package_offers_lead_id_idx on public.package_offers (lead_id);

-- ---------------------------------------------------------------- clients
create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid references public.leads (id) on delete set null,
  business       text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  start_date     date,
  status         text not null default 'onboarding'
                 check (status in ('onboarding', 'active', 'paused', 'ended')),
  monthly_rate   numeric(10, 2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index clients_lead_id_idx on public.clients (lead_id);
create index clients_status_idx  on public.clients (status);

-- ---------------------------------------------------------------- client_packages
create table public.client_packages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  package_id  uuid not null references public.packages (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, package_id)
);
create index client_packages_package_id_idx on public.client_packages (package_id);

-- ---------------------------------------------------------------- onboarding
create table public.onboarding (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null unique references public.clients (id) on delete cascade,
  questionnaire     jsonb not null default '{}'::jsonb,
  access_checklist  jsonb not null default '{}'::jsonb,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- content_items
create table public.content_items (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  type             text not null check (type in ('reel', 'photo', 'graphic')),
  caption          text,
  planned_date     date,
  preview_url      text,
  approval_status  text not null default 'pending'
                   check (approval_status in ('pending', 'approved', 'changes_requested')),
  client_comment   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index content_items_client_date_idx on public.content_items (client_id, planned_date);

-- ---------------------------------------------------------------- shoots
create table public.shoots (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  shoot_date  date,
  location    text,
  shot_list   text,
  status      text not null default 'planned'
              check (status in ('planned', 'scheduled', 'completed', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index shoots_client_date_idx on public.shoots (client_id, shoot_date);

-- ---------------------------------------------------------------- reports
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  month       date not null,  -- first day of the month the report covers
  summary     jsonb not null default '{}'::jsonb,
  report_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, month)
);

-- ---------------------------------------------------------------- profiles
-- One row per Supabase Auth user who may use the admin area or (later) the client portal.
-- Rows are created by Max in the SQL Editor; users cannot create or edit their own profile.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin', 'client')),
  client_id   uuid references public.clients (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (role = 'admin' or client_id is not null)
);
create index profiles_client_id_idx on public.profiles (client_id);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['leads', 'audit_requests', 'packages', 'package_offers', 'clients',
                           'client_packages', 'onboarding', 'content_items', 'shoots', 'reports', 'profiles']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
