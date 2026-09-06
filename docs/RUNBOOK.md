# PlaySlot — Operations Runbook

Operational procedures for launch and incident response (spec §24).

## Backups & restore

The database is the only source of truth (golden rule §2.1). Take regular
`pg_dump` snapshots and **test the restore** — an untested backup is not a backup.

```bash
# Backup (custom format, compressed)
pnpm --filter @playslot/db db:backup           # → backups/playslot-<timestamp>.dump

# Restore into a fresh database (DANGER: overwrites the target)
DATABASE_URL=postgres://…/playslot_restore pnpm --filter @playslot/db db:restore backups/playslot-<timestamp>.dump
```

- **Schedule:** nightly full dump, retained 30 days; verify a restore weekly into a scratch DB.
- **Managed DB (Neon/Supabase):** enable point-in-time recovery in addition to logical dumps.
- **Before every migration in prod:** take a fresh dump first.

## Health & readiness

- `GET /api/health` — liveness (no I/O).
- `GET /api/health/ready` — readiness; pings the DB. Load balancers route only when `ready`.

## Incident runbooks

### Double-booking reported
Double-booking is prevented at the DB layer by the `no_resource_overlap` EXCLUDE
constraint (spec §8). If a customer reports one:
1. Confirm the constraint exists: `SELECT conname FROM pg_constraint WHERE conname='no_resource_overlap';`
2. Inspect the overlap:
   ```sql
   SELECT rr.* FROM "ReservationResource" rr WHERE rr."isActive"
    AND rr."resourceId" = <id> ORDER BY lower(rr.period);
   ```
3. It is almost certainly a *perceived* clash (a HOLD/PENDING_PAYMENT that later
   released). Check reservation statuses + `AuditLog`. If a true overlap exists,
   the constraint was dropped — restore it via the Phase 3 migration and file a bug.

### Failed / abandoned payment (once Phase 7 lands)
- A failed or timed-out online payment must leave **no** confirmed reservation.
  Holds expire via the BullMQ `booking-holds` job (`HOLD_TTL_MIN`, default 10).
- If Redis was down, expiry didn't run: find stale holds
  `SELECT id FROM "Reservation" WHERE status IN ('HOLD','PENDING_PAYMENT') AND "holdExpiresAt" < now();`
  and cancel them (they release inventory via the `isActive` trigger). The
  expiry job is idempotent, so re-enqueueing is safe.

### Cancellation / refund dispute
- Refund is computed from the club's `CancellationPolicy` tiers by hours-before-start
  (spec §12/§18); see `AuditLog` (`reservation.cancelled`) for the recorded
  `refundCents`. PSP settlement lands in Phase 7.

### Outage
1. Check `GET /api/health/ready` — if `db:down`, the DB/connection is the issue.
2. Check API + worker logs (Sentry once wired). Redis being down degrades holds
   and live SSE updates but does **not** affect the double-booking guarantee.
3. Roll back to the last green deploy; restore from backup only as a last resort.

## Rate limits & abuse
- Global: 120 req/min/IP; auth endpoints 10 req/min/IP (429 = `rate_limited`).
  Front with Cloudflare WAF in production. For multi-instance, back the throttler
  and SSE with Redis.
