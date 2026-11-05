-- Swish+ and Coach entitlements: what a person has, never where they paid.
--
-- One row per grant. `plus` unlocks the Swish+ features (deeper player stats,
-- comparisons, more Ask questions); `coach` unlocks the Coaches Hub. Every
-- Coach grant also writes a `plus` row with source 'coach_bundle', with the
-- same end date, so coaches get Swish+ included and lose both together.
--
-- Written only by the site's server (Stripe webhook now, Apple later) with the
-- service role. A signed-in person may read their own rows, which is how the
-- site and the app decide what to show.
--
-- Spec: docs/pricing-and-entitlements.md.

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (entitlement in ('plus', 'coach')),
  source text not null check (source in ('apple', 'stripe', 'coach_bundle', 'manual')),
  -- Apple original_transaction_id, Stripe subscription id, or the coach_access id for a bundle.
  external_ref text,
  -- null = no expiry (manual grants). Access holds while expires_at is in the future.
  expires_at timestamptz,
  -- Billing detail for the account page; access never depends on these.
  plan text check (plan in ('monthly', 'annual', 'season')),
  founding boolean not null default false,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entitlement, source)
);

create index if not exists user_entitlements_user_idx on public.user_entitlements (user_id, entitlement);
create index if not exists user_entitlements_ref_idx on public.user_entitlements (external_ref);

alter table public.user_entitlements enable row level security;

drop policy if exists "read own entitlements" on public.user_entitlements;
create policy "read own entitlements" on public.user_entitlements
  for select to authenticated using (user_id = auth.uid());

-- For RLS policies and server checks. Security definer so a policy on another
-- table can call it; it only answers about the caller unless run by the server.
create or replace function public.has_entitlement(uid uuid, ent text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (uid = auth.uid() or auth.role() = 'service_role')
     and exists (
       select 1 from public.user_entitlements
       where user_id = uid
         and entitlement = ent
         and (expires_at is null or expires_at > now())
     );
$$;

revoke all on function public.has_entitlement(uuid, text) from public, anon;
grant execute on function public.has_entitlement(uuid, text) to authenticated, service_role;

-- Ask Swish questions now come in three tiers (free, plus, pro). The table is
-- created by 20261030_ask_swish_usage.sql; widen its check if it already exists.
do $$
begin
  if to_regclass('public.ask_swish_questions') is not null then
    alter table public.ask_swish_questions drop constraint if exists ask_swish_questions_tier_check;
    alter table public.ask_swish_questions add constraint ask_swish_questions_tier_check check (tier in ('free', 'plus', 'pro'));
  end if;
end $$;

comment on table public.user_entitlements is 'Swish+ (plus) and Coach (coach) grants per user. Server writes; users read their own.';
