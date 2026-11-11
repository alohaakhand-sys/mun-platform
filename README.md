This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploying

The app deploys to **Vercel** (Production branch: `main`). Firebase project: `mun-platform-saas`
(Google account `akhandfoundationseo@gmail.com`). The previous project `mun-saas` lives on a
different account — its env config is parked in `.env.local.stop`, and `.firebaserc` aliases the
two as `new` / `old`. Aliases carry **no** auth, so reaching the old project needs both flags:
`firebase deploy --only firestore:rules --project old --account akhanddigitaldhaka@gmail.com`.

Two things break Live MUN features **silently** if you forget them — the errors appear
only in the **browser console** (browser ↔ Firebase/Agora is direct and never hits
Vercel's server logs), so Vercel logs will look "normal" even when a feature is dead.

### 1. Env vars are inlined at BUILD time

Every `NEXT_PUBLIC_*` var is baked into the client bundle when `next build` runs.
If you add or change one in Vercel → Settings → Environment Variables, you **must
redeploy** (Deployments → ⋯ → Redeploy) — an existing build keeps the old value.
See [.env.example](.env.example) for the full list of required keys.

### 2. Firestore rules & indexes deploy separately from Vercel

Vercel deploys never touch `firestore.rules` or `firestore.indexes.json`. After
editing them, deploy to Firebase yourself:

```bash
npm run deploy:rules      # firestore.rules
npm run deploy:indexes    # firestore.indexes.json
npm run deploy:firebase   # both
```

If a Live MUN action (raise hand, cast vote, submit a doc) fails with
"Missing or insufficient permissions" in the console, the rules are almost certainly
out of date on the live project — run `npm run deploy:rules`.

### 3. The Firestore read budget (Spark plan)

The project runs on the **Spark free plan, permanently**. The caps that actually bind:

| Limit | Spark |
| --- | --- |
| Firestore document reads | **50,000 / day** (resets midnight US/Pacific) |
| Firestore writes | 20,000 / day |
| Realtime Database concurrent connections | **100** |

Blowing the read cap takes the **whole app** down, not just the feature that caused it: every
read project-wide starts failing with gRPC `code: 8 RESOURCE_EXHAUSTED: Quota exceeded` until
the daily reset. It has happened once already — an admin page polling a `collectionGroup` scan
every 10s.

Rules of thumb when adding a feature:

- **Never put Firestore in a `setInterval`.** UI clocks tick locally against a synced deadline
  (`CountdownTimer.tsx`) — no reads. Keep it that way.
- **Never run an unfiltered `collectionGroup(...).get()`.** It costs one read per document ever
  created and grows forever. Bound it, or keep a small registry collection written on state
  transitions instead — see `liveSessions` (`registerLiveSession` in `sessionService.ts`), which
  is why the admin monitor costs ~2 reads per *running* session rather than one per session in
  history.
- **Listeners fan out.** Each write to the session doc bills one read to every connected client.
  A 40-delegate committee costs roughly 40 reads per chair action.
- If you must poll: ≥60s, gated on `document.visibilityState === "visible"`, and **stop on
  error** rather than retrying into a wall.

## Payments — which gateway is live

Registration fees can run through **Stripe** (cards, USD), **ZiniPay** (bKash / Nagad, BDT) or
**Developer mode** (no money — marks registrations paid instantly, for testing).

The choice is made by the App Admin in **Dashboard → Admin → Payments** and stored in Firestore
at `systemSettings/global.paymentMode`. **Credentials are never stored in Firestore** — they stay
in server env vars (`STRIPE_SECRET_KEY`, `ZINIPAY_API_KEY`, …), so switching modes only changes
*which* configured gateway is used. Selecting a gateway whose key is missing is harmless: the
server falls back to a configured one and the admin panel says so. A mode change is picked up
within ~60s (the config is cached to protect the read budget).

Both gateways funnel into `src/lib/payments/` — `pricing.ts` decides the amount from the event
doc (never the client), `settle.ts` is the only writer of `paymentStatus: "paid"`.

- **Stripe** is confirmed by its signed webhook (`/api/stripe/webhook`).
- **ZiniPay** has *no* signed webhook — its callback body is just `{ invoice_id, status }`. So
  `/api/zinipay/webhook` and the browser's return trip (`/api/payments/verify`) both re-ask
  ZiniPay's verify endpoint, and only a `COMPLETED` invoice that matches the id stored on the
  application settles it. Two gotchas: ZiniPay rejects a `redirect_url` whose domain doesn't
  match the brand's registered website (so `NEXT_PUBLIC_APP_URL` must be the deployed origin),
  and sandbox keys are prefixed `sandbox_`. Point the merchant webhook at
  `<origin>/api/zinipay/webhook`.
- **Developer mode** additionally requires `ALLOW_DEV_PAYMENTS=true` and is ignored on live
  Stripe keys. The older per-event toggle (organizer → Financials) still works alongside it.
