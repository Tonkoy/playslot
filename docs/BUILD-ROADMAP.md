# PlaySlot — Build Roadmap & Command Runbook

> **Companion to `AGENTS-build-brief-FULL.md`.** That file is the *what/why* (spec, data model, rules). **This file is the *how*** — the exact commands and the ordered, checkable roadmap the AI follows to build it.
> **How to use with the AI:** put both files in `/docs`. Tell the AI: *"Execute the BUILD ROADMAP starting at the next unchecked step. Run one PHASE, run its Gate, report, then stop for my review."* The AI works one phase at a time, never the whole app at once.
> **Convention:** `◻︎` = not started · `⏳` = in progress · `✅` = passed its Gate. Every phase ends with a **Gate** — a command (or test) that must pass before the next phase begins.

---

## 0. Ground rules for the AI (read every session)
- Work **one phase at a time**. Never scaffold ahead. After a phase, run its **Gate**, report results, stop for review.
- **Booking correctness > features.** Do not build any booking UI until Phase 5's concurrency Gate is green.
- Before writing code in a phase: restate the goal, list files you'll add/change, list the migration/API changes, then implement.
- After a phase, always report: *what changed · migrations · API changes · tests run + results · security/concurrency notes · known limits · next step.*
- Never weaken a test or a type to make a Gate pass. If a Gate can't pass, stop and explain why.
- All prices/availability/permissions/state revalidated server-side. Business rules come from spec §12.

---

## 1. Prerequisites (run once)

```bash
# Node 20 LTS + pnpm + Docker must be present
node -v          # expect v20.x
corepack enable && corepack prepare pnpm@latest --activate
pnpm -v
docker -v && docker compose version
```

Accounts/keys — collect early where noted:
- **By P1:** Resend (verification + reset emails), Google/Apple OAuth, Cloudflare Turnstile.
- **By P7:** Stripe (test keys + webhook secret).
- **By P8/staging:** Google Maps, Sentry, PostHog, managed Postgres (Neon/Supabase).

---

## 2. The roadmap at a glance

| Phase | Goal | Gate (must pass) |
|---|---|---|
| **P0** ◻︎ | Monorepo + tooling + Docker + CI | `pnpm build && pnpm test` green; app boots in bg + en; usable at 360px |
| **P1** ◻︎ | DB schema, auth (**+ email verify + password reset**), club/court CRUD, tenant isolation | migration applies; verify/reset + tenant-isolation tests pass |
| **PD** ◻︎ | Design system + key-screen mockups | palette/logo/tokens approved; grid mockup signed off |
| **P2** ◻︎ | Availability engine + pricing + public grid | availability + pricing unit tests (incl. DST) pass |
| **P3** ◻︎ | Booking core + `EXCLUDE` constraint + holds | **concurrency test: 2 requests → 1 wins** |
| **P4** ◻︎ | Club OS (calendar, manual booking, actions) | staff can create/move/cancel/block via API+UI |
| **P5** ◻︎ | Coaching + court+coach + coach-first | one txn books coach+court; cross-club coach conflict test |
| **P6** ◻︎ | Member account + cancellation + email | cancel per policy; freed slot reopens; email sent |
| **P7** ◻︎ | Payments (Stripe + webhooks + refunds) | payment success/fail + idempotency tests; no phantoms |
| **P8** ◻︎ | Launch hardening (E2E, security, backups, a11y) | full launch checklist (spec §24) |
| **P9** ◻︎ | Marketplace growth (post-core) | after core reliability proven |

---

## P0 — Foundation ◻︎

**Goal:** a running monorepo (Next.js web + NestJS api + shared packages), Docker Postgres/Redis, i18n, auth shell, CI.

```bash
# 1. workspace root
mkdir playslot && cd playslot
pnpm init
git init && printf "node_modules\n.env*\ndist\n.next\ncoverage\n" > .gitignore

# 2. pnpm workspace + turborepo
printf "packages:\n  - 'apps/*'\n  - 'packages/*'\n" > pnpm-workspace.yaml
pnpm add -D -w turbo typescript @types/node vitest eslint prettier

# 3. web app (Next.js + TS + Tailwind + App Router)
pnpm create next-app@latest apps/web --ts --eslint --tailwind --app --src-dir --use-pnpm --no-import-alias
pnpm --filter web add next-intl @tanstack/react-query react-hook-form zod @hookform/resolvers
# add shadcn/ui
pnpm --filter web dlx shadcn@latest init -d

# 4. api app (NestJS)
pnpm --filter . dlx @nestjs/cli new apps/api --package-manager pnpm --skip-git
pnpm --filter api add @nestjs/config prisma @prisma/client ioredis bullmq zod
pnpm --filter api add -D @types/node supertest @nestjs/testing

# 5. shared packages
mkdir -p packages/config packages/contracts packages/domain
# (create package.json + tsconfig in each; domain has NO nest/prisma deps)

# 6. local infra
cat > docker-compose.yml <<'YAML'
services:
  db:    { image: postgres:16, ports: ["5432:5432"], environment: { POSTGRES_PASSWORD: dev, POSTGRES_DB: clickandplay } }
  redis: { image: redis:7,    ports: ["6379:6379"] }
YAML
docker compose up -d

# 7. prisma init
pnpm --filter api exec prisma init --datasource-provider postgresql
```

