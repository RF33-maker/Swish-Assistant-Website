# Swish plans: what comes in each

Fills in section 2 of `swish-pricing-spec.md` (the pricing and entitlements spec) for the site and the iOS app as they stand on 2026-11-05. **Proposal.** Nothing free today is gated; the new Swish+ features show to admins only until `VITE_SWISH_PLUS_LIVE=true`.

## The rule behind the split

*Changed 2026-11-05 at the user's request.*

**Nothing that is free on Swish today goes behind Swish+.** Swish+ sells only depth that isn't freely available anywhere: lineups, clutch and context numbers, advanced metrics beyond the ones already on the site, and in-depth alerts. That covers every page on the site today, including profiles with every season, splits, shot zones, rank badges, game On/Off, player comparison and the landscape.

Each Swish+ feature is new work. Gates go on as each one is built, and Swish+ goes on sale once there is enough behind it.

## Feature split

| Feature | Free | Swish+ | Coach | League member | Key |
|---|---|---|---|---|---|
| **Free, as it is today** | | | | | |
| Live scores, schedules, results, standings, brackets | ✅ | ✅ | ✅ | ✅ | — |
| Box scores, play-by-play, game flow, shot chart, points breakdown, game On/Off | ✅ | ✅ | ✅ | ✅ | — |
| League leaders, team pages, team stats, comparisons, landscape | ✅ | ✅ | ✅ | ✅ | — |
| Player profiles: every season, career, splits, on/off, shot zones, rank badges | ✅ | ✅ | ✅ | ✅ | — |
| News, follows, For You home, Feed tab, shareable cards | ✅ | ✅ | ✅ | ✅ | — |
| **Only on Swish+** | | | | | |
| Every lineup (built): every five-man unit, three-man group and pair, sortable, with the four factors for and against | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Clutch (built): close-game record, clutch net rating and four factors, players' clutch lines, the competition's clutch table | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| On/off four factors (built): each player's on and off net rating, swing, and eFG% / TOV% / OREB% / FT/FGA on vs off, for and against | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Still to build: shot profile against league average, competitive minutes (garbage time out) | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Alerts on followed players and teams: tip-off, live big lines, close finishes, milestones | Final scores | ✅ | ✅ | Final scores | `plus` |
| Ask Swish | 80 a month | 300 a month | 5,000 a month | 80 a month | `plus` / `coach` |
| **Coaching (web only)** | | | | | |
| Coaches Hub, advanced insights (own team, last 3/5 games), scouting, reports, playbook | ❌ | ❌ | ✅ | ❌ | `coach` |
| **League (web only, organiser pays)** | | | | | |
| League hosted on Swish, uploads, scorer's table, live publishing, invite codes | — | — | — | ✅ by role | league paid |

Coach includes Swish+ automatically (`plus` row with `source = 'coach_bundle'`). Admins get everything, as today.

### What the Swish+ features build on

- **Lineups:** `lineup_stints` holds 54,000 stints from 1,142 games in 23 competitions, with points, possessions and full box numbers for both sides. The free "Best lineups" panel on team pages already shows each team's top three five-man units by net rating, plus/minus or minutes, and stays free. Swish+ adds everything beyond it: every unit, threes and pairs, the four factors for and against, and players on/off.
- **Clutch:** built from `live_events` (the play-by-play) and the lineup stints, not from `lineup_stints_context_v1`.
- **Deeper metrics:** the `opp_*` columns on `lineup_stints` give opponent shooting, rebounding and turnovers with each player on the floor.
- **Alerts:** nothing exists yet. App push waits for the paid Apple Developer account, and web push or email could come first. `user_follows` already says who follows what.

## How this fits what is already built

