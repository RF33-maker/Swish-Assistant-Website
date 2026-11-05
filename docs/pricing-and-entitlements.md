# Swish plans: what comes in each

Fills in section 2 of `swish-pricing-spec.md` (the pricing and entitlements spec) for the site and the iOS app as they stand on 2026-11-05. **Proposal.** Nothing is gated yet.

## The rule behind the split

Everything that is public today stays free. That covers scores, box scores, play-by-play, game flow, shot charts, standings, leaders and the current season on a profile. It is what search engines index and what fans share, and game data must never sit behind a login.

Swish+ is **depth and tools**: history, advanced numbers, comparisons, more Ask. Free users can see that the depth exists through a short preview or a locked row, never a blank page.

## Feature split

| Feature | Free | Swish+ | Coach | League member | Key |
|---|---|---|---|---|---|
| **Games and leagues** | | | | | |
| Live scores, schedules, results, standings, brackets | ✅ | ✅ | ✅ | ✅ | — |
| Box scores, play-by-play, game flow, game shot chart | ✅ | ✅ | ✅ | ✅ | — |
| Game page points breakdown (paint, 2nd chance, bench…) | ✅ | ✅ | ✅ | ✅ | — |
| Game page On/Off tab (per-game on/off, stint ratings) | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| League leaders, team pages, team stats, league compare | ✅ | ✅ | ✅ | ✅ | — |
| News articles | ✅ | ✅ | ✅ | ✅ | — |
| **Player profiles** | | | | | |
| Current season averages, shooting splits, game log, accolades | ✅ | ✅ | ✅ | ✅ | — |
| Past seasons and career totals | Last season only | ✅ all | ✅ | ❌ | `plus` |
| Advanced splits (ORTG/DRTG, usage, AST%, REB%…) | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| On/Off impact panel | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| Season shot chart and shot zones (rim, paint, mid, three) | ❌ preview | ✅ | ✅ | ❌ | `plus` |
| League rankings and percentiles | ❌ | ✅ | ✅ | ❌ | `plus` |
| Player comparison and player landscape | ❌ | ✅ | ✅ | ❌ | `plus` |
| **App and account** | | | | | |
| Follow teams and players, For You home, Feed tab | ✅ account | ✅ | ✅ | ✅ | — |
| Shareable cards, save to Photos | ✅ account | ✅ | ✅ | ✅ | — |
| Ask Swish | 20 a month | 300 a month | Coach limits (5,000 a month) | Free limits | `plus` / `coach` |
| Live game alerts (push), once push ships | Final scores | Live: tip-off, close games, big lines | ✅ | Final scores | `plus` |
| **Coaching (web only)** | | | | | |
| Coaches Hub, team dashboard, advanced insights | ❌ | ❌ | ✅ | ❌ | `coach` |
| Scouting reports (AI scout), coach notes, PDF export | ❌ | ❌ | ✅ | ❌ | `coach` |
| Post-game and weekly reports, share links | ❌ | ❌ | ✅ | ❌ | `coach` |
| Playbook (draw, share with staff) | ❌ | ❌ | ✅ | ❌ | `coach` |
| **League (web only, organiser pays)** | | | | | |
| League hosted on Swish: pages, branding, team logos | — | — | — | Organiser | league paid |
| Upload box scores and PDFs, manage teams | — | — | — | Organiser / team manager | league role |
| Scorer's table, live publishing to the site | — | — | — | Scorer | league role |
| Join a league with an invite code (in the app, no prices) | — | — | — | ✅ | league role |

Coach includes Swish+ automatically (`plus` row with `source = 'coach_bundle'`). Admins get everything, as today.

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
- **Gates:** profile rank badges; Splits tab (advanced splits, on/off, season shot chart); career table (seasons before last, career totals, Advanced view); game-log ON/OFF/SWING columns; game On/Off tab; league player comparison; player landscape.
- **Switching on:** gates stay off until `VITE_SWISH_PLUS_LIVE=true`. Add `?plus=locked` to any page to see the locked view, and `?plus=off` to stop.
- **Tests:** `npx tsx --test scripts/billing.test.ts scripts/plus-billing.test.ts`.

## Open decisions

- [ ] This split
- [x] Swish+ price: £4.99 / £39.99, with 20% off for accounts made before launch
- [ ] Whether Coach stays £10 / £75
- [ ] RevenueCat or DIY for Apple
- [ ] League billing: flat per season or per team per season
- [ ] Whether league players get Swish+ during the season
