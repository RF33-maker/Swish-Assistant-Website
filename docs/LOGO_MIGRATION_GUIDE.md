# Team Logo Migration Guide

## Overview
This guide explains how to migrate your team logos to use the new `logo_id` foreign key relationship between `teams` and `team_logos` tables.

## Database Changes Needed

### 1. Add `logo_id` column to `teams` table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
-- Add logo_id column to teams table
ALTER TABLE teams 
ADD COLUMN logo_id INTEGER REFERENCES team_logos(id);

-- Create index for better query performance
CREATE INDEX idx_teams_logo_id ON teams(logo_id);
```

### 2. Backfill logo_ids for existing teams

After adding the column, run this SQL to link existing teams to their logos:

```sql
-- Update teams with their corresponding logo_id based on team name and league
UPDATE teams t
SET logo_id = tl.id
FROM team_logos tl
WHERE t.league_id = tl.league_id
  AND t.name = tl.team_name;
```

### 3. Verify the migration

Check that teams have been linked to their logos:

```sql
SELECT 
  t.name,
  t.league_id,
  t.logo_id,
  tl.logo_url
FROM teams t
LEFT JOIN team_logos tl ON t.logo_id = tl.id
ORDER BY t.name;
```

## How It Works

### Before Migration
- Logos were looked up by matching team names against storage filenames
- Required complex string matching and multiple storage requests
- Prone to errors with team name variations

### After Migration
- Teams table has a direct foreign key (`logo_id`) to `team_logos` table
- Logo URLs are fetched via a simple JOIN query
- Much faster and more reliable
- When a logo is uploaded, the teams table is automatically updated

## API Behavior

The `/api/team-logos` endpoint now:
1. Saves the logo to `team_logos` table
2. Automatically updates the corresponding team record with the `logo_id`
3. Uses upsert to handle both new teams and existing teams

## Frontend Changes

The `TeamLogo` component now:
- Accepts an optional `logoUrl` prop
- If provided, uses it directly (no storage lookups needed)
- Falls back to file-based lookup if no `logoUrl` is provided (backwards compatible)

Standings and team pages now pass `logoUrl` from the joined query, eliminating expensive file lookups.