- **Coach billing exists.** PR 217 (merged 2026-10-16) sells Coach at £10 a month or a £75 season pass through Stripe. It writes `coach_access` and turns on the `coach` role in auth metadata. No one has paid yet (`coach_access` is empty), so it can move onto `user_entitlements` cleanly. The Stripe webhook would write `coach` and its bundled `plus` row, and the role would follow from those.
- **A `leagues` table already exists** and means something else. A "league" in the spec is a `competitions` row here. `competition_managers` already gives organisers shared access. The League plan should therefore use `competition_subscriptions` and `competition_members` / `competition_invites` rather than the spec's table names.
- **Ask Swish has free and pro tiers in code** (5 an hour, 30 a week, 80 a month; pro is the coach/admin tier). The `ask_swish_questions` table was never created, so only the hourly limit is enforced, and only in memory. It must exist before Ask limits can be sold.
- **`/payment` advertises old "Individual / All Access" plans.** It would become the Swish+ page on the web.
- **Apple in-app purchase needs the paid Apple Developer account**, the same blocker as push. Swish+ on the web through Stripe can ship first. The app shows Swish+ unlocked for web buyers, and IAP is added when the account is ready.

## App Store rules carried into the build

- The app never shows web prices, web checkout links or "buy on the website" text.
- Swish+ in the app is sold only through IAP and needs a Restore Purchases button. The buy button is hidden when `plus` is already active from any source.
- Coach and League stay web only. In the app, a coach just sees their access, and a scorer just sees "Join a league with your invite code".

## Prices

| Plan | Monthly | Annual |
|---|---|---|
| Swish+ | £4.99 | £39.99 |
| Swish+ for accounts made before launch | £3.99 (20% off) | £31.99 (20% off) |
| Coach | £10 | £75 season pass (to 31 May) |

- **Web:** one Stripe price per period, plus a 20% "forever" coupon. Checkout applies the coupon automatically when the account was created before the launch date.
- **iOS:** Apple has no "existing account" discount. The app uses a second Swish+ product at £3.99 / £31.99 in the same subscription group and shows it only to eligible accounts.
- The discount lasts as long as the subscription stays active. If someone cancels and comes back later, they pay the full price.

## What is built (branch feature/swish-plus)

