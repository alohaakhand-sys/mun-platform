# App Admin panel: audit and plan

Web only (the phone app has no App Admin screens beyond the live-session monitor).
Audit date: 2026-10-31. Build one phase at a time; stop for the owner's OK after each.

## What exists today

| Page | What it does |
|---|---|
| Overview `admin/page.tsx` | Counts, revenue, activity feed, queue counts |
| Applications `admin/applications` | Organizer applications; event upgrade requests (plan editor) |
| Users `admin/users` | Search, change role, (retired) person-Pro extension |
| Events `admin/events` | Publish/draft, Plan & limits, test allocation, delete |
| Live sessions `admin/live-sessions` | Running sittings, force-stop, reset, ghost observe |
| Payments `admin/payments` | Gateway mode (Stripe / ZiniPay / dev), payout queue (Mark paid / Reject) |
| Complaints `admin/complaints` | Level-3 complaints: resolve / reject |
| Audit logs `admin/audit-logs` | Last 50, live toggle, action filter, CSV of loaded rows |
| Settings `admin/settings` | General, pricing + plan numbers, maintenance, legal, repair tools |

Already fixed (2026-10-31, `cdabd3f`): web Pro locks (custom colour, >50 sends) follow the event
plan; admin plan edits keep a paid Pro's payment record.

## Gaps found

### Security and broken things
- Audit logs: admins can update/delete them (`firestore.rules` auditLogs `read, write: isAdmin`);
  almost all entries are written by the browser, so they can be skipped or forged.
- Audit-log action filter needs an `auditLogs (action, timestamp desc)` index that doesn't exist.
- Complaints page has no admin guard; Settings and Audit logs use their own guard that misses role `admin`.
- Roles are changed by a browser write to `users/{uid}`: no protection against demoting yourself
  or the last admin; role list lacks `user` (what onboarding writes); `Organizer` vs `organizer`
  compared case-sensitively in the sidebar.
- Payout requests: rules don't bound the amount (rules can't compute a balance); admin sees no
  balance, can't add a note or transaction reference, and the organizer isn't notified.
- Overview revenue includes dev-mode fake payments and leaves out Pro payments; its "Pro
  applications" count reads the retired `proApplications` instead of `upgradeRequests`.
- Whole-collection reads (Spark budget, 50k reads/day): Overview (all users + applications),
  Users (all users + every `private` subcollection), Events (all events, again after each save),
  test allocation (all users), complaints and payouts (no limit).
- Event delete removes only the event doc: applications, members, payments are orphaned.

### Pro and money management
- No list of Pro / custom events, no Pro revenue, no platform-fee totals.
- No refunds (`paymentStatus: "refunded"` is read but never written).
- No AI usage view or per-user AI quota override (`aiUsage` docs are server-only).
- `verifiedOrganizer` and `planOverrides.freeEvents` only settable through the plan editor; no
  per-user view or revoke.
- No history of decided upgrade requests or organizer applications.
- Retired person-level Pro still live: Users-page Pro button, `useProStatus` PRO chip in
  Header/Sidebar, `isProActive`, person-Pro profile badges, `checkProExpiry` function.

### Users and content
- No ban / disable / delete (Firestore + Firebase Auth).
- No blog article or comment moderation (App Admin is redirected away from `/dashboard/articles`).
- No moderation of ratings, recommendations, endorsements.
- Complaints: level 3 only, no all-complaints view, no reassign; auto-escalation never runs.

### Platform
- Maintenance mode is not enforced anywhere.
- Unused settings: `maxEventCapacity`, `supportEmail`, `defaultEventTheme`,
  `allowGuestArticleComments`, legal "last updated" dates.
- No platform-wide notification / broadcast.
- No CSV export of users, payments, payouts.
- No app-release view (release is `android-native/tools/release.mjs`).
- Scheduled jobs that never run (Cloud Functions are off on Spark): scheduled announcements,
  waitlist offer expiry, complaint SLA escalation, assignment deadline check.

## Plan

### Phase A · Security and broken things
1. **Audit logs append-only.** Rules: admins may create and read, never update or delete.
   Server-side `logAuditServer()` (admin SDK) for the critical actions moved to routes below.
2. **One admin guard** (`useAdminGuard`) on Complaints, Settings, Audit logs.
3. **Index** `auditLogs (action asc, timestamp desc)` so the action filter works; filter list gets
   the newer actions (payment mode, payouts, plans, upgrade requests, session reset).
