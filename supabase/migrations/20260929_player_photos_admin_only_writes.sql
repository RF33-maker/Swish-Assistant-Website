-- Player headshots: only admins may upload or overwrite them.
--
-- The previous policies let ANY signed-in user (every free member) insert and
-- update objects in the player-photos bucket. Headshots live at a predictable
-- path (<player id>/primary.<ext>) and the site uploads with upsert, so any
-- member could replace any player's public headshot; the follow-up
-- players-table write failed under its own RLS, but the image file had
-- already been swapped by then.
--
-- The role check reads app_metadata, which only the service role can write,
-- so it can't be spoofed from the browser. Server-side jobs use the service
-- role and bypass these policies. Public read access is unchanged.
--
-- When player accounts arrive, a player's own-photo policy can be added
-- alongside these (e.g. path prefix = the player_id in their app_metadata).

drop policy if exists "Authenticated upload to player-photos" on storage.objects;
drop policy if exists "Authenticated update player-photos" on storage.objects;

create policy "Admins upload to player-photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-photos'
    and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Admins update player-photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'player-photos'
    and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'player-photos'
    and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );
