# PlaySlot — Full AI Build Specification (v3.0, definitive)

> **This is the single document to build from.** It supersedes all earlier drafts.
> **Audience:** an AI coding agent (Claude Code / Codex / Cursor) or an engineering team.
> **Read the whole file before coding.** Build in the milestone order in §22. Never violate the golden rules in §2.
> **Provenance:** a merge of a live product audit of *clickandplay.bg* (a Bulgarian multi-sport court + coach booking marketplace) and a from-principles architecture playbook — expanded to full detail with policies resolved, RBAC, API contracts, and acceptance criteria.
> **Locked decisions:** NestJS API + Next.js web · Auth.js / Better Auth · generic **Resource** model.
> **Legal:** build original UX, branding, copy, and code. Recreate *capabilities*, never proprietary source, screen designs, or copyrighted content.

---

## Table of contents
1. Mission · 2. Golden rules · 3. Stack · 4. Architecture & repo · 5. Domain model (Prisma) · 6. Reservation state machine · 7. Availability engine · 8. Booking integrity & concurrency · 9. Pricing engine · 10. Coaching · 11. RBAC / permission matrix · 12. Business policies (resolved defaults) · 13. API contracts · 14. Error contract · 15. Consumer screens & acceptance · 16. Club Operating System · 17. Payments · 18. Cancellations & refunds · 19. Notifications & jobs · 20. Cross-cutting requirements · 21. Environment & config · 22. Milestones · 23. Seed data · 24. MVP scope, DoD & launch checklist · 25. Testing strategy · 26. Master prompt · 27. First tasks

---

## 1. Mission

A **two-sided marketplace + club operating system** for booking sports courts and coaches.

- **Players** find real bookable availability across clubs, then reserve a **court**, a **court + coach in one transaction**, or pick a **coach first** and let the system find a compatible court.
- **Coaches** publish services + availability and receive bookings without manual coordination.
- **Clubs** run courts, coaches, customers, pricing, payments, and utilization from **one calendar**.
- **Platform** operates the multi-club marketplace on a shared, reliable reservation engine.

Anchor market: **Sofia + tennis + responsive web.** The engine must generalize to padel, pickleball, badminton, squash, football, rooms, and equipment **without redesign** (hence the *Resource* abstraction, §5).

The product lives or dies on **one screen**: the reservation grid. Get the engine right first.

---

## 2. Golden rules (never violate)

1. **PostgreSQL is authoritative** for availability, pricing, permissions, reservation state, payment state, cancellation eligibility, and conflict detection. Frontend math is preview only.
2. **Never trust the client.** Re-verify price, duration, availability, permissions, and payment state server-side on every mutation.
3. **Double-booking is physically impossible at the DB layer** (§8), proven by a concurrency test.
4. **One reservation may consume multiple resources** (court + coach) atomically — all or none.
5. **Times: store UTC, compute/display in the club's IANA timezone.** Use `tstzrange`. Write DST tests.
6. **Money is integer minor units (cents), never floats.** EUR default, per-club configurable.
7. **Strict multi-tenant isolation.** Club A never reads Club B's data. Enforced server-side, tested.
8. **One user, many roles.** Never split player/coach/staff into separate identities.
9. **Type-safe end to end.** TS strict; Zod-validate every input; Prisma schema is the data source of truth.
10. **All user-facing text via i18n** (`next-intl`, **Bulgarian (default) + English**) from day one. No hardcoded strings; Russian deferrable later.
11. **Small vertical slices.** Never generate the whole app at once. Per slice: inspect → confirm model+contract → implement smallest complete slice → test → report → continue.
12. **Policies are data, decided in §12** — no hardcoded guesses; anything still unknown gets `// TODO(policy):`.
13. **Never weaken tests or types to make a build pass.**

---

## 3. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Web | **Next.js 15 + React + TypeScript** | App Router, RSC, SSR for SEO slug routes |
| API | **NestJS + TypeScript** | modular monolith; clear boundaries for the heavy club OS |
| API style | **REST** (OpenAPI-documented) | simple contracts for web, mobile, admin, webhooks |
| DB | **PostgreSQL 16** | transactions, row locks, `tstzrange`, `EXCLUDE`, `btree_gist` |
| ORM | **Prisma** | schema clarity; **raw SQL allowed** for concurrency-sensitive paths |
| Cache/holds | **Redis (Upstash)** | booking holds, rate limits, BullMQ broker |
| Jobs | **BullMQ** | hold-expiry, reminders, emails, reconciliation — idempotent |
| Auth | **Auth.js (NextAuth v5) / Better Auth** | self-hosted; email/pw (argon2) + Google/Apple |
| Bot protection | **Cloudflare Turnstile** | register / club-join / booking |
| UI | **Tailwind + shadcn/ui** | no design lock-in |
| Forms | **React Hook Form + Zod** | typed validation, shared schemas |
| Server state | **TanStack Query** | availability + admin caching, optimistic grid |
| Club scheduler | **FullCalendar** (admin) · custom grid (public) | don't build drag/drop from zero |
| Time | **date-fns + date-fns-tz** | never raw Date math |
| Payments | **Stripe (+ Connect)** behind a `PaymentProvider` adapter | myPOS/MultiSport as adapters |
| Email | **Resend / Postmark** | transactional |
| Storage | **S3 / Cloudflare R2** | media, exports |
| i18n | **next-intl** (**bg default + en**) | Bulgarian + English; fixes original's mixed-language debt; ru deferrable |
| Maps | **Google Maps JS** (lazy) | club locations |
| Errors/analytics | **Sentry · PostHog** | traces, funnels, flags |
| Hosting | **Vercel** (web) · **Railway → ECS/Fargate** (api) · **Neon/Supabase** (db) | low ops early |
| DNS/CDN/WAF | **Cloudflare** | |
| Testing | **Vitest + Supertest + Playwright** | unit, API integration, E2E |
| CI/CD | **GitHub Actions** | typecheck + lint + test per PR |

**Avoid for V1:** microservices, Kubernetes, MongoDB/Firebase as the booking store, serverless-only for critical booking transactions, a custom OAuth/password platform.

---

## 4. Architecture & repository

```
Browser / Mobile Web
        │
        ▼
  Next.js Web App  ── SSR/SEO, i18n, grid UI, checkout
        │ REST
        ▼
  NestJS Modular Monolith ── domain modules, one deployable
        │
  ┌─────┼───────────┬──────────────┐
  ▼     ▼           ▼              ▼
Postgres  Redis   Object store   BullMQ workers
(truth)  (holds/  (media/exports) ├─ Email (Resend)
          cache)                  ├─ Payments (Stripe adapter)
                                  └─ Analytics (PostHog)
```

Modular monolith: strong module boundaries, one deployable. Repo:

```
playslot/
├─ apps/
│  ├─ web/            # Next.js (App Router, [locale] segment)
│  └─ api/            # NestJS
├─ packages/
│  ├─ config/         # shared tsconfig, eslint, env schema (zod)
│  ├─ contracts/      # shared DTOs / zod schemas / OpenAPI types
│  └─ domain/         # framework-free business logic (pure, unit-tested)
├─ prisma/            # schema, migrations, seed
├─ docs/AGENTS.md     # this file
└─ docker-compose.yml # postgres + redis
```

**NestJS modules:** `auth · users · clubs · resources · availability · pricing · reservations · payments · cancellations · coaching · notifications · admin · platform`.
`packages/domain/` holds slot generation, conflict rules, pricing resolution, timezone math — **imports neither Nest nor Prisma.**

---

## 5. Domain model — the Resource abstraction

A **Resource** is anything occupiable for a period. **Courts and coaches are both Resources.** A **Reservation** consumes one or more resources via **ReservationResource** join rows — this is what makes court+coach one transaction and lets equipment/rooms slot in later with no redesign.