Then: add `next-intl` middleware + `messages/{bg,en}.json` (Bulgarian default + English) with a `/[locale]/…` URL segment and a header language switch; add an `env.ts` zod schema in `packages/config` that validates env at boot; wire Auth.js shell (no providers yet); add `turbo.json` with `build`/`lint`/`test`; add GitHub Actions running `pnpm install → build → lint → test`. Establish the mobile-first baseline (viewport meta, fluid layout from 360px, ≥44px touch targets).

**Gate P0:**
```bash
pnpm install && pnpm build && pnpm test
pnpm --filter web dev   # loads /bg and /en without error; language switch works
```
✅ when build+test are green in CI, the web app renders in **both bg and en**, and the layout is usable at 360px width.

---

## P1 — Club inventory + auth + tenancy ◻︎

**Goal:** the data foundation + who-can-do-what.

```bash
# author prisma/schema.prisma from spec §5 (User, UserRole, Club, ClubMember,
#   Resource(courts), AvailabilityRule, ResourceException, City) then:
pnpm --filter api exec prisma migrate dev --name init_inventory
pnpm --filter api exec prisma generate

# seed
pnpm --filter api exec prisma db seed         # seed script per spec §23
```

Implement: Auth.js credentials (argon2) + Google/Apple; **email verification + password reset** (VerificationToken model, tokened links via Resend, `POST /auth/verify-email · /resend-verification · /forgot-password · /reset-password`, spec §13); NestJS guards for role + club membership (RBAC matrix, spec §11); club/court CRUD for CLUB_ADMIN; public read APIs (`GET /clubs`, `/clubs/:id`, `/clubs/:id/courts`).

**Gate P1:**
```bash
pnpm --filter api test -- auth              # register → verify → login; reset; expired/used token rejected
pnpm --filter api test -- tenant-isolation  # Club A cannot read Club B → passes
pnpm --filter api exec prisma migrate status # clean
```
✅ when an admin can CRUD their club/courts, public reads work, the email verify + reset flows pass, and the tenant-isolation test passes.

---

## PD — Design system + key-screen mockups ◻︎

**Goal:** lock the PlaySlot look before consumer UI is coded, so every screen is consistent. Done in parallel with backend work; no server dependency.

Deliverables (authored by the AI, reviewed by you):
- **Brand:** name lockup/logo direction, color palette (light + dark), typography pair, spacing/radius tokens.
- **Component tokens** wired into `apps/web` (Tailwind theme + shadcn tokens) so P2+ screens inherit them.
- **Mobile-first mockups** of the key screens: home/search, club profile, **the reservation grid** (the hero — states, price cells, coach overlay), coach profile, checkout, confirmation.

```bash
# tokens land in apps/web/app/globals.css (@theme) + tailwind config; verify:
pnpm --filter web build
```

**Gate PD:** palette + typography + tokens approved; the **reservation-grid mockup is signed off** (it drives P2/P3 UI). Mockups delivered as a shareable page.

---

## P2 — Availability engine + pricing + grid ◻︎

**Goal:** correct, tested availability + prices, and the read-only public grid.

Implement in `packages/domain` (pure, no framework): `generateSlots()`, `resolvePrice()` (spec §9 algorithm). Then the Nest `availability` module exposing `GET /availability` (spec §13), and the Next.js grid UI (states per spec §7, not color-only).

```bash
pnpm --filter domain test        # slot-generation + pricing + DST unit tests
pnpm --filter api test -- availability
```

**Gate P2:** availability reflects rules/blocks exactly; pricing correct server-side **including a DST-transition date**; overlapping-price-rule test yields one deterministic winner.
✅ when `pnpm --filter domain test` is green and the grid renders live server data.

---

## P3 — Booking core + concurrency (the critical phase) ◻︎

**Goal:** make double-booking impossible and prove it.

