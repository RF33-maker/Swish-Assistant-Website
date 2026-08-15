-- Storage bucket for news article images uploaded from the in-app News Manager.
-- Run this snippet in Supabase (SQL editor) to enable image uploads from the
-- News Manager dashboard.
--
-- The frontend uploads files to the `news-images` bucket and saves the resulting
-- public URL into news_articles.image_url. Bucket is public-read so the home
-- page "Latest News" cards can render the images directly from CDN.

insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = true;

-- Allow anyone to read news images (matches the public LatestNewsSection).
drop policy if exists "Public can read news images" on storage.objects;
create policy "Public can read news images"
  on storage.objects
  for select
  using (bucket_id = 'news-images');

-- Allow authenticated users to upload, update, and delete news images.
drop policy if exists "Authenticated can upload news images" on storage.objects;
create policy "Authenticated can upload news images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'news-images');

drop policy if exists "Authenticated can update news images" on storage.objects;
create policy "Authenticated can update news images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'news-images')
  with check (bucket_id = 'news-images');

drop policy if exists "Authenticated can delete news images" on storage.objects;
create policy "Authenticated can delete news images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'news-images');

-- Allow authenticated users to write to the news_articles table from the
-- News Manager UI. Public reads are already covered by the migration in
-- 0002_add_news_articles.sql.
drop policy if exists "Authenticated can insert news" on public.news_articles;
create policy "Authenticated can insert news"
  on public.news_articles
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated can update news" on public.news_articles;
create policy "Authenticated can update news"
  on public.news_articles
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated can delete news" on public.news_articles;
create policy "Authenticated can delete news"
  on public.news_articles
  for delete
  to authenticated
  using (true);

-- Allow authenticated users to read all articles (including drafts) so the
-- News Manager list can show drafts alongside published items.
drop policy if exists "Authenticated can read all news" on public.news_articles;
create policy "Authenticated can read all news"
  on public.news_articles
  for select
  to authenticated
  using (true);
