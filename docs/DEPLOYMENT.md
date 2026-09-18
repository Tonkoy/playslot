# Deploying PlaySlot

Web on **Vercel**, API + Postgres + Redis on **Railway**. This document is the
staging runbook; the production differences are listed at the end.

| Piece | Host | Staging URL |
| --- | --- | --- |
| Next.js web | Vercel | `https://staging.playslot.bg` |
| NestJS API | Railway | `https://api-staging.playslot.bg` |
| Postgres 16 | Railway | internal |
| Redis | Railway | internal |

---

## The one rule that will bite you

**The API must live on a subdomain of the same domain as the web app.**

The session cookie is set `SameSite=Lax`. Browsers decide "same site" by the
registrable domain, so `staging.playslot.bg` → `api-staging.playslot.bg` counts as
same-site and the cookie is sent. If the API stays on its generated
`*.up.railway.app` hostname, every request is cross-site, the cookie is silently
dropped, and **login appears to succeed but every authenticated request 401s**.

The same applies to Vercel preview deployments (`*.vercel.app`): auth will not
work there. Test auth on the real staging subdomain.

---

## 1. Railway — data + API

1. **New project → Deploy from GitHub repo** → `Tonkoy/playslot`.
2. **Add Postgres** and **Add Redis** from the project's "New" menu. Both expose
   connection strings as Railway variables; you'll reference them below.
   The `btree_gist` extension the no-double-booking constraint needs is created
   by the migrations themselves — nothing to do by hand.
3. On the **API service → Settings**:
   - *Root Directory*: `/` (the repo root — the API imports `packages/*`)
   - *Builder*: Dockerfile, path `apps/api/Dockerfile`
   - *Custom Domain*: `api-staging.playslot.bg`
   - *Health Check Path*: `/api/health`
   - *Pre-Deploy / Release Command*:
     `pnpm --filter @playslot/db migrate:deploy`
     This applies pending migrations before the new version takes traffic.
     There are currently **two unapplied migrations** (`club_featured_flag`,
     `club_booking_durations`) — the first deploy will run them.
4. **Variables** on the API service:

   ```
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   AUTH_SECRET=<32+ random chars — generate, never reuse the dev one>
   APP_BASE_URL=https://staging.playslot.bg
   API_BASE_URL=https://api-staging.playslot.bg
   MAIL_PROVIDER=resend
   RESEND_API_KEY=<your key>
   MAIL_FROM=PlaySlot <no-reply@playslot.bg>
   ```

   `${{Postgres.DATABASE_URL}}` is Railway's reference syntax — it wires the
   services together without pasting credentials.

   Generate the secret with: `openssl rand -base64 32`

   `APP_BASE_URL` is also the CORS allowlist in production (`main.ts` restricts
   to exactly this origin), so a typo here blocks the whole frontend.

---

## 2. Vercel — web

1. **Add New → Project** → import the same repo.
2. Settings:
   - *Root Directory*: `apps/web`
   - Enable **"Include source files outside of the Root Directory"** — the build
     needs `packages/*`. Without this the build fails on unresolved
     `@playslot/contracts`.
   - Framework/build/install come from `apps/web/vercel.json`; leave the UI
     fields on their defaults so that file wins.
3. **Environment Variables**:

   ```
   APP_BASE_URL=https://staging.playslot.bg
   API_BASE_URL=https://api-staging.playslot.bg
   NEXT_PUBLIC_API_BASE_URL=https://api-staging.playslot.bg
   NEXT_PUBLIC_SITE_URL=https://staging.playslot.bg
   ```

   **Do not set `NEXT_PUBLIC_ALLOW_INDEXING` on staging.** Left unset, the whole
   staging site serves `Disallow: /` plus `noindex` on every page. That is
   deliberate: a second indexed copy of the Bulgarian copy competes with
   production for „резервирай корт онлайн" and can outrank it.

4. **Domains**: add `staging.playslot.bg`.

---

## 3. DNS

At the domain's registrar:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `staging` | `cname.vercel-dns.com` |
| CNAME | `api-staging` | *(the target Railway shows when you add the custom domain)* |

Both platforms issue Let's Encrypt certificates automatically once the records
resolve — usually minutes, occasionally up to an hour.

---

## 4. Smoke test

In order, because each depends on the last:

1. `curl https://api-staging.playslot.bg/api/health` → `{"status":"ok",...}`
2. `curl -I https://staging.playslot.bg/bg` → `200`, and
   `curl https://staging.playslot.bg/robots.txt` → `Disallow: /`
3. Open `/bg/clubs` — if clubs render, web→API server-side calls work.
4. **Register a real account and log in.** This is the step that catches the
   cookie/CORS problem; nothing before it exercises credentialed requests.
5. Open a club's schedule and book a slot. Watch the API logs for the SSE
   stream (`/api/availability/stream`) staying connected.
6. Open the same club in a second browser and confirm the booked slot
   disappears live — that proves Redis and SSE both work.

---

## 5. Seeding staging

The database starts empty. To get the demo clubs and coaches in:

```bash
DATABASE_URL="<Railway Postgres public URL>" pnpm --filter @playslot/db seed
```

Run this from your machine against the public connection string Railway exposes
under the Postgres service's *Connect* tab.

---

## Promoting to production

Everything above, with these changes:

- Domains: `playslot.bg` and `api.playslot.bg`.
- On Vercel set **`NEXT_PUBLIC_ALLOW_INDEXING=true`** — without it production
  stays invisible to Google, which would quietly undo the entire SEO setup.
- Verify the domain in **Google Search Console** and submit
  `https://playslot.bg/sitemap.xml`.
- A fresh `AUTH_SECRET` (never the staging one — sharing it means a staging
  token authenticates against production).
- Stripe **live** keys, and point the Stripe webhook at
  `https://api.playslot.bg/api/payments/webhook`.
- Google OAuth: add `https://api.playslot.bg/api/auth/google/callback` as an
  authorized redirect URI. Currently unset, so the Google button won't work
  until this is done.
- Enable Railway's Postgres **backups**, and confirm a restore actually works
  before you have real bookings to lose.
- Set `SENTRY_DSN` so errors surface somewhere you'll see them.

### Still missing for real users

- **Email delivery** — no provider key is configured, so verification emails
  only print to the server log. Users cannot verify their accounts until a
  Resend or SendGrid key is set.
- **Turnstile** (`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`) is unset, so
  registration has no bot protection.
- **`og-default.png`** doesn't exist in `apps/web/public/` — social shares will
  have no preview image.
