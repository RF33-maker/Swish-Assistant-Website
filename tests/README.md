# Embed widget e2e tests

Cross-origin Playwright tests that verify the public embeddable widgets
render, auto-resize, and tolerate bad params when loaded from a different
origin via `<iframe>`.

## What is covered

- Loads `/widget/standings`, `/widget/game-scores`, and
  `/widget/league-leaders` inside a tiny http server running on a
  different origin (127.0.0.1:<random>) than the app (localhost:5000).
- Asserts each widget mounts (`[data-testid="widget-root"]`) without
  console errors.
- Subscribes to `window.message` events of type `swish-widget-resize`
  and asserts the parent receives at least one height message and that
  the largest reported height is in the expected range — proving the
  iframe posts a *content* height (not the iframe viewport min-height).
- Verifies that `/widget/standings` with no `leagueSlug` shows the
  friendly `widget-error` block instead of blanking out.
- Verifies the `Content-Security-Policy: frame-ancestors *` header is
  set on widget responses and `X-Frame-Options` is absent.

## How to run

```sh
# 1) start the app on :5000 (the existing "Start application" workflow)
# 2) install browser binaries the first time
npx playwright install chromium
# 3) run the tests
APP_ORIGIN=http://localhost:5000 npx playwright test
```

Override `TEST_LEAGUE_SLUG` if the default seed league changes. Set
`TEST_PLAYER_ID=<uuid-or-slug>` to also exercise the player-stats
widget against real data; without it, the test asserts the friendly
"no player" error instead.

## Anonymous public-read audit

The widgets all use the anon Supabase client (`client/src/lib/supabase.ts`)
with no service-role key. RLS therefore enforces public access:

- `leagues` reads are filtered by `is_public = true` everywhere
  (StandingsWidget, GameScoresWidget, LeagueLeadersWidget,
  PlayerStatsWidget) so private leagues never resolve.
- `teams`, `player_stats`, and `v_game_results` reads happen only after
  a public league has been resolved.
- The cross-origin Playwright run above implicitly re-validates this:
  if any of these queries needed authentication, the widgets would show
  the empty/error state rather than rendering rows in the test browser.
