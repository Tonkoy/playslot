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

## Transactional email (SendGrid)

Four designed emails go out as SendGrid **dynamic templates**. The HTML lives in
`apps/api/src/mail/templates/` (one shell + one body per email) and is uploaded
from the repo, so every environment has the same templates and nothing is
hand-edited in the SendGrid UI.

| Email | Template file | Sent when |
|---|---|---|
| Регистрация / добре дошли | `welcome.html` | the user confirms their email |
| Потвърждение на имейл | `verify-email.html` | registration, and "resend verification" |
| Заявка за резервация | `booking-received.html` | a player books at a club that confirms bookings |
| Потвърдена резервация | `booking-confirmed.html` | club staff press "Потвърди" (or a booking is auto-confirmed) |

### One-time setup

1. **Sender.** SendGrid → Settings → Sender Authentication. Either verify a
   single sender (fast, for testing) or authenticate the `playslot.bg` domain
   (required for production volume). Put the result in `MAIL_FROM`, e.g.
   `MAIL_FROM="PlaySlot <no-reply@playslot.bg>"`.
2. **API key.** Settings → API Keys → Create API Key, with **Mail Send** and
   **Template Engine** permissions. Put it in `.env` as `SENDGRID_API_KEY`.
   The key is shown once — store it in the password manager too.
3. **Upload the templates and record their ids:**
   ```
   pnpm --filter @playslot/api mail:sync
   ```
   It prints `SENDGRID_TEMPLATE_*=d-…` lines; paste them into `.env`.
4. Optional: `MAIL_PROVIDER=sendgrid` pins the transport. Without it the
   provider is chosen by which key is present (SendGrid, then Resend, then the
   console logger).

### Day-to-day

- `pnpm --filter @playslot/api mail:preview` renders the four templates to
  `apps/api/.mail-preview/*.html` with sample data — no network, no sending.
- `pnpm --filter @playslot/api mail:test -- --to you@example.com` sends one of
  each to a real inbox. Add `--only booking_confirmed` for a single email.
- Changing copy in the templates: edit the HTML, run `mail:sync` again. Each run
  adds a new active version in SendGrid, so the old one stays in its history.
- **Without template ids the app still sends** — it falls back to the plain
  inline HTML in `MailService`. A missing id degrades the design, never the
  delivery.

### Copy of every booking to the platform inbox

`PLATFORM_NOTIFY_EMAIL` (set to `info@playslot.bg`) gets one email per new
booking: club, time, court, customer, coach, price, reference, and whether the
slot is confirmed or still waiting for the club. It is sent for player
bookings, staff walk-ins and online-paid bookings alike, and again when a club
confirms a pending one. Leave the variable empty to switch it off; if that
address is also a club member, the copy is skipped so nobody gets it twice.

### Two-step booking

A club can require confirmation (club admin → Управление → "Потвърждение на
резервации"). With it on, a player's on-site booking is created as
`PENDING_APPROVAL`: the slot is held (the no-overlap constraint counts it), the
player gets "заявката е получена", and staff see a **Потвърди** button on the
calendar entry. Confirming sends "потвърдена резервация". Online-paid bookings
are unaffected — payment confirms them, as before.
