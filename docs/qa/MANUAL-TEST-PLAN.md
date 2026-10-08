# PlaySlot — Manual Test Plan

Owner: **Tegav** (QA). Run against the local stack (`localhost:3000`) with
seeded data. Accounts: see `packages/db/prisma/seed.ts` (platform, club
admin, staff, player, coach1-3) and `seed-360.ts` (360 Tennis Club).

**Out of scope for now:** emails. New registrations are approved by the
platform admin: Admin → Users → find the user → **Verify email** (audited as
`user.verify_email.manual`). Email verification gets its own pass once mail
is wired.

Each scenario: ID, steps, expected result. Report results in
`docs/qa/reports/<date>.md`.

---

## P — Player

| ID | Scenario | Expected |
|---|---|---|
| P1 | Register a new player at `/register` | Account created; message says to verify email |
| P2 | Platform admin approves the account (Admin → Users → Verify email), then log in | Login works; before approval login is refused with a clear message |
| P3 | Login with wrong password / unknown email | Clear error, no hint which one is wrong |
| P4 | Home page search bar: Location / Sport / Date / Time | Results show only clubs matching all four; sport names translated |
| P5 | Search with no results (e.g. a sport no club has) | Friendly empty state, not a blank page |
| P6 | Open a club page from results | Grid of courts × hours; free/taken obvious; prices shown match the club's rules |
| P7 | Book a free slot directly (court only) | Booking confirmed; slot turns taken on the grid immediately |
| P8 | Try to book the same slot again (second tab) | Refused with a clear "already taken" message — never two bookings |
| P9 | Try to book a past slot / beyond the advance-booking limit | Not offered or refused |
| P10 | Book court + coach | One reservation containing both; coach's schedule shows it |
| P11 | My bookings (`/me/bookings`) | Booking listed with club, court, time (club timezone), price |
| P12 | Cancel a booking | Slot frees up on the grid; refund per club policy shown |
| P13 | Profile (`/me`): edit name, avatar, bio, notification settings | Saved and still there after reload |
| P14 | Favourites: add a club, see it in `/me/favorites` | Works both ways (add/remove) |
| P15 | Coaches list + coach profile | Profile shows real availability, not an empty grid |
| P16 | Language switch bg ↔ en on every page above | No raw keys, no mixed languages |
| P17 | Phone width (390px) for P4, P6, P7 | Usable, no horizontal scroll |

## C — Coach

| ID | Scenario | Expected |
|---|---|---|
| C1 | Log in as coach, open coach hub (`/me/coach`) | Hub loads with own clubs |
| C2 | Set weekly working hours (e.g. Mon-Fri 08-12, Sat 09-13) | Saved; shows on own schedule and on public profile |
| C3 | Players can only book the coach inside those hours | Times outside are not bookable |
| C4 | Weekly schedule view (`/me/schedule`) | Shows lessons booked by players, correct times |
| C5 | Export schedule (.ics) | File downloads and opens in a calendar |
| C6 | Create a group session (date, time, court, capacity, price) | Created; visible in `/sessions` |
| C7 | Invite players to the group session | Invited player sees it and can join |
| C8 | Fill the group session to capacity | Next player is refused / waitlisted |
| C9 | Coach edits profile: bio, rate, levels, languages, age groups | Saved and shown on public profile |
| C10 | Coach cannot see club admin settings or other coaches' data | Access denied |

## K — Club (club admin)

| ID | Scenario | Expected |
|---|---|---|
| K1 | Log in as club admin, open admin → own club | Only own club(s) listed |
| K2 | Club details: name, phone, photo/logo, rules, opening hours | Saved; visible on public club page |
| K3 | Courts: add/edit a court (surface, lighting, indoor) | Shows in the public grid header |
| K4 | Price rules: set hour-to-hour bands per day, e.g. Mon-Fri 07-17 = 14 €, Mon-Fri 17-23 = 16 €, Sat-Sun 07-23 = 16 € | Each grid cell shows the right price for its day and hour |
| K5 | Price preview check: Tue 10:00, Tue 18:00, Sat 10:00 | 14 / 16 / 16 € on the public grid and at checkout |
| K6 | Court-specific override (e.g. court 5 = 23 €) | Override wins only for that court |
| K7 | Block slots for a tournament/event (one or more courts, date + time range, reason) | Those slots show as unavailable; players cannot book them |
| K8 | Block that spans midnight / multiple days | Covered without gaps |
| K9 | Special day / holiday closure | Whole club unavailable that day |
| K10 | Block over an existing booking | Warned or prevented, never silent |
| K11 | Club calendar (`/admin/clubs/:id/calendar`) | Shows bookings, blocks, coach lessons; legend explains every colour |
| K12 | Admin creates a booking for a walk-in customer | Appears in calendar, slot taken on public grid |
| K13 | Team: add coach / staff by email; remove | Role works immediately after adding |
| K14 | Staff account: can manage bookings but not prices/team | Restricted correctly |
| K15 | Export reservations CSV | Opens in Excel, correct columns and euro amounts |
| K16 | Club admin of club A opens club B's admin URL directly | Access denied (tenant isolation) |

## A — Platform admin (super-admin)

| ID | Scenario | Expected |
|---|---|---|
| A1 | Log in as platform admin, open admin | Sees all clubs on the platform |
| A2 | Open any club and its settings (details, prices, blocks, team) | Full access to every club |
| A3 | Edit a setting in another club (e.g. a price) | Saved; reflected on that club's public page |
| A4 | Create a new club and assign a club admin | New admin logs in and sees only that club |
| A5 | Featured club setting | Featured club shows on home page |
| A6 | User moderation (find a user, view, suspend) | Works; suspended user cannot log in |
| A7 | Platform stats | Numbers match the seeded data |
| A8 | Verify email for an unverified user | Badge disappears; user can log in; audit log entry written; button not shown for verified users or platform admins |
