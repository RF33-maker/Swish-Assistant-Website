-- Ask Swish: one row per question, so quotas (per hour / week / month) and
-- spend (tokens per answer) can both be read from the same place.
-- Written only by the site's server with the service role; no client access.

create table if not exists public.ask_swish_questions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  tier text not null check (tier in ('free', 'pro')),
  model text not null,
  surface text not null default 'site',
  asked_at timestamptz not null default now(),
  rounds int,
  input_tokens int,
  cache_write_tokens int,
  cache_read_tokens int,
  output_tokens int,
  status text not null default 'started' check (status in ('started', 'done', 'failed'))
);

create index if not exists ask_swish_questions_user_time on public.ask_swish_questions (user_id, asked_at desc);

alter table public.ask_swish_questions enable row level security;
-- No policies: the service role bypasses RLS and nothing else may read or write.

comment on table public.ask_swish_questions is 'Ask Swish questions: quota windows and token spend per answer. Server-only.';