4. **Role changes through a server route** `POST /api/admin/users/role` (requireAdmin): refuses
   demoting yourself and removing the last admin; roles `user`, `Organizer`, `App Admin`; logs
   before → after on the server. Sidebar/guards compare roles case-insensitively.
5. **Payouts:** rules require amount > 0, status pending, own organizerId, only known keys. Admin
   payout queue shows each organizer's balance (same math as the wallet) and flags requests above
   it; Mark paid / Reject take a note and a reference; the organizer gets a notification
   (server route `POST /api/admin/payouts/decide`).
6. **Overview fixes:** revenue = real paid applications (no `devPaid`) + paid Pro events, minus
   nothing; counts via Firestore `count()` aggregations instead of reading whole collections;
   queue shows pending `upgradeRequests`.
7. **Read budget:** Users and Events pages page 50 at a time (load more) with search by exact
   email / title prefix; no `collectionGroup("private")` sweep (contact loaded per user on demand).

New rules: auditLogs (create-only), payoutRequests create shape. New routes:
`/api/admin/users/role`, `/api/admin/payouts/decide`. New index: auditLogs (action, timestamp).

### Phase B · Pro and money management
1. **Plans page** `admin/plans`: Pro / custom / Free events (filter), how each became Pro
   (paid / request / admin / legacy), Pro revenue, platform-fee totals per event and overall.
2. **User detail** `admin/users/[uid]`: role, verified badge (grant / revoke), Free-events cap,
   AI uses today + per-user AI quota override (`users.planOverrides.aiDailyQuota`, read by
   `aiQuota.ts`), their events and plans, payouts.
3. **Request history:** decided upgrade requests and organizer applications, with who decided.
4. **Retire person-level Pro:** remove the Users-page Pro button, PRO chips, `isProActive`,
   person-Pro badges (badge = `verifiedOrganizer`).
5. **Refunds:** admin marks a payment refunded (server route; the gateway refund itself is done in
   Stripe / ZiniPay), the seat stays or is freed by the organizer, the wallet stops counting it.

New routes: `/api/admin/users/[uid]` (read + overrides), `/api/admin/refund`. Rules: none beyond
admin (admin SDK).

### Phase C · Users and content moderation
1. **Ban / disable** a user (Firebase Auth disable + `users.disabled`), with unban; delete account
   (Auth + profile, keeps their applications anonymised). Server routes.
2. **Blogs:** admin list of articles and comments, hide / delete.
3. **Reputation:** list and remove ratings, recommendations, endorsements (counters fixed on the
   user doc, as `/api/reputation` does).
4. **Complaints:** all complaints (any level) with filters, reassign, and the level-3 queue.

### Phase D · Platform
1. **Maintenance mode** enforced (banner + read-only for non-admins on web; the app shows it).
2. **Settings clean-up:** use `supportEmail` (contact links), drop or wire the rest.
3. **Broadcast:** notification to everyone / organizers / one event (server route, batched).
4. **CSV export:** users, payments, payouts, plans.
5. **Scheduled jobs on Coolify** (like `close-stale-sittings`): scheduled announcements, waitlist
   offer expiry, complaint escalation, as `/api/cron/*` routes with a shared secret.
6. **Event delete** through a server route that removes or archives applications, members,
   sessions, so wallets and counts stay right.
7. **App release view:** current published version and its notes (from the R2 manifest).

## Status (2026-10-31)

All four phases are built: A `ff91c4c`, B `03c788b`, C `6457d0f`, D (this commit's parent chain).
Rules and indexes are live on mun-platform-saas. munpilot.com needs a Coolify redeploy to serve
the new pages and routes.

Still to do by hand: add these Coolify scheduled tasks to the `munpilot` application (same shape
as the existing `close-stale-sittings` task):

| Name | Frequency (UTC) | Route |
|---|---|---|
| scheduled-announcements | `*/15 * * * *` | `/api/cron/scheduled-announcements` |
| waitlist-offers | `7 * * * *` | `/api/cron/waitlist-offers` |
| complaint-sla | `13 */6 * * *` | `/api/cron/complaint-sla` |

Command (replace ROUTE):
`node -e "fetch('http://127.0.0.1:3000/api/cron/ROUTE',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>console.log(r.status,(await r.text()).slice(0,500)))"`
