-- Games organised by players: a player opens a court they booked to others.
-- A group session no longer needs a coach; it always has an organiser (the
-- coach's own user for the trainings that exist today).
ALTER TABLE "GroupSession" ALTER COLUMN "coachProfileId" DROP NOT NULL;

ALTER TABLE "GroupSession" ADD COLUMN IF NOT EXISTS "organizerUserId" INTEGER;
UPDATE "GroupSession" g
SET "organizerUserId" = c."userId"
FROM "CoachProfile" c
WHERE g."coachProfileId" = c."id" AND g."organizerUserId" IS NULL;
ALTER TABLE "GroupSession" ALTER COLUMN "organizerUserId" SET NOT NULL;
ALTER TABLE "GroupSession"
  ADD CONSTRAINT "GroupSession_organizerUserId_fkey"
  FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "GroupSession_organizerUserId_idx" ON "GroupSession"("organizerUserId");

-- 'TRAINING' | 'SPARRING'
ALTER TABLE "GroupSession" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'TRAINING';
-- 'OPEN' (a place at once) | 'APPROVAL' (the organiser lets people in)
ALTER TABLE "GroupSession" ADD COLUMN IF NOT EXISTS "joinMode" TEXT NOT NULL DEFAULT 'OPEN';
-- What priceCents means: 'FEE' (the coach's price, as until now) | 'SHARED' | 'ORGANIZER'
ALTER TABLE "GroupSession" ADD COLUMN IF NOT EXISTS "costSplit" TEXT NOT NULL DEFAULT 'FEE';

-- 'CONFIRMED' (has a place, as everyone until now) | 'PENDING' (asked to join)
ALTER TABLE "GroupSessionRegistration" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONFIRMED';
