# Swish plans: what comes in each

Fills in section 2 of `swish-pricing-spec.md` (the pricing and entitlements spec) for the site and the iOS app as they stand on 2026-11-05. **Proposal.** Nothing is gated.

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
| **Only on Swish+ (to build)** | | | | | |
| Lineups for every team: season five-man units, two-man pairs, minutes, net rating | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Clutch and competitive minutes (garbage time out, close-game splits) | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Deeper metrics: on-court four factors, opponent shooting with a player on, shot profile against league average | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Alerts on followed players and teams: tip-off, live big lines, close finishes, milestones | Final scores | ✅ | ✅ | Final scores | `plus` |
| Ask Swish | 20 a month | 300 a month | 5,000 a month | 20 a month | `plus` / `coach` |
| **Coaching (web only)** | | | | | |
| Coaches Hub, advanced insights (own team, last 3/5 games), scouting, reports, playbook | ❌ | ❌ | ✅ | ❌ | `coach` |
| **League (web only, organiser pays)** | | | | | |
| League hosted on Swish, uploads, scorer's table, live publishing, invite codes | — | — | — | ✅ by role | league paid |

Coach includes Swish+ automatically (`plus` row with `source = 'coach_bundle'`). Admins get everything, as today.

### What the Swish+ features build on

- **Lineups:** `lineup_stints` already holds 54,000 stints from 1,142 games in 23 competitions, with points, possessions and full box numbers for both sides. Today the site shows them only one game at a time (game On/Off) and to coaches for their own team (Advanced Insights). Season lineups for any team are new.
- **Clutch:** `lineup_stints_context_v1` already flags garbage time, competitive stints and the score margin at each stint's start.
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

- **Database:** migration `20261106_swish_plus_entitlements.sql`, which adds `user_entitlements`, a read-your-own-rows policy and `has_entitlement()`. It also widens the Ask question log to free / plus / pro. **Not applied yet**, and neither is `20261030_ask_swish_usage.sql`. Until they are, everything runs, but no one can hold Swish+ and Ask enforces only its hourly limit.
- **Coach includes Swish+:** every write to `coach_access` also writes a `coach` row and a `plus` row (source `coach_bundle`) with the same end date. They end together. Admins and hand-set coaches count as having both.
- **Stripe:** `/api/billing/plan` (what you have, with your prices), `/api/billing/plus/checkout`, and the billing portal for Swish+ customers. The webhook handles Swish+ events first, then coach events. The daily cron also re-checks Swish+ renewals that look missed. `scripts/stripe-setup.ts` creates the Swish+ product, the `plus_monthly` / `plus_annual` prices and the `swish_plus_founding_20` coupon. They exist in test mode as of 2026-11-05.
- **Founding price:** `SWISH_PLUS_LAUNCH_AT` (an ISO date) is the cut-off. While it is unset, every account counts as made before launch, so set it on launch day.
- **Ask limits:** free 20 a month (5 an hour), Swish+ 300 a month (30 an hour), Coach 5,000. Coach also gets the stronger model.
- **Pages:** `/plus` (prices, checkout, status), a "Your plan" line in the account centre, and Coach access listing Swish+ as included.
- **Gates:** `PlusGate` (blurred preview, lock and a Get Swish+ link) and `usePlusAccess()` are ready for the new features. Nothing on the site today is gated. The first version gated profiles, game On/Off, comparison and the landscape, and that was removed on 2026-11-05.
- **Switching on:** gates stay off until `VITE_SWISH_PLUS_LIVE=true`. Add `?plus=locked` to any page to see the locked view, and `?plus=off` to stop.
- **Tests:** `npx tsx --test scripts/billing.test.ts scripts/plus-billing.test.ts`.

## Open decisions

- [x] The rule: nothing free today gets gated (2026-11-05)
- [ ] Which Swish+ feature to build first
- [ ] Free alert level (final scores only?)
- [x] Swish+ price: £4.99 / £39.99, with 20% off for accounts made before launch
- [ ] Whether Coach stays £10 / £75
- [ ] RevenueCat or DIY for Apple
- [ ] League billing: flat per season or per team per season
- [ ] Whether league players get Swish+ during the season