```prisma
enum Sport { TENNIS TABLE_TENNIS BADMINTON PADEL FOOTBALL BASKETBALL
             VOLLEYBALL BEACH_TENNIS BEACH_VOLLEYBALL PICKLEBALL SQUASH }
enum ResourceType { COURT COACH EQUIPMENT ROOM }
enum Surface { CLAY HARD GRASS CARPET ARTIFICIAL_GRASS PARQUET OTHER }
enum Role { PLAYER COACH CLUB_STAFF CLUB_ADMIN PLATFORM_ADMIN }
enum ReservationType { COURT LESSON EVENT TOURNAMENT BLOCK MAINTENANCE }
enum ReservationStatus { HOLD PENDING_PAYMENT CONFIRMED COMPLETED NO_SHOW CANCELLED REFUNDED }
enum ReservationSource { WEB CLUB_STAFF COACH PLATFORM_ADMIN API }
enum PaymentMethod { ON_SITE ONLINE FREE MULTISPORT }
enum PaymentStatus { PENDING AUTHORIZED CAPTURED FAILED REFUNDED PARTIALLY_REFUNDED }

model User {
  id Int @id @default(autoincrement())
  email String @unique
  phone String?
  name String
  passwordHash String?
  emailVerifiedAt DateTime?           // set when the verification link is used (OAuth = pre-verified)
  locale String @default("bg")
  timezone String @default("Europe/Sofia")
  isVisible Boolean @default(false)   // player-directory opt-in (GDPR: default OFF)
  subscribed Boolean @default(false)
  roles UserRole[]
  memberships ClubMember[]
  coachProfile CoachProfile?
  playerProfile PlayerProfile?
  reservations Reservation[]
  createdAt DateTime @default(now())
}
model UserRole { id Int @id @default(autoincrement()) userId Int; role Role }
model PlayerProfile { id Int @id @default(autoincrement()) userId Int @unique
  gender String?; hand String?; level String?; city String? }
model VerificationToken {                // email verification + password reset
  id Int @id @default(autoincrement())
  userId Int
  tokenHash String @unique               // store a hash, never the raw token; single-use
  purpose String                          // EMAIL_VERIFY | PASSWORD_RESET
  expiresAt DateTime
  usedAt DateTime?
}

model Club {
  id Int @id @default(autoincrement())
  slug String @unique                  // localized SEO slug; 301 on drift
  name String
  address String; cityId Int
  lat Float?; lng Float?
  timezone String @default("Europe/Sofia")
  currency String @default("EUR")
  description String? @db.Text
  acceptsMultisport Boolean @default(false)
  paymentMethods PaymentMethod[]
  status String @default("PENDING")    // PENDING → platform-admin activates → ACTIVE
  resources Resource[]
  members ClubMember[]
  policies CancellationPolicy[]
  createdAt DateTime @default(now())
}
model ClubMember { id Int @id @default(autoincrement())
  clubId Int; userId Int; role Role; status String @default("ACTIVE") }

model Resource {
  id Int @id @default(autoincrement())
  clubId Int
  type ResourceType
  name String
  status String @default("ACTIVE")
  sport Sport?                         // COURT
  surface Surface?
  isIndoor Boolean?
  hasLighting Boolean?
  minReservationMin Int @default(60)
  slotIntervalMin Int @default(30)
  allowHalfHour Boolean @default(false)
  coachProfileId Int?                  // when type=COACH
  availabilityRules AvailabilityRule[]
  exceptions ResourceException[]
  priceRules PriceRule[]
  reservationResources ReservationResource[]
}

model CoachProfile {
  id Int @id @default(autoincrement())
  userId Int @unique
  bio String? @db.Text; photoUrl String?
  languages String[]; levels String[]
  services CoachService[]
  clubs CoachClub[]
}
model CoachClub { id Int @id @default(autoincrement()) coachProfileId Int; clubId Int }
model CoachService { id Int @id @default(autoincrement())
  coachProfileId Int; name String; durationMin Int
  minPlayers Int @default(1); maxPlayers Int @default(1)
  priceCents Int; courtRequired Boolean @default(true) }

model AvailabilityRule { id Int @id @default(autoincrement())
  resourceId Int; weekday Int; startMin Int; endMin Int }
model ResourceException { id Int @id @default(autoincrement())
  resourceId Int; startsAt DateTime; endsAt DateTime; reason String }

model PriceRule {
  id Int @id @default(autoincrement())
  clubId Int; resourceId Int?; serviceId Int?
  weekdayMask Int?; startMin Int?; endMin Int?
  validFrom DateTime?; validUntil DateTime?; durationMin Int?
  priceCents Int; currency String @default("EUR")
  priority Int @default(0); active Boolean @default(true) }

model Reservation {
  id Int @id @default(autoincrement())
  clubId Int; userId Int
  type ReservationType
  status ReservationStatus @default(HOLD)
  source ReservationSource
  startsAt DateTime; endsAt DateTime
  priceCents Int; currency String @default("EUR")
  paymentMethod PaymentMethod
  holdExpiresAt DateTime?
  cancellationReason String?
  resources ReservationResource[]
  payment Payment?
  participants Json?
  createdAt DateTime @default(now())
}

// ── conflict-bearing table; the EXCLUDE constraint lives HERE (§8) ──
model ReservationResource {
  id Int @id @default(autoincrement())
  reservationId Int
  resourceId Int
  period Unsupported("tstzrange")       // [startsAt, endsAt)
  isActive Boolean @default(true)       // synced from parent status via trigger
}

model Payment {
  id Int @id @default(autoincrement())
  reservationId Int @unique
  provider String; providerRef String?
  amountCents Int; currency String
  status PaymentStatus @default(PENDING)
  createdAt DateTime @default(now()); capturedAt DateTime?; refundedAt DateTime? }

model CancellationPolicy { id Int @id @default(autoincrement())
  clubId Int; appliesTo ReservationType; tiers Json }  // see §12

model AuditLog { id Int @id @default(autoincrement())
  actorUserId Int?; action String; objectType String; objectId Int
  before Json?; after Json?; at DateTime @default(now()) }

model City { id Int @id @default(autoincrement()) name String }
```

**A "slot" is never a stored row.** Slots are generated on read from availability + price rules minus occupancy. Only real reservations persist — this keeps the grid cheap at millions of rows.

---

## 6. Reservation state machine

```
                 HOLD ──(payment not required)──▶ CONFIRMED
                  │                                   │
        (payment required)                     ┌──────┴──────┐
                  ▼                             ▼             ▼
           PENDING_PAYMENT                 COMPLETED      CANCELLED
             │        │                        │             │
         success    fail/timeout           NO_SHOW      REFUNDED /
             ▼        ▼                                 PARTIAL_REFUND
         CONFIRMED  CANCELLED
```

**Transition table** (all are backend commands with permission + rule checks; each writes `AuditLog`):

