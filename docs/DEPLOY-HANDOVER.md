# Deploy handover — PlaySlot staging

Written 18 Sep 2026, at the point where the API's first Railway deploy was still
failing its healthcheck. Read `docs/DEPLOYMENT.md` alongside this — that is the
runbook; this is the current state and the traps already paid for.

**Goal:** PlaySlot staging live on `staging.playslot.bg` (web, Vercel) and
`api-staging.playslot.bg` (API, Railway), with Postgres and Redis on Railway.
Production (`playslot.bg` / `api.playslot.bg`) comes after staging is proven.

---

## State right now

| Piece | Where | Status |
| --- | --- | --- |
| Repo | `Tonkoy/playslot`, branch `main` | **1 commit unpushed** (`e96679b`) |
| Railway project | Postgres + Redis + API service | API healthcheck failing until `e96679b` ships |
| Vercel | — | **not started** |
| DNS | Register.bg + cPanel zone | **`playslot.bg` has no delegation** |

### The actual blocker: DNS

`playslot.bg` returns **NXDOMAIN** from the `.bg` registry — `a.nic.bg` has no
nameserver delegation for it. The cPanel zone the owner was editing shows
*"ДНС сървърите на домейна не съвпадат с НС записите в тази зона"*, which says
the same thing: that zone is not authoritative for anything.

Until nameservers are set at Register.bg and the registry publishes them, **no
DNS record anywhere will resolve**, and neither Railway nor Vercel can verify a
custom domain. Verify with `dig playslot.bg NS` before touching either platform.

### The API service

Built and deployed; the container was exiting instantly with MODULE_NOT_FOUND,
so Railway's healthcheck retried for five minutes against a dead process with no
application output to explain it. Cause: `nest build` emits **`dist/src/main.js`**,
not `dist/main.js`, because `apps/api/tsconfig.json` includes `test/**` and
`vitest.config.ts` alongside `src/**`, so TypeScript takes the package root as
`rootDir`. Fixed in `e96679b` (Dockerfile `CMD` plus the `start` / `start:prod`
scripts, which had the same wrong path and had never worked outside dev).

**Next action: push `e96679b`, redeploy, expect the healthcheck to go green.**

Railway settings, for reference:

```
Root Directory      /                 (repo root — the API imports packages/*)
Builder             Dockerfile
Dockerfile Path     apps/api/Dockerfile
Health Check Path   /api/health/ready (runs SELECT 1; /api/health does no I/O)
Pre-Deploy          pnpm --filter @playslot/db migrate:deploy
Custom Domain       api-staging.playslot.bg
```

Variables set: `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`,
`APP_BASE_URL=https://staging.playslot.bg`,
`API_BASE_URL=https://api-staging.playslot.bg`, plus `HOLD_TTL_MIN=10` and
`MAX_ADVANCE_DAYS=14`.

Two migrations are pending against the Railway database:
`20260914130000_club_featured_flag` and `20260915090000_club_booking_durations`.
The pre-deploy command applies them.

---

## Traps already paid for — don't re-learn these

**The API must stay on a subdomain of playslot.bg.** The session cookie is
`SameSite=Lax`. On a `*.up.railway.app` hostname the browser treats every call
from the web app as cross-site and silently drops the cookie: login appears to
succeed and every authenticated request then 401s. Same reason auth will not work
on Vercel preview deployments — test auth only on the real staging subdomain.

**The apex cannot take a CNAME.** `playslot.bg` already has SOA and NS records,
and RFC 1034 forbids a CNAME beside them; cPanel rejects it outright. If Railway
or Vercel asks for `CNAME @`, the wrong hostname was entered. For the apex on
Vercel use the **A record `76.76.21.21`**, with CNAME only for `www`.

**`APP_BASE_URL` is also the production CORS allowlist** (`apps/api/src/main.ts`
restricts to exactly that origin). A typo there blocks the whole frontend with an
error that points nowhere near the cause.

**`NEXT_PUBLIC_*` variables belong on Vercel, not Railway.** The NestJS API never
reads them. `NEXT_PUBLIC_ALLOW_INDEXING` must stay **unset on staging** — the
default is "no", so `robots.ts` serves `Disallow: /` and every page emits
`noindex`. Set it to `true` only in production, or the SEO work is invisible. A
second indexed copy of the Bulgarian copy would compete with production for
„резервирай корт онлайн".

**Stripe is intentionally unset.** `PaymentsModule` falls back to
`MockPaymentProvider` when `STRIPE_SECRET_KEY` is absent — that is the wanted
"payments later" behaviour, no code change needed. Its checkout URL
(`https://mock-checkout.playslot.local/...`) does not resolve, so a booking that
picks online payment dead-ends. Use a pay-at-venue method when smoke-testing.

**Email is not configured.** No provider key, so verification links only print to
the API's stdout. Registration cannot be completed by a normal user; verify test
accounts by hand in the database, or set `RESEND_API_KEY` + `MAIL_PROVIDER=resend`.

---

## Known risks, not yet hit

**The pre-deploy command may fail on permissions.** `apps/api/Dockerfile` ends
with `USER node`, while `/pnpm` (corepack's shim directory) is owned by root. If
`pnpm --filter @playslot/db migrate:deploy` fails with EACCES, call the Prisma
binary directly instead of going through pnpm, or drop the `USER node` line.

**The Dockerfile is young.** It was written without a Docker daemon available to
test against and has only just had its first real build. Treat build failures as
likely-mine rather than likely-environment.

**Secrets were pasted into a chat and screenshotted:** the staging `AUTH_SECRET`,
and the Postgres and Redis passwords. Low risk today (no users, domain doesn't
resolve) but they must be rotated before production, and **never reused there** —
a shared `AUTH_SECRET` means a staging token authenticates against production.

---

## Order of work

1. Set nameservers at Register.bg; wait for `dig playslot.bg NS` to answer.
2. Push `e96679b`; redeploy the Railway API; `curl https://api-staging.playslot.bg/api/health/ready`
   → `{"status":"ready","db":"up"}`.
3. Add the `api-staging` CNAME (target from Railway's custom-domain dialog).
4. Vercel project: Root Directory `apps/web`, enable **"Include source files
   outside of the Root Directory"**, env `APP_BASE_URL`, `API_BASE_URL`,
   `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`; `staging` CNAME →
   `cname.vercel-dns.com`. Build config comes from `apps/web/vercel.json`.
5. Seed: `DATABASE_URL="<Railway public URL>" pnpm --filter @playslot/db seed`.
6. Smoke test in order — health, `/bg/clubs` renders, **register + log in**
   (this is the step that catches the cookie problem), book a slot, confirm it
   disappears live in a second browser (proves Redis + SSE).

## Files that matter

`apps/api/Dockerfile` · `.dockerignore` · `apps/web/vercel.json` ·
`docs/DEPLOYMENT.md` (full runbook) · `apps/web/src/lib/seo.ts` (the
`ALLOW_INDEXING` switch) · `packages/config/src/env.ts` (env schema — the API
fails fast at boot on anything invalid).
