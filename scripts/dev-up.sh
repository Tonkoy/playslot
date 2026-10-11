#!/usr/bin/env bash
# Bring the local stack up: Postgres + Redis in Docker, then apply migrations.
# Usage:  ./scripts/dev-up.sh [--seed]
#
# Safe to re-run. Pass --seed to reset the demo data (this WIPES the local DB).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# ── pnpm (the repo pins a version via package.json "packageManager") ──
if ! command -v pnpm >/dev/null 2>&1; then
  say "pnpm is not on PATH — enabling it through corepack"
  command -v corepack >/dev/null 2>&1 || die "corepack is missing too. Install Node (brew install node), then re-run."
  corepack enable || die "corepack enable failed. Try: sudo corepack enable"
fi
pnpm -v >/dev/null || die "pnpm still unavailable"

# ── Docker ──
command -v docker >/dev/null 2>&1 || die "docker is not installed. Install Docker Desktop and start it."
docker info >/dev/null 2>&1 || die "Docker daemon is not running. Start Docker Desktop, wait for the whale icon, then re-run."

say "Starting Postgres and Redis (docker compose up -d)"
docker compose up -d

say "Waiting for Postgres to accept connections"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U playslot -d playslot >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  [ "$i" = "60" ] && die "Postgres did not become ready in 60s. Check: docker compose logs db"
  sleep 1
done

say "Installing workspace dependencies"
pnpm install

say "Applying database migrations (also regenerates the Prisma client)"
pnpm --filter @playslot/db migrate

if [ "${1:-}" = "--seed" ]; then
  say "Re-seeding demo data (this wipes the local database)"
  pnpm --filter @playslot/db seed
fi

say "Migration status"
pnpm --filter @playslot/db migrate:status || true

cat <<EOF

Done. Next:
  pnpm dev                              # web on :3000, api on :3001
  pnpm --filter @playslot/api test      # API suite (needs the DB above)
  pnpm --filter @playslot/web e2e       # Playwright (first time: npx playwright install chromium)

Repo: $ROOT
EOF