| From → To | Trigger | Who | Guard |
|---|---|---|---|
| ∅ → HOLD | create booking | player, staff | availability + price re-checked in txn |
| HOLD → CONFIRMED | on-site/free method | player, staff | hold not expired |
| HOLD → PENDING_PAYMENT | online method | player | Stripe session opened |
| PENDING_PAYMENT → CONFIRMED | webhook success | system | signature verified, idempotent |
| PENDING_PAYMENT/HOLD → CANCELLED | timeout/fail | system | releases inventory |
| CONFIRMED → CANCELLED | user/staff cancel | owner, staff | policy → refund computed (§12) |
| CONFIRMED → COMPLETED | after end time | system job | |
| CONFIRMED → NO_SHOW | staff mark | staff | after start time |
| CANCELLED/COMPLETED → REFUNDED/PARTIAL | refund issued | staff, system | payment captured |

Client requests **never** set status directly.

---

## 7. Availability engine

Compute, don't pre-generate:

```
Bookable inventory =
    operating hours
  ∩ resource availability rules
  ∩ service constraints (duration, players, court_required)
  − CONFIRMED / PENDING_PAYMENT reservations
  − active HOLDs
  − maintenance / closure / event exceptions
  − incompatible duration / interval rules
```

**Lesson availability = coach availability ∩ compatible court availability.** Support both directions:
- **Court-first:** club → date/time → court → *add coach* → coaches free at that exact time.
- **Coach-first (differentiator):** coach → service → coach's free time → system finds a compatible free court (user may change it).

Slot `state` ∈ `FREE · RESERVED · MINE · UNAVAILABLE · PAST · EVENT · TOURNAMENT` (from the live grid legend). States must not be color-only — pair with icon/pattern (a11y).

---

## 8. Booking integrity & concurrency (highest-risk area)

**Flow (implement exactly):**
1. Client requests specific resources+time (or auto-assignment).
2. Open a DB transaction.
3. Validate club/resource/service state + permissions.
4. `SELECT … FOR UPDATE` to serialize the conflict check for the resources involved.
5. Re-generate the slot; re-check overlaps vs active reservations + holds; recompute price.
6. Conflict → `409 availability-changed`.
7. Insert `Reservation(status=HOLD, holdExpiresAt=now()+HOLD_TTL)` **plus one `ReservationResource` per resource** — the exclusion constraint is the final guard.
8. Commit. Set Redis hold + enqueue BullMQ hold-expiry job.
9. Payment required → `PENDING_PAYMENT` → provider checkout. Else → `CONFIRMED`.
10. Payment success → `CONFIRMED`; failure/expiry → `CANCELLED`, release inventory.

**DB-level guarantee** — because it sits on `ReservationResource`, **one constraint protects courts *and* coaches**, and "a coach can't be in two places at once" falls out for free:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- isActive is kept in sync (trigger) with parent reservation status
-- ∈ {HOLD, PENDING_PAYMENT, CONFIRMED, COMPLETED}
ALTER TABLE "ReservationResource"
  ADD CONSTRAINT no_resource_overlap
  EXCLUDE USING gist ("resourceId" WITH =, period WITH &&)
  WHERE ("isActive");
