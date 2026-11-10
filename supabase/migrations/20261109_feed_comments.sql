-- Feed comments, with moderation.
--
-- Comments are written only by the site's server (service role), which checks
-- each one first: a signed-in account with a confirmed email, not muted, under
-- the rate limits, past the banned-terms filter and an AI check. Anything the
-- checks stop is kept as `held`: only its author and admins can see it, and it
-- waits in the admin queue. Three reports from different people hold a
-- visible comment until an admin looks at it.
--
-- Readers see `visible` comments through RLS; nobody writes from the browser.

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_key text not null check (char_length(post_key) between 1 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The name shown with the comment, as it was when it was posted.
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 500),
  -- visible: everyone sees it · held: author + admins only, waiting for review
  -- · removed: taken down by its author or an admin
  status text not null default 'visible' check (status in ('visible', 'held', 'removed')),
  -- Why it was held or removed: { source: 'filter'|'ai'|'reports'|'admin'|'author'|'unchecked', categories: [...], note }
  moderation jsonb not null default '{}'::jsonb,
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists feed_comments_post_visible on public.feed_comments (post_key, created_at) where status = 'visible';
create index if not exists feed_comments_queue on public.feed_comments (status, created_at desc);
create index if not exists feed_comments_user on public.feed_comments (user_id, created_at desc);

create table if not exists public.feed_comment_reports (
  comment_id uuid not null references public.feed_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('abuse', 'hate', 'about_a_player', 'spam', 'other')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- Accounts that can't comment, for a while (`until`) or for good (null).
create table if not exists public.feed_comment_mutes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  until timestamptz,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Words and phrases that stop a comment outright, matched after lower-casing
-- and undoing common disguises (l33t, s.p.a.c.i.n.g, repeated letters).
-- Kept in the database, not the code, so admins can add to it.
create table if not exists public.feed_banned_terms (
  term text primary key check (term = lower(term) and char_length(term) between 2 and 60),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.feed_comments enable row level security;
alter table public.feed_comment_reports enable row level security;
alter table public.feed_comment_mutes enable row level security;
alter table public.feed_banned_terms enable row level security;

-- Everyone reads visible comments; authors also see their own held ones; admins see all.
drop policy if exists feed_comments_read on public.feed_comments;
create policy feed_comments_read on public.feed_comments
  for select using (
    status = 'visible'
    or (status = 'held' and user_id = auth.uid())
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Reports, mutes and the term list: admins only (the server uses the service role).
drop policy if exists feed_comment_reports_admin on public.feed_comment_reports;
create policy feed_comment_reports_admin on public.feed_comment_reports
  for select using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
drop policy if exists feed_comment_mutes_admin on public.feed_comment_mutes;
create policy feed_comment_mutes_admin on public.feed_comment_mutes
  for select using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
drop policy if exists feed_banned_terms_admin on public.feed_banned_terms;
create policy feed_banned_terms_admin on public.feed_banned_terms
  for select using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');

grant select on public.feed_comments to anon, authenticated;
grant select on public.feed_comment_reports, public.feed_comment_mutes, public.feed_banned_terms to authenticated;

-- Visible comment counts for a page of posts.
create or replace function public.feed_comment_counts(keys text[])
returns table (post_key text, comments bigint)
language sql stable security invoker set search_path = public as $$
  select c.post_key, count(*) from public.feed_comments c
  where c.post_key = any(keys) and c.status = 'visible'
  group by c.post_key;
$$;
grant execute on function public.feed_comment_counts(text[]) to anon, authenticated;
