-- Provisions the team_logos lookup table used by league pages to render team
-- logos in a single batched query (instead of per-team Supabase Storage HEAD
-- probes). Mirrors the Drizzle definition in shared/schema.ts (teamLogos),
-- plus a UNIQUE (league_id, team_name) constraint that the upsert calls in
-- server/routes.ts depend on (onConflict: 'league_id,team_name').

CREATE TABLE IF NOT EXISTS public.team_logos (
  id           SERIAL PRIMARY KEY,
  league_id    VARCHAR(255) NOT NULL,
  team_name    VARCHAR(255) NOT NULL,
  logo_url     TEXT         NOT NULL,
  uploaded_by  VARCHAR(255) NOT NULL,
  created_at   TIMESTAMP    DEFAULT NOW(),
  updated_at   TIMESTAMP    DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_logos_league_team_unique
  ON public.team_logos (league_id, team_name);

CREATE INDEX IF NOT EXISTS team_logos_league_id_idx
  ON public.team_logos (league_id);
