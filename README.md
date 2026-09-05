# PlaySlot

A two-sided marketplace **and** club operating system for booking sports courts and coaches.
Anchor market: **Sofia · tennis · responsive web**, built on a generic **Resource** engine that
extends to padel, pickleball, squash, football, rooms and equipment without redesign.

> Full specification: [`docs/AGENTS.md`](docs/AGENTS.md) · Phased plan: [`docs/BUILD-ROADMAP.md`](docs/BUILD-ROADMAP.md)

## Monorepo layout

```
playslot/
├─ apps/
│  ├─ web/            # Next.js 15 (App Router, [locale] segment, next-intl)
│  └─ api/            # NestJS modular monolith
├─ packages/
│  ├─ config/         # env schema (zod), validated at boot
│  ├─ contracts/      # shared DTOs / enums / error contract
│  └─ domain/         # framework-free business logic (money, time/DST) — no Nest, no Prisma
├─ docs/              # AGENTS.md, BUILD-ROADMAP.md, design/
└─ docker-compose.yml # Postgres 16 + Redis 7
```

## Prerequisites

- **Node 20 LTS** (`.nvmrc`)
- **pnpm 9** — `corepack enable && corepack prepare pnpm@9.12.0 --activate`
- **Docker** (for local Postgres + Redis) — required from Phase 1 onward

## Getting started

```bash
pnpm install
cp .env.example .env          # fill in secrets; env is validated at boot
docker compose up -d          # Postgres + Redis (needed from Phase 1)
pnpm dev                      # web on :3000, api on :3001
```

Open http://localhost:3000 — it redirects to `/bg`; switch to `/en` with the header language toggle.

## Common commands

```bash
pnpm build        # build all packages + apps (turbo, dependency-ordered)
pnpm test         # unit/integration tests (Vitest)
pnpm typecheck    # strict TS across the workspace
pnpm lint         # ESLint (web)
pnpm dev          # run web + api in watch mode
```

## Build status

Built in phases (see the roadmap). **Phase 0 — Foundation** is in place:
monorepo + tooling + Docker infra + i18n (bg default + en) + env validation + CI +
the pure `domain` core (money in integer cents, UTC/timezone math with DST tests).

Next: **Phase 1** — Prisma schema, auth (email verification + password reset),
club/court CRUD, and tenant-isolation tests.

## Non-negotiables (see `docs/AGENTS.md` §2)

PostgreSQL is authoritative · never trust the client · double-booking impossible at the DB layer ·
store UTC / display in club timezone · money in integer minor units · strict multi-tenant isolation ·
one user many roles · type-safe end to end · all user-facing text via i18n.
