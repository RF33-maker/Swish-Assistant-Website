-- Player identity tables for linking the same real-world person
-- across multiple league/competition player_id rows.
--
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- player_identities: one row per real-world person identity.
--   canonical_name          – best display name for this person
--   photo_path              – Supabase storage path (player-photos bucket)
--   photo_path_bg_removed   – background-removed variant
--
-- player_identity_members: many-to-one mapping of players rows → identity.
--   player_id is UNIQUE so a player can only belong to one identity group.

CREATE TABLE IF NOT EXISTS player_identities (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name          TEXT NOT NULL,
  photo_path              TEXT,
  photo_path_bg_removed   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_identity_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES player_identities(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id)
);

CREATE INDEX IF NOT EXISTS idx_pim_identity_id ON player_identity_members (identity_id);
CREATE INDEX IF NOT EXISTS idx_pim_player_id   ON player_identity_members (player_id);

-- Optional: auto-update updated_at on player_identities
CREATE OR REPLACE FUNCTION update_player_identities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_player_identities_updated_at ON player_identities;
CREATE TRIGGER trg_player_identities_updated_at
  BEFORE UPDATE ON player_identities
  FOR EACH ROW EXECUTE FUNCTION update_player_identities_updated_at();