- **Database:** migration `20261106_swish_plus_entitlements.sql`, which adds `user_entitlements`, a read-your-own-rows policy and `has_entitlement()`. It also widens the Ask question log to free / plus / pro. Both it and `20261030_ask_swish_usage.sql` were applied to the live database on 2026-11-05. The live site's Ask Swish already writes to `ask_swish_questions`, so its weekly and monthly limits (free 30 a week, 80 a month) now hold across deploys.
- **Coach includes Swish+:** every write to `coach_access` also writes a `coach` row and a `plus` row (source `coach_bundle`) with the same end date. They end together. Admins and hand-set coaches count as having both.
- **Stripe:** `/api/billing/plan` (what you have, with your prices), `/api/billing/plus/checkout`, and the billing portal for Swish+ customers. The webhook handles Swish+ events first, then coach events. The daily cron also re-checks Swish+ renewals that look missed. `scripts/stripe-setup.ts` creates the Swish+ product, the `plus_monthly` / `plus_annual` prices and the `swish_plus_founding_20` coupon. They exist in test mode as of 2026-11-05.
- **Founding price:** `SWISH_PLUS_LAUNCH_AT` (an ISO date) is the cut-off. While it is unset, every account counts as made before launch, so set it on launch day.
- **Ask limits:** free stays at 80 a month (5 an hour, 30 a week), as in the code before Swish+; Swish+ 300 a month (30 an hour), Coach 5,000. Coach also gets the stronger model. `ask_swish_questions` exists since 2026-11-05, so all three windows are counted.
- **Pages:** `/plus` (prices, checkout, status), a "Your plan" line in the account centre, and Coach access listing Swish+ as included.
- **Gates:** `PlusGate` (blurred preview, lock and a Get Swish+ link) and `usePlusAccess()` wrap the new features only. Nothing on the site today is gated. The first version gated profiles, game On/Off, comparison and the landscape, and that was removed on 2026-11-05. The server checks too: Swish+ routes answer 404 before launch (admins excepted), 402 to non-members after, and `Cache-Control: private, no-store`.
- **Every lineup + On/off:** `GET /api/league/:slug/lineups/explore?team_name&size=1|2|3|5&minMinutes` (`server/lineupCombos.ts`, `server/lineupsService.ts`), shown as "Every lineup" under the free panel on the team page's Lineups tab (`LineupExplorer.tsx`). Same trusted games as the free panel (lineup tracking matches the box score). A pair or three is every minute they shared, whoever else was on. On/off: off is the team in the same games while the player sat, shown with 4+ minutes and 12+ possessions off.
- **Clutch:** `GET /api/league/:slug/clutch?team_name` (`server/clutch.ts`, `server/clutchService.ts`), a Clutch tab on both team views (`TeamClutchPanel.tsx`). Clutch = the last 5:00 of the fourth quarter and any overtime with the score within 5 before the play. Only games whose play-by-play adds up to the final score for both teams count, so a player's clutch line always sits inside their team's. On-floor minutes and +/- also need the game's lineups trusted; a player's own points and shooting need every basket credited to the same player as in the box score. Free throws belong to the lineup on the floor at the foul. Overtime is found from the period starts, since some feeds restart overtime at period 1 with no type.
- **Shared names:** two teammates with the same initial and surname (Laditan-Adebiyi sisters at Myerscough, Banjoko and Hawes at CoLA Southwark Pride) are kept apart by full name wherever the feed gives both full names in one stint. Where it gives only "S. Laditan-Adebiyi" they can't be told apart: clutch leaves those team-games out of the lineup or player numbers (31 and 39 of 446 in NBL D1 2025-26), and lineups leave that stint out. In 2025-26 these pairs still show as one player in lineups, as on the free panel before.
- **Checks against live data (read only):** `scripts/check-lineup-combos.ts [slug]`, `scripts/check-clutch.ts [slug]` and `scripts/check-clutch-naive.ts [slug]` (an independent re-count of clutch points; 761 of 762 team-games agree and the one difference is the simple count's). All pass on NBL D1 2026-27, NBL D1 2025-26 and Super League 2025-26.
- **Speed:** a cold clutch request for a full Super League season takes about 4s (reads by game, a few games at a time), then about 0.2s from a 10-minute cache. The explorer takes about 4s cold. The free "Best lineups" panel now reads the same way: about 4s cold for NBL D1 2025-26, down from about 30s on the live site, which was close to the 60s hosting limit. Its numbers match the live site's, apart from the shared-name fix above. Live also shows nothing for teams in past seasons (London Lions in Super League 2025-26), which this branch fixes.
- **Errors:** if the server turns down a Swish+ request (signed out, or no Swish+), the explorer and Clutch tab show the Swish+ lock, not "Couldn't load".
- **Switching on:** Swish+ features stay admin-only until `VITE_SWISH_PLUS_LIVE=true` (the server also reads `SWISH_PLUS_LIVE`). Add `?plus=locked` to any page to see the locked view, `?plus=member` on a dev server for the member layout (the server still checks, so its data needs a member or admin), and `?plus=off` to stop.
- **Tests:** `npx tsx --test scripts/billing.test.ts scripts/plus-billing.test.ts scripts/lineup-combos.test.ts scripts/clutch.test.ts`.

## Open decisions

- [x] The rule: nothing free today gets gated (2026-11-05)
- [x] Which Swish+ feature to build first: lineups, then clutch, then on/off four factors (built 2026-11-05)
- [ ] Free alert level (final scores only?)
- [x] Swish+ price: £4.99 / £39.99, with 20% off for accounts made before launch
- [ ] Whether Coach stays £10 / £75
- [ ] RevenueCat or DIY for Apple
- [ ] League billing: flat per season or per team per season
- [ ] Whether league players get Swish+ during the season
