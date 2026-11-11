<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying (read before touching env vars or Firestore rules)

Live MUN features fail **silently** — errors show only in the browser console (browser ↔ Firebase/Agora is direct, never hits Vercel's server logs). Two invisible traps:

1. **`NEXT_PUBLIC_*` are inlined at BUILD time.** Changing one on Vercel requires a **redeploy** or the old value stays baked in. Full key list: `.env.example`.
2. **Firestore rules/indexes deploy separately from Vercel.** After editing `firestore.rules`, run `npm run deploy:rules` (project `mun-platform-saas`). A "Missing or insufficient permissions" error in the console = stale rules on the live project.

3. **Two Firebase projects, two Google accounts.** `mun-platform-saas` (account `akhandfoundationseo@gmail.com`) is current; `mun-saas` (`akhanddigitaldhaka@gmail.com`) is the old one, config parked in `.env.local.stop`. `.firebaserc` aliases them as `new`/`old`. The CLI account is bound per-directory via `firebase login:use` — deploying to the old project needs BOTH `--project old --account akhanddigitaldhaka@gmail.com`, since aliases carry no auth.

4. **`firestore.indexes.json` has drifted before.** Indexes created by clicking a console error link are NOT written back to the repo (it once declared 9 while the project had 23). There are also TWO categories on separate console tabs: composite `indexes` AND single-field `fieldOverrides` (needed for every `collectionGroup(X).where(field,…)` query). Diff live vs repo before assuming the file is complete.

**Setting up a new Firebase project, or swapping projects/accounts: read `setup/firebase-project-setup.md` FIRST.** Full step-by-step, the observed traps, and copy-paste verification scripts.

See the "Deploying" section of `README.md` for details.