```
The second overlapping INSERT throws; catch it → `409`. Redis hold only avoids wasted Stripe sessions; the constraint is the guarantee.

**Mandatory concurrency tests:**
- Two simultaneous bookings, same court+time → exactly one CONFIRMED.
- One coach + two different courts, same time → exactly one lesson succeeds.
- Expired hold releases inventory; abandoned payment leaves no phantom reservation.

---

## 9. Pricing engine

Server-side only. Resolution algorithm (pure, in `packages/domain/pricing`):
1. Collect active `PriceRule`s where `validFrom/validUntil` covers the date, `weekdayMask` matches, `[startMin,endMin)` overlaps the slot, and (`resourceId` null or matches) and (`serviceId` null or matches).
2. Sort by `priority` DESC, then specificity (service+resource > resource > service > club-wide), then most-recent.
3. First match wins; multiply by duration where the rule is hourly.
4. If none match → club default price for the resource; if still none → error (never free by accident).

Supports peak/off-peak, weekend, seasonal, promo, package, membership. **Unit-test overlapping rules** for a single deterministic winner.

---

## 10. Coaching

Coaches are **schedulable resources** (`ResourceType.COACH` → `CoachProfile`), not static pages. Both flows from §7. A lesson gets a `ReservationResource` for the coach **and** the court, committed atomically. Coaches optional per club (live site shows "no registered coaches" for many). A coach linked to multiple clubs shares one availability — the constraint prevents cross-club double-booking automatically.

---

## 11. RBAC / permission matrix

Authentication proves identity; **backend authorization decides every action.** Hiding buttons is not security. Least privilege; every club-scoped call verifies membership+permission.

| Action | PLAYER | COACH | CLUB_STAFF | CLUB_ADMIN | PLATFORM_ADMIN |
|---|---|---|---|---|---|
| Browse clubs/availability | ✅ | ✅ | ✅ | ✅ | ✅ |
| Book / cancel own reservation | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own coach calendar | — | ✅ (self) | ✅ | ✅ | ✅ |
| Manage own coach services/availability | — | ✅ (self) | — | ✅ | ✅ |
| Create manual/phone booking (any customer) | — | — | ✅ | ✅ | ✅ |
| Move/cancel/block/mark-paid/no-show | — | — | ✅ | ✅ | ✅ |
| Edit courts / opening hours / pricing | — | — | — | ✅ | ✅ |
| Manage staff & club settings | — | — | — | ✅ | ✅ |
| View club customers/revenue/reports | — | — | ✅ (scoped) | ✅ | ✅ |
| Activate/suspend clubs, global stats | — | — | — | — | ✅ |

Cross-tenant reads are denied by default and covered by automated isolation tests. Platform-admin actions require elevated permission + audit.

---

## 12. Business policies — RESOLVED DEFAULTS (confirm, then ship)

These were the open questions. Sensible defaults are set so nothing ships stubbed; each is data/config and overridable per club. **Flagged items to confirm are marked ⚑.**

| Policy | Default | Notes |
|---|---|---|
| **Hold TTL** (`HOLD_TTL`) | **10 min** | time to complete online payment before inventory releases |
| **Cancellation (court)** | ≥24h → 100% · 12–24h → 50% · <12h → 0% | stored as `CancellationPolicy.tiers` |
| **Cancellation (lesson)** ⚑ | ≥24h → 100% · <24h → 0% | coaches' time is scarcer; confirm with clubs |
| **No-show** | staff-marked after start; **no auto-refund** | counts toward optional future no-show fees |
| **Reschedule** | allowed ≥12h before, once, no fee; re-runs conflict check | later reschedules treated as cancel+rebook |
| **Min booking lead time** | 0 (book up to slot start) | per-club overridable |
| **Max advance booking** | 14 days | per-club overridable |
| **Refund settlement** | via original PSP; async job; audit-logged | partial refunds supported |
| **MultiSport** ⚑ | treated as `PaymentMethod.MULTISPORT`, **settled offline at club** for MVP | full API settlement deferred until a partner integration exists |
| **Events/tournaments** | staff create as `EVENT`/`TOURNAMENT` reservations that occupy inventory; **public registration deferred** to §22 M9 | |
| **Notifications channel** | **email only** for MVP (Resend); SMS behind a flag | confirmation, reminder (24h), cancellation, refund |
| **Native mobile app** | **out of scope**; responsive web is the target | revisit post-launch |
| **Guest checkout** ⚑ | **not allowed** — booking requires an account | matches source site; reduces fraud/no-shows |
| **Email verification** | required **before a first confirmed booking**; browsing allowed while unverified | verification link on register + resend; 24h token; OAuth sign-ins pre-verified |
| **Password reset** | email link, **single-use, 1h token** | same token machinery as verification |
| **Overbooking/waitlist** | none in MVP | waitlist is a growth feature |

Anything still genuinely undecided in code → `// TODO(policy):`.

---

## 13. API contracts (critical endpoints in full)

Base: `/api`. All writes: Zod-validated, rate-limited, Turnstile where public, typed errors (§14). Prefer explicit command endpoints over generic CRUD where a transition carries rules.

**`GET /availability`**
```
Query: clubId, date=YYYY-MM-DD, sport?, duration?, coachRequired?
200:
{ "date":"2026-09-12","currency":"EUR",
  "courts":[{"id":706,"name":"Централен","surface":"CLAY","isIndoor":false,"hasLighting":true}],
  "slots":[{"resourceId":706,"start":"2026-09-12T18:00:00+03:00","end":"2026-09-12T19:00:00+03:00",
            "state":"FREE","priceCents":4200,"durationsMin":[60,120],
            "coachIds":[13753],"minReservationMin":60,"allowHalfHour":false}]}
```

**`POST /reservations`** (creates a HOLD)
```
Body:
{ "clubId":100, "type":"LESSON", "startsAt":"2026-09-12T18:00:00+03:00",
  "durationMin":60, "paymentMethod":"ONLINE",
  "resourceIds":[706], "coachProfileId":13753,   // coach optional
  "participants":[{"name":"…"}], "turnstileToken":"…" }
201:
{ "reservationId":9931, "status":"HOLD", "holdExpiresAt":"2026-09-12T17:10:00+03:00",
  "priceCents":4200, "currency":"EUR",
  "next": { "action":"PAY", "checkoutUrl":"https://checkout.stripe…" } }  // or action:"CONFIRMED"
409: { "error":"availability_changed", "message":"…", "refreshUrl":"/availability?…" }
```

**`POST /reservations/:id/cancel`**
```
Body: { "reason":"…" }
200: { "status":"CANCELLED", "refundCents":2100, "refundStatus":"PENDING" }
```

**`POST /reservations/:id/reschedule`** → same shape as create; re-runs conflict check.

**`POST /payments/webhooks/:provider`** → signature-verified, **idempotent**, transitions PENDING_PAYMENT→CONFIRMED or →CANCELLED.