```bash
# add the exclusion constraint via a raw-SQL migration (spec §8)
pnpm --filter api exec prisma migrate dev --name reservation_exclude_constraint
# migration body:
#   CREATE EXTENSION IF NOT EXISTS btree_gist;
#   ALTER TABLE "ReservationResource" ADD CONSTRAINT no_resource_overlap
#     EXCLUDE USING gist ("resourceId" WITH =, period WITH &&) WHERE ("isActive");
#   + trigger to keep isActive synced from Reservation.status
```

Implement: reservation state machine (spec §6), the booking transaction (spec §8 steps), Redis hold + BullMQ hold-expiry job, `POST /reservations` (HOLD) + `POST /booking-holds`. Manual + online court booking (no coaches yet).

```bash
# THE gate test — fire two concurrent bookings at the same slot
pnpm --filter api test -- concurrency
```

**Gate P3 (do not pass without this):** two simultaneous requests for the same court+time → **exactly one CONFIRMED, one 409**; expired hold releases inventory; abandoned payment leaves no phantom.
✅ only when the concurrency suite is green against real Postgres.

---

## P4 — Club Operating System ◻︎

**Goal:** clubs run their day from one calendar.

Implement the calendar (FullCalendar, resource columns), manual/phone booking, and actions: move/reschedule, change court, assign/unassign coach, extend, cancel, mark paid, mark no-show, block resource — **each re-running the P3 conflict logic**. Endpoints under `/clubs/:clubId/...` (spec §13), all RBAC-guarded.

**Gate P4:** staff can create/move/cancel/block a reservation via API and UI; a manual booking and an online booking occupy identical inventory instantly; every mutation is audit-logged.

---

## P5 — Coaching ◻︎

**Goal:** coaches as resources; court+coach in one transaction; coach-first discovery.

Implement CoachProfile/CoachService/availability, court-first "add coach", and coach-first flow (spec §7/§10). A lesson writes a `ReservationResource` for coach **and** court atomically.

```bash
pnpm --filter api test -- coach-conflict   # coach free but no court, and vice versa
```

**Gate P5:** one transaction reserves coach + compatible court; a coach linked to two clubs cannot be double-booked across them (the §8 constraint proves it).

---

## P6 — Member account + cancellation ◻︎

**Goal:** the player side of the lifecycle.

Dashboard, `GET /me/reservations`, `MINE` state in the grid, cancellation via policy (spec §12/§18), transactional confirmation + reminder emails (Resend), live slot-reopen via SSE.

**Gate P6:** a player cancels within policy → correct refund computed → freed slot reopens live for other viewers; confirmation email sent.

---

## P7 — Payments ◻︎

**Goal:** online payments without phantoms.

```bash
pnpm --filter api add stripe
stripe listen --forward-to localhost:3001/api/payments/webhooks/stripe   # local webhook testing
pnpm --filter api test -- payments-idempotency
```

Implement `PaymentProvider` adapter, Stripe Checkout + Connect, signed **idempotent** webhooks, refunds tied to cancellation policy. `PENDING_PAYMENT → CONFIRMED` on webhook; `→ CANCELLED` on fail/timeout.

**Gate P7:** payment success confirms; failure/timeout releases the hold; webhook replay is idempotent; **no phantom reservations under any path**.

---

## P8 — Launch hardening ◻︎

```bash
pnpm --filter web exec playwright test    # full E2E: book court, book coach, coach-first,
                                          # concurrent race, onboarding→activation, cancel-reopen
pnpm --filter api test -- --coverage
```
Security review (RBAC, tenant, secrets, rate limits, WAF), Sentry + PostHog wired, DB backup schedule + **tested restore**, a11y + responsive review, runbooks written.

**Gate P8:** the full launch checklist (spec §24) is complete; E2E + concurrency green against a prod-equivalent Postgres.

---

## P9 — Marketplace growth (only after core is proven) ◻︎
Cross-club search, reviews, favorites, packages/memberships, public event/tournament registration. Each as its own small vertical slice with tests.

---

## 3. Everyday commands (reference)

```bash
pnpm dev                              # run web + api (turbo)
pnpm --filter web dev                 # web only
pnpm --filter api start:dev           # api only
pnpm --filter api exec prisma migrate dev --name <change>
pnpm --filter api exec prisma studio  # inspect data
pnpm test                             # all unit/integration
pnpm --filter web exec playwright test # E2E
pnpm lint && pnpm build               # pre-commit gate
docker compose up -d / down           # local Postgres+Redis
```

## 4. Definition of done (whole MVP)
All of P0–P8 Gates green + spec §24 DoD satisfied. In one line: **a trustworthy scheduling engine first, then excellent consumer and club experiences on top.**
