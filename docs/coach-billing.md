# Coach billing (Stripe)

Coaches pay for their team's Coaches Hub and AI scouting reports at `/coach-access`:
**£10 a month**, or a **£75 season pass** (runs to 31 May; bought with under 8 weeks left it covers the
next season too). Payment turns on the existing coach role (auth `app_metadata.role = "coach"` + `team_id`).

## How it works

1. Coach opens `/coach-access`, picks a plan and their team, signs in (or makes a free account) and is sent to Stripe Checkout.
2. Stripe tells the site (webhook `POST /api/stripe/webhook`, signature checked). **Only the webhook switches access on**, never the browser coming back.
3. The webhook records the plan in `coach_access`, sets the coach role, and emails the admin (`ADMIN_NOTIFY_EMAIL`).
4. `/coach-access/success` waits for that, refreshes the sign-in and opens the Coaches Hub.
5. Renewals, failed cards, cancellations and refunds arrive as webhook events and keep access in step. A daily cron (`/api/cron/coach-access`) ends expired season passes and re-checks any missed monthly renewal.
6. Coaches change their card, see invoices or cancel from **Billing** in the Coaches Hub (Stripe's customer portal).
7. Admins see everyone at `/admin/coach-access`: mark a coach **verified**, or **revoke** them (cancels a monthly subscription and removes the role; refund in the Stripe dashboard).

Pay-first policy: access starts at once. Anything private to a team later should require `coach_access.verified = true`.

## Environment variables

| Variable | What |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` while testing, `sk_live_...` when live |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` for the webhook endpoint (or the one `stripe listen` prints) |
| `ADMIN_NOTIFY_EMAIL` | where "new coach / payment failed" emails go (needs `RESEND_API_KEY`) |
| `SITE_URL` | `https://swishassistant.com` (used for Stripe's return links when not on localhost) |
| `CRON_SECRET` | already used by the other cron jobs |

## Set up (test mode first)

1. Put your **test** secret key in `.env` as `STRIPE_SECRET_KEY`.
2. `npx tsx scripts/stripe-setup.ts` creates the product, the two prices (found by lookup key, so you can change prices later in Stripe), and the customer portal. Run it again any time; it only creates what is missing.
3. Apply `supabase/migrations/20261017_coach_billing.sql`.
4. Local webhooks, without installing anything: put any `STRIPE_WEBHOOK_SECRET=whsec_...` value in `.env`, pay on Stripe's test checkout, then run `npx tsx scripts/stripe-replay.ts`. It takes your real test events from Stripe and delivers them to the local site, signed with that secret (test keys only). Or, with the Stripe CLI: install the Stripe CLI, `stripe login`, then `stripe listen --forward-to localhost:<port>/api/stripe/webhook` and put the `whsec_...` it prints in `.env` as `STRIPE_WEBHOOK_SECRET`.
5. Restart the dev server.

## Test the whole thing (about 5 minutes)

Use a normal member account (not an admin: paying never changes an admin's role).

1. `/coach-access` shows the **Test mode** banner. Choose the season pass, search and pick a team, **Continue to payment**.
2. On Stripe, pay with `4242 4242 4242 4242`, any future date, any CVC, any email/name.
3. You land on `/coach-access/success`: "Setting up your team", then **You're in**. **Open your Coaches Hub** opens that team's hub with the scout report.
4. `/admin/coach-access` (as admin) lists the coach as `active`, `test`. Try **Mark verified** and **Revoke**.
5. Monthly: repeat with the monthly plan. In the hub choose **Billing**, cancel in Stripe's portal; the row shows "cancelling" and access continues to the end of the period.
6. Failure cards: `4000 0000 0000 0341` (attaches, then fails to charge) and `4000 0000 0000 0002` (declined at checkout) behave as expected.
7. Stripe dashboard (test mode) > Developers > Webhooks / Events shows each event delivered with a 200.
8. Refund the season payment in the Stripe dashboard: access ends.

## Going live

1. Run `npx tsx scripts/stripe-setup.ts` with the **live** key (creates live prices and portal), and `--webhook-url https://swishassistant.com/api/stripe/webhook` to create the live webhook. It prints the `whsec_` once.
2. Set the four variables above in Vercel for Production, redeploy.
3. In the Stripe dashboard turn on customer emails for successful payments (Settings > Emails) and your business details/VAT.
4. Do one real £10 payment yourself, then refund it.