**Auth:** `POST /auth/register` `{name,email,password,confirm,turnstileToken,acceptTerms,subscribe?,isVisible?}` (sends a verification email) · `POST /auth/verify-email {token}` · `POST /auth/resend-verification {email}` · `POST /auth/forgot-password {email}` · `POST /auth/reset-password {token,password}` · OAuth via Auth.js (OAuth accounts are pre-verified). Booking a slot requires `emailVerifiedAt` set (§12); enforce server-side, return `policy_violation` otherwise.
**Club onboarding:** `POST /clubs/join-request` `{clubName,city,phone,ownerName,email,password,acceptTerms,turnstileToken}` → creates CLUB_ADMIN + PENDING club + emails platform admin.

**Full surface:**
```
GET  /clubs · /clubs/:id · /clubs/:id/courts · /clubs/:id/coaches
GET  /availability
GET  /coaches/:id · /coaches/:id/services · /coaches/:id/availability
POST /booking-holds · /reservations
GET  /me/reservations · /reservations/:id
POST /reservations/:id/cancel · /reservations/:id/reschedule
POST /payments/checkout · /payments/webhooks/:provider
# club-scoped admin (verify membership + permission):
GET/POST/PATCH /clubs/:clubId/resources · /pricing-rules · /coaches
GET  /clubs/:clubId/calendar · /customers
POST /clubs/:clubId/reservations   PATCH /clubs/:clubId/reservations/:id
# platform:
POST /platform/clubs/:id/activate · /suspend    GET /platform/stats
```

---

## 14. Error contract

All errors return: `{ "error": <machine_code>, "message": <localized human string>, "details"?: {...} }` with the right HTTP status.

| Code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 400 | Zod failure; `details` lists fields |
| `unauthenticated` | 401 | no/invalid session |
| `forbidden` | 403 | authenticated but not permitted (RBAC/tenant) |
| `not_found` | 404 | |
| `availability_changed` | 409 | slot taken between view and submit |
| `hold_expired` | 410 | HOLD TTL passed |
| `price_mismatch` | 409 | client price ≠ server price (informational; server wins) |
| `payment_required` | 402 | online method, payment not completed |
| `rate_limited` | 429 | |
| `policy_violation` | 422 | outside cancellation/reschedule window, max-advance, etc. |
| `internal` | 500 | logged to Sentry; never leak internals |

---

## 15. Consumer screens & acceptance

| Screen | Capability | Acceptance |
|---|---|---|
| Home | location/date/duration + Court / Court+Coach / Lesson search; live counters | search routes to real availability; counters derived, not stored |
| Search results | cross-club availability; filters: surface, indoor, price, distance, coach | filtered results match DB truth; empty state handled |
| Club profile | info, courts, coaches, policies, map, availability entry | SSR + canonical slug; map lazy-loads |
| Daily/weekly grid | slot states + prices; date nav | grid == server availability; states not color-only |
| Coach directory / profile | search by club/time/level/language/price; bio, services, availability | coach-first flow reachable from here |
| Checkout | resources, service, price breakdown, policy, payment | price from server; policy shown before pay |
| Confirmation | reference, add-to-calendar, policy | email sent; reference resolvable |
| My bookings / detail | upcoming/history; status, cancel/reschedule | cancel obeys policy; freed slot reopens live |
| Auth/profile | register/login/recovery; edit profile + `isVisible` | `isVisible` defaults OFF; directory honors it |

All screens: **mobile-first & fully responsive** (design for 360px up, fluid to desktop), WCAG 2.1 AA, keyboard-navigable, localized (**bg default + en**), with a visible in-app language switch.

---

## 16. Club Operating System

The operational product that keeps inventory accurate. Sections: Dashboard · **Calendar** · Reservations · Courts · Coaches · Customers · Pricing · Payments · Events · Reports · Staff · Settings.

**Calendar:** time rows × resource columns; blocks show customer/coach/payment-status/source. Actions: create manual booking, move/reschedule, change court, assign/unassign coach, extend, cancel, mark paid, mark no-show, block resource. **Every mutation re-runs the same backend conflict logic.** Manual/phone bookings occupy identical inventory instantly.

---

## 17. Payments

`PaymentProvider` adapter interface; provider refs stay out of core reservation rules. Statuses per §5. **Verify webhooks cryptographically; handlers idempotent.** A failed/abandoned payment releases the hold and never leaves a phantom reservation. Stripe Connect for club payouts (marketplace). `ON_SITE`, `FREE`, `MULTISPORT` skip online capture; `ONLINE` runs the PENDING_PAYMENT path.

---

## 18. Cancellations & refunds

Driven by §12 policy data. Cancellation: release resources → compute refund server-side from the matching tier → update payment state → write audit → enqueue notifications. Different policies for lessons vs court-only. Refunds go through the original PSP asynchronously and are idempotent.

---

## 19. Notifications & background jobs (BullMQ)

