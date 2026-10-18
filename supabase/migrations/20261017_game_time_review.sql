-- Game time review · game_time_changes, game_time_dismissals
--
-- game_schedule.matchtime is UK wall-clock time labelled +00 (see
-- shared/gameTime.ts), written by the schedule-sheet importer. Nothing records
-- when a game's time changes, so a wrong time, or a good correction that a
-- re-uploaded sheet quietly puts back, leaves no trace.
--
--  * game_time_changes   every change to a game's matchtime: old, new, who or
--                        what made it. A trigger writes it, so importer
--                        changes are logged as well as admin corrections.
--  * game_time_dismissals  "looked at it, the time is right": hides a game from
--                        the review page until its time changes again.
--  * apply_game_time_change()  the one way the admin page changes a time; it
--                        tags the change with the admin so the trigger logs it.
--
-- Clients never read or write these: the admin API uses the service role. RLS
-- is on with no policies and no grants, so the tables are invisible to anon and
-- authenticated clients.

CREATE TABLE IF NOT EXISTS public.game_time_changes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key      TEXT        NOT NULL,
  old_matchtime TIMESTAMPTZ,
  new_matchtime TIMESTAMPTZ,
  source        TEXT        NOT NULL DEFAULT 'import' CHECK (source IN ('import', 'admin_review')),
  changed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  note          TEXT        CHECK (pg_catalog.char_length(note) <= 300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_time_changes_game
  ON public.game_time_changes (game_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_time_changes_created
  ON public.game_time_changes (created_at DESC);

CREATE TABLE IF NOT EXISTS public.game_time_dismissals (
  game_key               TEXT        PRIMARY KEY,
  matchtime_at_dismissal TIMESTAMPTZ NOT NULL,
  dismissed_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  note                   TEXT        CHECK (pg_catalog.char_length(note) <= 300),
  dismissed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_time_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_time_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_time_changes FROM anon, authenticated;
REVOKE ALL ON public.game_time_dismissals FROM anon, authenticated;

-- Log every change to matchtime. The admin function below sets three
-- transaction-local settings so its change is tagged; anything else (the
-- importer, a hand-run SQL fix) is logged as 'import' with no user.
CREATE OR REPLACE FUNCTION public.log_game_time_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.game_time_changes (game_key, old_matchtime, new_matchtime, source, changed_by, note)
  VALUES (
    NEW.game_key,
    OLD.matchtime,
    NEW.matchtime,
    COALESCE(NULLIF(pg_catalog.current_setting('app.matchtime_source', true), ''), 'import'),
    NULLIF(pg_catalog.current_setting('app.matchtime_admin', true), '')::uuid,
    NULLIF(pg_catalog.current_setting('app.matchtime_note', true), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_schedule_log_matchtime ON public.game_schedule;
CREATE TRIGGER game_schedule_log_matchtime
  AFTER UPDATE OF matchtime ON public.game_schedule
  FOR EACH ROW
  WHEN (OLD.matchtime IS DISTINCT FROM NEW.matchtime)
  EXECUTE FUNCTION public.log_game_time_change();

-- Change one game's time on an admin's say-so. Also clears any "time is right"
-- dismissal, since the time it vouched for is gone.
CREATE OR REPLACE FUNCTION public.apply_game_time_change(
  p_game_key  TEXT,
  p_matchtime TIMESTAMPTZ,
  p_admin     UUID,
  p_note      TEXT DEFAULT NULL
)
RETURNS TABLE (old_matchtime TIMESTAMPTZ, new_matchtime TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old TIMESTAMPTZ;
BEGIN
  SELECT g.matchtime INTO v_old FROM public.game_schedule g WHERE g.game_key = p_game_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game % not found', p_game_key USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.set_config('app.matchtime_source', 'admin_review', true);
  PERFORM pg_catalog.set_config('app.matchtime_admin', COALESCE(p_admin::text, ''), true);
  PERFORM pg_catalog.set_config('app.matchtime_note', COALESCE(p_note, ''), true);

  UPDATE public.game_schedule SET matchtime = p_matchtime WHERE game_key = p_game_key;
  DELETE FROM public.game_time_dismissals WHERE game_key = p_game_key;

  RETURN QUERY SELECT v_old, p_matchtime;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_game_time_change(TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_game_time_change(TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.log_game_time_change() FROM PUBLIC, anon, authenticated;
