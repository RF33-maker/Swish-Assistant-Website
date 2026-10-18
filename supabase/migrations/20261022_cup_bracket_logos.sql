-- National Cup bracket: team crests
--
-- Basketball England shows a crest beside every team in its fixtures list. Saved with each
-- bracket game so the bracket can show them (and take its team colours from them) for clubs
-- that have no team row or logo in Swish.

ALTER TABLE public.cup_bracket_games
  ADD COLUMN IF NOT EXISTS home_logo_url text,
  ADD COLUMN IF NOT EXISTS away_logo_url text;