Emit domain events **after commit**: `reservation.confirmed/cancelled/rescheduled/reminder`, `payment.completed/failed/refunded`, `coach.assignment.changed`. Jobs: **email verification, password reset,** confirmation email, 24h reminder, hold-expiry, refund settlement, reconciliation, analytics export — **all idempotent** (duplicate execution harmless). MVP channel: email (Resend); SMS behind a flag.

---

## 20. Cross-cutting requirements

- **Multi-tenancy:** every club-scoped query verifies membership+permission; isolation tests (A can't read B).
- **Time:** store UTC; interpret rules in club tz; reject ambiguous local times; DST tests.
- **SEO:** SSR club/schedule pages, canonical localized slugs, JSON-LD `SportsActivityLocation`, dynamic `sitemap.ts`, 301 on slug drift.
- **Performance:** `/availability` < 200 ms P95; grid never blocks on maps/analytics; live "just booked" to other viewers < ~2 s (SSE/Pusher).
- **Responsive / mobile:** mobile-first, fluid from 360px to desktop; touch targets ≥44px; the reservation grid scrolls horizontally within its own container on small screens (page body never scrolls sideways); test iOS Safari + Android Chrome. Responsive web is the target — no native app in MVP.
- **A11y:** WCAG 2.1 AA; keyboard-navigable grid; non-color-only states; visible focus.
- **i18n:** Bulgarian (default) + English; every string in `messages/{bg,en}.json`; locale in the URL (`/[locale]/…`); a header language switch; localized dates/prices; SEO `hreflang` alternates for bg/en.
- **Security:** argon2, CSRF on mutations, signed webhooks, rate limits, no client-side secrets, structured logs, `/health`.

---

## 21. Environment & config

```
# core
DATABASE_URL=            # Postgres (Neon/Supabase)
REDIS_URL=               # Upstash
NODE_ENV=
APP_BASE_URL=            # web
API_BASE_URL=            # api
# auth
AUTH_SECRET=
GOOGLE_CLIENT_ID/SECRET=
APPLE_CLIENT_ID/SECRET=
TURNSTILE_SITE_KEY/SECRET_KEY=
# payments
STRIPE_SECRET_KEY/WEBHOOK_SECRET/CONNECT_CLIENT_ID=
# email / storage / maps / observability
RESEND_API_KEY=  S3_* / R2_*=  GOOGLE_MAPS_API_KEY=  SENTRY_DSN=  POSTHOG_KEY=
# policy defaults (override per club in DB)
HOLD_TTL_MIN=10  MAX_ADVANCE_DAYS=14  DEFAULT_CURRENCY=EUR
```
Validate env at boot with a zod schema in `packages/config`; fail fast if missing. Secrets never in the repo.

---

## 22. Milestones (build in order; each passes its acceptance before the next)

| # | Focus | Done when |
|---|---|---|
| **0** | **Foundation** — monorepo, TS strict, Prisma+Postgres (Docker), Redis, Auth.js, next-intl (bg+en), Turnstile, CI, env validation, seed | boots in bg + en; `build`+`test` green in CI; seed loads |
| **1** | **Club inventory + auth** — User/roles, **email verification + password reset**, Club, ClubMember, Resource (courts), availability rules, exceptions; club/court CRUD + public read; tenant tests | admin creates club+courts; verify + reset flows work; A can't read B (test) |
| **D** | **Design system + mockups** — brand palette, logo direction, component tokens, mobile-first mockups of the key screens (esp. the booking grid) | design tokens live in the web app; grid mockup approved |
| **2** | **Availability + pricing** — pure availability service, PriceRule + resolution, `/availability`, consumer search + grid | grid == rules/blocks; pricing correct incl. DST date; overlapping-rule test passes |
| **3** | **Reservation core** — state machine, the `EXCLUDE` constraint, booking txn, Redis hold + BullMQ expiry, manual + online court booking | **concurrency suite proves no double-booking**; expired holds release |
| **4** | **Club OS** — calendar, reservations, customers, move/cancel/block/mark-paid/no-show | club runs its day without an external calendar |
| **5** | **Coaching** — coach profiles/services/availability, court-first + coach-first | one txn reserves coach **and** court; coach never double-booked across clubs |
| **6** | **Member account** — dashboard, my bookings (MINE), cancellation via policy, transactional email | player cancels per policy; freed slot reopens live |
| **7** | **Payments** — adapter, Stripe checkout + Connect, webhooks, refunds tied to policy | success/failure + idempotency tests pass; no phantom reservations |
| **8** | **Launch hardening** — E2E, security, tenant tests, observability, backups+restore, a11y/responsive, analytics | launch checklist (§24) complete |
| **9** | **Marketplace growth** *(post-core)* — cross-club search, reviews, favorites, packages/memberships, event registration | only after core reliability is proven |

**Timeline:** internal vertical slice in a few weeks; credible MVP ~10–14 weeks. Never skip concurrency, security, payments, or hardening to hit a date.

---

## 23. Seed / demo data (deterministic)

≥2 clubs · ≥4 courts (mixed surface/indoor) · peak + off-peak price rules · ≥3 coaches with different services/availability · confirmed + cancelled reservations + an active block · a test customer with history · a staff/admin account · **a scenario where a coach is free but no court is, and vice-versa** (to exercise both discovery flows).

---

## 24. MVP scope, Definition of Done & launch checklist

**MVP = Sofia + tennis + responsive web + court booking + coach booking + club admin.** Architect for multi-sport/multi-city; don't build every sport workflow yet.
**In:** auth+roles · clubs/courts/resources · hours+closures · pricing rules · availability search · court reservations · holds+conflict safety · cancellation · club calendar+manual booking · coach profiles/services/availability · court+coach lessons · transactional email · basic payments · basic platform admin · monitoring+backups+critical tests.
**Defer:** native apps · advanced tournaments · matchmaking · loyalty · AI recs · dynamic pricing · multi-PSP routing · BI warehouse · microservices/K8s.

**DoD:** book a court end-to-end · book court+coach as one reservation · coach-first finds a court automatically · simultaneous conflicts never create two confirmed · staff create/move/cancel/block safely · prices computed+validated server-side · cancellation/refund per stored policy · failed/abandoned payments never permanently occupy inventory · expired holds release · tenant boundaries tested · critical journeys pass E2E · errors/logs/health observable · backups exist + restore tested · mobile web usable+accessible · **no proprietary code/branding/screen copies**.

**Launch checklist:** prod domains+TLS · secrets outside repo · auth callbacks validated · webhooks verified in prod · email SPF/DKIM · backup schedule + tested restore · rate limits/WAF · Sentry releases · PostHog consent reviewed · staging/prod DBs separate · no public test creds · Playwright green vs staging · concurrency tests green vs prod-equivalent Postgres · privacy/terms/cancellation/support published · runbook for failed-payment / double-booking report / cancellation dispute / outage.

---

## 25. Testing strategy

- **Unit (Vitest, `packages/domain`):** slot generation, pricing resolution + overlapping rules, conflict rules, timezone/DST math.
- **Integration (Supertest + real Postgres):** booking transaction + `EXCLUDE` constraint, RBAC, tenant isolation, webhook idempotency, refund math.
- **E2E (Playwright):** book-a-court, book-a-coach, coach-first, **concurrent-booking race** (two requests → one wins), club onboarding→activation→visible slots, cancellation reopens slot, expired hold releases.
- CI runs typecheck + lint + unit + integration on every PR; E2E + concurrency on main/nightly.

---

## 26. Master prompt for the coding agent

> You are the lead full-stack engineer for **PlaySlot**, a multi-tenant sports court + coach booking platform. Build it per the Full AI Build Specification in `/docs/AGENTS.md`. Optimize first for **booking correctness, tenant security, maintainability, and a fast mobile experience.**
>
> Hard rules: (1) PostgreSQL is authoritative for reservations/conflicts. (2) One reservation may consume multiple resources (court + coach) atomically. (3) Never trust the client for availability, price, permissions, payment state, or cancellation eligibility — revalidate server-side. (4) Prevent double-booking **transactionally at the DB layer** (`EXCLUDE USING gist` on `ReservationResource`) and prove it with concurrency tests. (5) Strict club tenant isolation, tested. (6) Modular monolith (NestJS api + Next.js web), no microservices unless approved. (7) One user, many roles. (8) Never generate the whole app at once — work in small vertical slices. (9) Before each slice: inspect existing code+tests, define business rules + API/data changes, then implement and test. (10) Never weaken tests or type safety to make a build pass. (11) All user-facing text via next-intl. (12) Business policies come from §12; anything still unknown gets `// TODO(policy):`. (13) Build original UI/code/branding; copy no proprietary source or screen designs.
>
> Start with **Milestone 0**, then stop for review. Do not begin the booking UI until the club/resource models and availability API work. For every task, report: what changed · migrations/schema · API changes · tests run + results · security/concurrency notes · known limitations · the next smallest task.

---

## 27. First tasks to hand the agent
1. Scaffold the monorepo (apps/web, apps/api, packages/config|contracts|domain), TS/lint/format/tests, GitHub Actions, env validation (zod), Docker Compose (Postgres+Redis), local dev docs.
2. Prisma models for User/roles, Club, ClubMember, Resource (courts), availability rules, exceptions; migrations + seed (§23).
3. Auth.js integration + backend session/role/club guards + tenant-isolation tests.
4. Club/court CRUD (authorized admins) + public club/court read APIs.
5. Operating hours + exceptions, then a **pure availability domain service** before any booking mutation.
6. Pricing rules + overlapping-precedence tests.
7. Reservations + ReservationResource + holds + the `EXCLUDE` constraint + concurrency tests.
8. Only after reservation integrity passes → the first consumer court-booking vertical slice.

---

*End of specification. In one line: **build a trustworthy scheduling engine first, then wrap it in excellent consumer and club experiences.***
