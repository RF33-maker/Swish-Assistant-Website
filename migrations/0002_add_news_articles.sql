-- News articles table powering the "Latest News" section on the landing page.
-- Run this snippet in Supabase (SQL editor) to enable the section.
-- The frontend reads rows where is_published = true, ordered by published_at desc.

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  body text,
  image_url text,
  source_url text,
  league text,
  published_at timestamptz not null default now(),
  is_published boolean not null default true
);

create index if not exists news_articles_published_at_idx
  on public.news_articles (published_at desc)
  where is_published = true;

-- Allow anonymous reads of published articles (matches landing page query).
alter table public.news_articles enable row level security;

drop policy if exists "Public can read published news" on public.news_articles;
create policy "Public can read published news"
  on public.news_articles
  for select
  using (is_published = true);
