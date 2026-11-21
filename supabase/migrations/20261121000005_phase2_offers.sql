-- Onyx Media Phase 2: proposal acceptance fields and lead → client conversion.
-- Adds columns only (no data is changed or removed). Run once, after files 1–4.

alter table public.package_offers
  add column if not exists waive_setup_with_prepay boolean not null default false, -- offer: setup fee waived if first month is paid upfront
  add column if not exists accepted_at      timestamptz,
  add column if not exists accepted_name    text,     -- name typed by the prospect when accepting
  add column if not exists accepted_prepay  boolean,  -- prospect chose to pay the first month upfront (setup waived)
  add column if not exists accepted_note    text;

-- Turn a lead into a client in one step (admin only):
-- creates the client, copies the packages from the accepted offer, opens an onboarding record,
-- and marks the lead as won. Calling it again for the same lead returns the existing client.
create or replace function public.convert_lead_to_client(p_lead uuid, p_offer uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead   public.leads;
  v_offer  public.package_offers;
  v_client uuid;
  v_rate   numeric(10, 2);
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead;
  if not found then raise exception 'Lead not found'; end if;

  select id into v_client from public.clients where lead_id = p_lead order by created_at limit 1;

  if v_client is null then
    if p_offer is not null then
      select * into v_offer from public.package_offers where id = p_offer and lead_id = p_lead;
      if not found then raise exception 'That proposal does not belong to this lead'; end if;
      v_rate := coalesce(v_offer.custom_monthly_price,
                         (select sum(monthly_price) from public.packages where id = any (v_offer.package_ids)));
    end if;

    insert into public.clients (lead_id, business, contact_name, contact_email, contact_phone, status, monthly_rate)
    values (p_lead, coalesce(nullif(v_lead.business, ''), v_lead.name), v_lead.name, v_lead.email, v_lead.phone,
            'onboarding', v_rate)
    returning id into v_client;

    if p_offer is not null then
      insert into public.client_packages (client_id, package_id)
      select v_client, pid from unnest(v_offer.package_ids) as pid
      where exists (select 1 from public.packages where id = pid)
      on conflict (client_id, package_id) do nothing;
    end if;

    insert into public.onboarding (client_id) values (v_client) on conflict (client_id) do nothing;
  end if;

  update public.leads set status = 'won', next_follow_up = null where id = p_lead;
  return v_client;
end;
$$;

revoke all on function public.convert_lead_to_client(uuid, uuid) from public, anon;
grant execute on function public.convert_lead_to_client(uuid, uuid) to authenticated;
