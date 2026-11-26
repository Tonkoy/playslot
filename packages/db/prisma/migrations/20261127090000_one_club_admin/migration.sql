-- Who runs what (Anton's decisions, 27 Nov):
--   * a club has exactly one club admin, who manages that club and its coaches;
--   * a platform admin manages every club without being a member of any;
--   * a platform admin is not a player.

-- 1. Platform admins need no club membership: the access check lets them into
--    every club. `seed:admin` used to make them CLUB_ADMIN of each club.
DELETE FROM "ClubMember" m
USING "UserRole" r
WHERE r."userId" = m."userId"
  AND r.role = 'PLATFORM_ADMIN'
  AND m.role = 'CLUB_ADMIN';

-- 2. Where a club still has several active admins, the first one named stays;
--    the others are suspended (kept, so this can be undone by hand).
UPDATE "ClubMember" m
SET status = 'SUSPENDED'
WHERE m.role = 'CLUB_ADMIN'
  AND m.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ClubMember" o
    WHERE o."clubId" = m."clubId"
      AND o.role = 'CLUB_ADMIN'
      AND o.status = 'ACTIVE'
      AND o.id < m.id
  );

-- 3. From now on the database refuses a second active admin for a club. (A
--    trigger rather than a partial unique index: Prisma cannot describe one and
--    would try to drop it in development.)
CREATE OR REPLACE FUNCTION one_active_club_admin() RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'CLUB_ADMIN' AND NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM "ClubMember"
    WHERE "clubId" = NEW."clubId"
      AND role = 'CLUB_ADMIN'
      AND status = 'ACTIVE'
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Club % already has an admin', NEW."clubId" USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_one_active_club_admin ON "ClubMember";
CREATE TRIGGER trg_one_active_club_admin
BEFORE INSERT OR UPDATE OF role, status, "clubId" ON "ClubMember"
FOR EACH ROW EXECUTE FUNCTION one_active_club_admin();

-- 4. Platform admins are not players.
DELETE FROM "UserRole" p
USING "UserRole" a
WHERE a."userId" = p."userId"
  AND a.role = 'PLATFORM_ADMIN'
  AND p.role = 'PLAYER';
