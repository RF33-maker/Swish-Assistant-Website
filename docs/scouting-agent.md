# Scouting agent

Pre-game opponent scouting reports and game plans, shown at the top of the
Opponent Scout Report in the Coaches Hub.

## Tiers

| Tier | Who | Model | Written for | When it's built |
|------|-----|-------|-------------|-----------------|
| `full` | Coach accounts (`app_metadata.role = "coach"`), admins, competition owners | `claude-opus-5-5` (`SCOUT_MODEL_FULL`) | The coach's own team (includes a matchup block) | Automatically, 5 days before every fixture involving a coach account's team; or on demand ("Build game plan") |
| `preview` ("free look") | Any signed-in visitor | `claude-sonnet-5-5` (`SCOUT_MODEL_PREVIEW`) | Nobody in particular: one shared row per opponent | On demand ("Get a free look"), reused for 72h |

The free look is a headline, a summary and two priorities. Everything else
(defensive/offensive keys, players to stop, lineup triggers, late game) is
full-tier only.

## How it fits together

```
pg_cron (every 10 min)
  └─ POST scout-agent {action: "sweep"}     supabase/functions/scout-agent/index.ts
       └─ finds fixtures in next 5 days with a coach-account team
       └─ POST scout-agent {action: "build", tier: "full"} per fixture (own invocation)

Site (Express on Vercel)                    server/scoutAgentRoutes.ts
  GET  /api/scout-agent/report   → reads scout_agent_reports, applies the paywall
  POST /api/scout-agent/build    → coach/admin/owner only, tier "full"
  POST /api/scout-agent/preview  → any signed-in user, tier "preview"

Edge function build:
  load.ts   pulls the opponent's last 10 games across every competition the club
            plays in (club identity via isSameTeam), plus the league baseline
  facts.ts  pure function: raw rows → fact pack (every number the model may quote)
  agent.ts  Claude call with a JSON schema; the model never sees raw tables
  → writes scout_agent_reports (status, facts, plan, teaser, tier, model)
```

UI: `client/src/components/coaches-hub/AgentGamePlan.tsx`, mounted in
`OpponentScoutReport.tsx`.

## Database

- `public.scout_agent_reports`: one row per (league_id, opponent_name,
  for_team_name). Previews use `for_team_name = ''`. RLS is on with **no
  policies**: only the service role (edge function, site server) can read or
  write it. That is deliberate; it's where the paywall lives.
- `public.scout_agent_secret(name)`: service-role-only lookup of Vault
  secrets `scout_agent_cron_secret` and `anthropic_api_key`.
- Vault `scout_agent_cron_secret`: shared secret the function requires in the
  `x-scout-secret` header. pg_cron and the site server both read it from Vault.
- Cron job `scout-agent-sweep`, `*/10 * * * *`.

Migrations: `supabase/migrations/20260929_scout_agent_*.sql`. All four are
already applied to the DEV project (`omkwqpcgttrgvbhcxgqf`).

## Current state (29 Sep 2026)

- Tables, secret, cron job: live.
- Edge function: **deployed version is one step behind the repo**. The live
  version has no tiers (it builds Opus plans for both sides of every
  fixture). Redeploy from this repo before adding the API key (see below).
- No Anthropic key yet, so the sweep currently returns
  `{"skipped": "ANTHROPIC_API_KEY not configured"}` and nothing is spent.
- Fact engine verified by hand against real data (Leicester Riders ahead of
  London Lions, 2 Oct). Model output not yet seen, because there's no key.
- Site changes not deployed; the full dependency install and `npm run build`
  haven't been run on this branch yet.

## Going live

1. Deploy the function:
   ```
   supabase functions deploy scout-agent --project-ref omkwqpcgttrgvbhcxgqf --no-verify-jwt
   ```
   (`--no-verify-jwt` is intended: the function checks `x-scout-secret` itself.)
2. Add the key, either as a function secret:
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref omkwqpcgttrgvbhcxgqf
   ```
   or in the SQL editor: `select vault.create_secret('sk-ant-...', 'anthropic_api_key');`
3. Build the site and deploy to Vercel. The site needs `VITE_SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY`, which it already uses.
4. Check the first reports. Read `plan` against `facts` for a few rows and make
   sure every number quoted is in the facts.

## Testing without the model

The `facts` action runs the whole pipeline except the Claude call:

```sql
select net.http_post(
  url := 'https://omkwqpcgttrgvbhcxgqf.supabase.co/functions/v1/scout-agent',
  headers := jsonb_build_object('content-type','application/json',
    'x-scout-secret',(select decrypted_secret from vault.decrypted_secrets where name='scout_agent_cron_secret')),
  body := jsonb_build_object('action','facts',
    'leagueId','5a523409-946d-425b-a390-3ee615fb9d9a',
    'opponentName','Leicester Riders','forTeamName','London Lions'));
-- then: select status_code, content::jsonb from net._http_response order by id desc limit 1;
```

`facts.ts` has no database access, so it can also be run locally with `tsx`
against rows exported from Supabase.

## Feed quirks the fact engine works around

These were all found in real data. They're handled in `facts.ts`, but they
originate upstream and probably affect the site's other lineup features too:

- **No running score in older games.** `live_events.team_score/opp_score` are
  null for 2025-26 games, so the score timeline (runs, close games) is rebuilt
  from made baskets.
- **One player, several names in one game.** "Jaylon White", "J. White",
  "J. WHITE" appear in the same game's rows. Players are keyed on first
  initial + surname.
- **Phantom lineup stints.** Some periods carry an extra whole-period stint
  with no points either way, overlapping the real chain of stints (a game
  added up to 50 minutes). When a period overfills, scoreless overlapping
  stints are dropped. `player_on_court_stints` has the same duplication, so
  player minutes are derived from the cleaned lineup stints instead.
- **Unlinked assists in older games.** `previous_action` is null on assists;
  the made shot just before it is used instead.
- **Rebuilt rosters.** The last 10 games often span last season. Player,
  lineup and closing-five analysis is limited to the current roster (the last
  21 days of game rosters), and `rosterContinuity` tells the model how much of
  last season's scoring is still on the team.
- **Thin early-season baselines.** When the scouted competition has fewer than 4
  games per team, league ranks also include the competition most of the
  opponent's recent games came from (normally last season), grouped by club.

## Open items

- Fix the phantom stints and mixed name formats where lineups are built, not
  just in this agent.
- 12 public tables have RLS disabled (including `lineup_stints`,
  `player_on_court_stints`, `game_rosters`, `newsletter_signups`). Anyone with
  the anon key can read or modify them. Enabling RLS needs read policies first,
  or the site breaks.
- Once real plans exist: tune the prompt in `agent.ts` against coach feedback,
  and consider a "Print / PDF" view for the bench.
- `teamIdentity.ts` is a copy of `isSameTeam` from
  `server/teamIdentityService.ts` (Deno can't import the server module). Keep
  them in step.
