-- Migration: Add player enrichment columns for current_team, previous_teams, instagram_handle
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS current_team     text,
  ADD COLUMN IF NOT EXISTS previous_teams   text[],
  ADD COLUMN IF NOT EXISTS instagram_handle text;

-- Optional: add indexes if you plan to filter/search on these
-- CREATE INDEX IF NOT EXISTS players_instagram_handle_idx ON public.players (instagram_handle);
