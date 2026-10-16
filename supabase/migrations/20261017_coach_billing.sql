-- Coach billing: who has paid for coach access to which team, and the Stripe
-- events already processed.
--
-- A coach pays on Stripe (monthly subscription, or a one-off season pass).
-- The Stripe webhook records it here and, through the existing coach role
-- (auth app_metadata role "coach" + team_id), switches on their Coaches Hub
-- and scouting reports. The role is still what the rest of the site checks;
-- this table is the billing record behind it: the plan, when access ends, and
-- whether an admin has checked the person really coaches the team.
--
-- Both tables are reachable only through the site's server (RLS on, no
-- policies), like scout_agent_reports.

create table if not exists public.coach_access (
  id uuid primary key default gen_random_uuid(),
  -- One coach team per account, matching the single team_id on the coach role.
  user_id uuid not null unique,
  team_id uuid not null,
  team_name text not null,
  email text,
  plan text not null check (plan in ('monthly', 'season')),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired', 'refunded')),
  -- Season pass: the end of the season. Monthly: the end of the paid period.
  access_until timestamptz,
  cancel_at_period_end boolean not null default false,
  -- An admin has checked this person coaches this team. Gates anything private to a team.
  verified boolean not null default false,
  livemode boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_access_status_idx on public.coach_access (status, access_until);
create index if not exists coach_access_subscription_idx on public.coach_access (stripe_subscription_id);
create index if not exists coach_access_customer_idx on public.coach_access (stripe_customer_id);
create index if not exists coach_access_payment_intent_idx on public.coach_access (stripe_payment_intent_id);

alter table public.coach_access enable row level security;

-- Stripe retries webhooks and can deliver one twice; an event is handled once.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
